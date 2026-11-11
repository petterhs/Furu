<script lang="ts">
  import { listen } from "@tauri-apps/api/event";
  import { invoke } from "@tauri-apps/api/core";
  import { appCacheDir, join } from "@tauri-apps/api/path";
  import { open } from "@tauri-apps/plugin-dialog";
  import { BaseDirectory, mkdir, open as openFile, remove, writeFile } from "@tauri-apps/plugin-fs";
  import { Download, Package } from "@lucide/svelte";
  import { FeatureId, ProfileId } from "#lib/bleContract";
  import { DFU_ABORTED, DFU_FILE_LIMITS, readBoundedDfuFile, withDfuCancellation } from "#lib/dfuFile";
  import { appSettings } from "#lib/stores/appSettings";
  import {
    activeProfileId,
    batteryPercent,
    connectingAddress,
    disconnectAfterDfu,
    logBleDiagnostic,
  } from "#lib/stores/bleSession";
  import { confirm } from "#lib/stores/confirm";
  import {
    beginDfuSession,
    clearDfuSession,
    dfuInProgress,
    dfuSession,
    endDfuSession,
    finishDfuSession,
    getDfuAbortSignal,
    updateDfuProgress,
  } from "#lib/stores/dfuSession";
  import { toastError } from "#lib/stores/toast";
  import { DFU_STAGING_DIR, friendlyDfuPhase } from "./dfuPhases";
  import Card from "#lib/components/ui/Card.svelte";

  type Props = {
    /** Stable device id used for the session record. */
    deviceId: string;
    deviceName: string;
    /** True when this device is connected and the profile allows OTA. */
    canFlash: boolean;
    /** True when connected but the profile lacks the DFU feature. */
    missingFeature: boolean;
    /** True when this device is the one currently connected. */
    isConnected: boolean;
  };

  let { deviceId, deviceName, canFlash, missingFeature, isConnected }: Props = $props();

  type FirmwareRelease = {
    id: number;
    tagName: string;
    notes: string;
    htmlUrl: string;
    publishedAt: string | null;
    prerelease: boolean;
    size: number;
  };

  let releases = $state<FirmwareRelease[]>([]);
  let loading = $state(false);
  let catalogueError = $state<string | null>(null);
  let releaseLimit = $state(3);

  const busy = $derived($dfuInProgress);
  const session = $derived($dfuSession?.deviceId === deviceId ? $dfuSession : null);
  const visibleReleases = $derived(
    releases
      .filter((release) => !release.prerelease || $appSettings.firmwareDevelopmentChannel)
      .slice(0, releaseLimit),
  );
  const totalMatching = $derived(
    releases.filter((release) => !release.prerelease || $appSettings.firmwareDevelopmentChannel).length,
  );

  async function refreshReleases(): Promise<void> {
    loading = true;
    catalogueError = null;
    try {
      releases = await invoke<FirmwareRelease[]>("firmware_list_releases");
    } catch (error) {
      catalogueError = String(error);
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    void refreshReleases();
  });

  /** A cache-directory suffix only needs to be unique; WebViews may lack crypto.randomUUID(). */
  function newSessionId(): string {
    const bytes = new Uint8Array(16);
    if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
      crypto.getRandomValues(bytes);
      return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
    }
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  }

  /**
   * Copy a picked file into app storage with a normal path.
   * Android `content://` URIs are not openable from Rust `std::fs`.
   */
  async function stagePickedFile(
    sourcePath: string,
    destFileName: keyof typeof DFU_FILE_LIMITS,
    sessionDir: string,
    signal: AbortSignal,
    progressStart: number,
    progressEnd: number,
  ): Promise<string> {
    const startedAt = performance.now();
    logBleDiagnostic(`DFU: opening selected ${destFileName} from the file picker`);
    const opened = await withDfuCancellation(openFile(sourcePath, { read: true }), signal);
    if (opened === DFU_ABORTED) throw new Error("DFU_CANCELLED");
    const file = opened;
    let bytes: Uint8Array;
    try {
      const limit = DFU_FILE_LIMITS[destFileName];
      bytes = await readBoundedDfuFile(file, limit, {
        signal,
        onProgress: (read) => {
          const fraction = Math.min(1, read / limit);
          updateDfuProgress("staging", progressStart + Math.floor(fraction * (progressEnd - progressStart)));
        },
      });
      logBleDiagnostic(
        `DFU: read ${bytes.length} bytes of ${destFileName} in ${Math.round(performance.now() - startedAt)} ms`,
      );
    } finally {
      await file.close();
    }
    if (signal.aborted) throw new Error("DFU_CANCELLED");
    await mkdir(sessionDir, { baseDir: BaseDirectory.AppCache, recursive: true });
    const relative = `${sessionDir}/${destFileName}`;
    await writeFile(relative, bytes, { baseDir: BaseDirectory.AppCache });
    logBleDiagnostic(`DFU: staged ${destFileName} in ${Math.round(performance.now() - startedAt)} ms`);
    if (signal.aborted) throw new Error("DFU_CANCELLED");
    updateDfuProgress("staging", progressEnd);
    return join(await appCacheDir(), relative);
  }

  async function confirmFlash(): Promise<boolean> {
    const batteryLine =
      $batteryPercent !== null
        ? `Battery: ${$batteryPercent}% — use a charger if it is low.`
        : "Battery level unknown — charge the watch before updating.";
    const body = [
      "This flashes firmware over Bluetooth using Nordic legacy DFU. A wrong file or an interrupted update can make the watch unusable.",
      "Stay nearby, keep Furu open, and do not disconnect until the transfer finishes.",
      ...($activeProfileId === ProfileId.infinitime
        ? [
            "On the watch, check Settings → Firmware and validate the current InfiniTime image first. InfiniTime can erase the rollback copy when updating from an unvalidated trial image.",
          ]
        : []),
      batteryLine,
    ];
    return confirm({
      title: "Before you flash",
      body,
      confirmLabel: "Choose firmware",
    });
  }

  async function startUpdate(release: FirmwareRelease | null = null): Promise<void> {
    if (!canFlash || $connectingAddress) return;
    if (!beginDfuSession(deviceId, deviceName)) return;

    let unlisten: (() => void) | undefined;
    let keepResult = false;
    let nativeTransferAttempted = false;
    let activationRequested = false;
    let sessionDir: string | null = null;
    const dfuProfile = $activeProfileId;
    const signal = getDfuAbortSignal();
    if (!signal) {
      endDfuSession();
      return;
    }

    try {
      sessionDir = `${DFU_STAGING_DIR}/${newSessionId()}`;
      if (!(await confirmFlash()) || signal.aborted) return;

      let path: string;
      if (release) {
        updateDfuProgress("downloading", 0);
        logBleDiagnostic(`DFU: downloading Kongle ${release.tagName} from GitHub Releases`);
        const download = await withDfuCancellation(
          invoke<string>("firmware_download_release", { releaseId: release.id }),
          signal,
        );
        if (download === DFU_ABORTED || signal.aborted) return;
        path = download;
      } else {
        const pickerStartedAt = performance.now();
        logBleDiagnostic("DFU: opening ZIP picker");
        const first = await withDfuCancellation(
          open({
            multiple: false,
            title: "Select DFU ZIP package",
            filters: [{ name: "DFU ZIP", extensions: ["zip"] }],
          }),
          signal,
        );
        logBleDiagnostic(
          `DFU: picker returned in ${Math.round(performance.now() - pickerStartedAt)} ms (${first === null ? "cancelled" : "selection"})`,
        );
        if (first === DFU_ABORTED || first === null || signal.aborted) return;
        path = Array.isArray(first) ? first[0] : first;
        if (!path) return;
      }

      if (!release) updateDfuProgress("staging", 0);
      const input = {
        zipPath: release
          ? path
          : await stagePickedFile(path, "package.zip", sessionDir, signal, 0, 50),
      };
      if (signal.aborted) return;

      unlisten = await listen<{ phase: string; percent: number }>("dfu-progress", (event) => {
        updateDfuProgress(event.payload.phase, event.payload.percent);
      });
      if (signal.aborted) return;
      updateDfuProgress("starting", 0);
      // A reboot or failed transfer may drop GATT before activation reaches JS.
      nativeTransferAttempted = true;
      await invoke("ble_dfu_flash_package", { input });
      activationRequested = true;
      finishDfuSession("success");
      keepResult = true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logBleDiagnostic(`DFU: error: ${message}`);
      if (signal.aborted || /cancel(?:led|ed)/i.test(message)) return;
      const guidance =
        dfuProfile === ProfileId.kongle && /rejected opcode 0x01 \(status 0x05\)/i.test(message)
          ? "Kongle refused to start the update (0x01/0x05). If it shows “Trial: reset reverts”, reset it to restore the previous firmware. Otherwise check that the installed Kongle was built with ota-activation."
          : message;
      finishDfuSession("error", guidance);
      toastError("Firmware update failed", guidance);
      keepResult = true;
    } finally {
      unlisten?.();
      endDfuSession();
      if (nativeTransferAttempted) await disconnectAfterDfu(activationRequested);
      if (sessionDir) {
        void remove(sessionDir, { baseDir: BaseDirectory.AppCache, recursive: true }).catch(() => {});
      }
      if (release) {
        void remove(`${DFU_STAGING_DIR}/release-${release.id}.zip`, { baseDir: BaseDirectory.AppCache }).catch(() => {});
      }
      if (!keepResult) clearDfuSession();
    }
  }
</script>

<Card title="Firmware update" description="Install a published Kongle build or a package you downloaded yourself.">
  {#if missingFeature}
    <p class="m-0 text-sm text-surface-700-300">
      OTA needs the <code class="font-mono">infinitime.dfu</code> feature on this device's
      profile. Add it under Settings → Device Profiles.
    </p>
  {:else if !isConnected}
    <p class="m-0 text-sm text-surface-700-300">
      Connect this watch to install firmware.
    </p>
  {:else}
    <fieldset class="border-0 p-0" disabled={busy}>
      <div class="flex items-center justify-between gap-2">
        <p class="m-0 text-xs font-semibold uppercase tracking-wide text-surface-700-300">
          Kongle releases
        </p>
        <button
          class="btn btn-xs preset-tonal-surface"
          type="button"
          disabled={loading}
          onclick={() => void refreshReleases()}
        >
          {loading ? "Checking…" : "Refresh"}
        </button>
      </div>

      {#if catalogueError}
        <p class="m-0 mt-2 text-sm text-error-700-300" role="alert">
          Could not check releases: {catalogueError}
        </p>
      {:else if !loading && visibleReleases.length === 0}
        <p class="m-0 mt-2 text-sm text-surface-700-300">
          {#if $appSettings.firmwareDevelopmentChannel}
            No Kongle previews have been published yet. PR artifacts stay in GitHub Actions
            until a development release is tagged.
          {:else}
            No stable Kongle releases yet. Enable development firmware in Settings to see
            published previews.
          {/if}
        </p>
      {/if}

      <div class="mt-2 grid gap-2">
        {#each visibleReleases as release (release.id)}
          <div class="rounded-lg border border-surface-200-800 p-3">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div class="min-w-0">
                <p class="m-0 text-sm font-semibold">
                  Kongle {release.tagName}
                  {#if release.prerelease}
                    <span class="badge preset-tonal-warning ml-1 text-[10px]">development</span>
                  {/if}
                </p>
                {#if release.publishedAt}
                  <p class="m-0 text-xs text-surface-700-300">
                    {new Date(release.publishedAt).toLocaleDateString()}
                  </p>
                {/if}
              </div>
              <button
                class="btn btn-sm preset-tonal-primary gap-1.5"
                type="button"
                disabled={busy || Boolean($connectingAddress)}
                onclick={() => void startUpdate(release)}
              >
                <Download class="size-3.5" />
                Install
              </button>
            </div>
            {#if release.notes}
              <details class="mt-2 text-sm">
                <summary class="cursor-pointer text-surface-700-300">Changelog</summary>
                <pre class="mb-0 mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words text-xs">{release.notes}</pre>
              </details>
            {/if}
          </div>
        {/each}
      </div>

      {#if visibleReleases.length < totalMatching}
        <button
          class="btn btn-sm preset-tonal-surface mt-2 w-full justify-center"
          type="button"
          onclick={() => (releaseLimit += 10)}
        >
          Show more releases
        </button>
      {/if}
    </fieldset>

    <div class="mt-4 border-t border-surface-200-800 pt-3">
      <p class="m-0 text-xs font-semibold uppercase tracking-wide text-surface-700-300">
        Local package
      </p>
      <button
        class="btn btn-sm preset-tonal-primary mt-2 w-full justify-center gap-1.5"
        type="button"
        disabled={busy || Boolean($connectingAddress)}
        onclick={() => void startUpdate()}
      >
        <Package class="size-3.5" />
        {busy ? "Update in progress…" : "Choose DFU ZIP…"}
      </button>
    </div>

    {#if session}
      <div class="mt-3 space-y-2">
        {#if session.outcome === "running"}
          <p class="m-0 text-sm">
            {friendlyDfuPhase(session.phase)}
            <span class="tabular-nums text-surface-700-300">({session.percent}%)</span>
          </p>
          {#if session.phase !== "selecting_package" && session.phase !== "downloading"}
            <progress class="h-2 w-full accent-[color:var(--color-primary-500)]" max={100} value={session.percent}></progress>
          {/if}
          <p class="m-0 text-xs text-surface-700-300">
            The watch shows the bootloader's own step; this percentage counts bytes sent from
            the phone and often will not match. Cancel is best-effort and can take a few seconds.
          </p>
        {:else if session.outcome === "success"}
          <p class="m-0 text-sm text-success-700-300">
            Firmware validated and activation requested. Reconnect and check the version.
            Kongle trial firmware can revert on reset; Furu has not verified installation.
          </p>
        {:else if session.error}
          <div class="min-w-0 space-y-2 text-sm text-error-700-300" role="alert">
            <p class="m-0 font-medium">Firmware update failed.</p>
            <details class="min-w-0 rounded-lg border border-error-700-300/40 p-2">
              <summary class="cursor-pointer">Technical details</summary>
              <pre class="mb-0 mt-2 max-h-40 max-w-full overflow-auto whitespace-pre-wrap break-words font-mono text-xs">{session.error}</pre>
            </details>
          </div>
        {/if}
      </div>
    {/if}
  {/if}
</Card>
