<script lang="ts">
  import { goto } from "$app/navigation";
  import { onDestroy } from "svelte";
  import Battery from "@lucide/svelte/icons/battery";
  import Footprints from "@lucide/svelte/icons/footprints";
  import Heart from "@lucide/svelte/icons/heart";
  import Settings from "@lucide/svelte/icons/settings";
  import { LineChart } from "layerchart";
  import { page } from "$app/state";
  import { invoke } from "@tauri-apps/api/core";
  import { listen } from "@tauri-apps/api/event";
  import { appCacheDir, join } from "@tauri-apps/api/path";
  import { open } from "@tauri-apps/plugin-dialog";
  import { BaseDirectory, mkdir, open as openFile, remove, writeFile } from "@tauri-apps/plugin-fs";
  import { batteryHistoryByDevice, batteryHistoryHydrated } from "$lib/stores/batteryHistory";
  import {
    connectionHistoryByDevice,
    connectionHistoryHydrated,
    connectionSegmentsForRange,
  } from "$lib/stores/connectionHistory";
  import { profilePreferenceIncludesDeviceInformation } from "$lib/deviceProfileEffective";
  import {
    DFU_ABORTED,
    DFU_FILE_LIMITS,
    readBoundedDfuFile,
    withDfuCancellation,
  } from "$lib/dfuFile";
  import { FeatureId } from "$lib/bleContract";
  import {
    activeFeatureIds,
    batteryPercent,
    connected,
    connectError,
    connectTo,
    connectingAddress,
    deviceInformation,
    deviceInformationError,
    deviceInformationLoading,
    disconnectDevice,
    disconnectAfterDfu,
    heartRateBpm,
    refreshDeviceInformationNow,
    selectedAddress,
    stepCount,
  } from "$lib/stores/bleSession";
  import { deviceProfileCatalog } from "$lib/stores/deviceProfiles";
  import { forgetRememberedDevice, rememberedDevices } from "$lib/stores/devices";
  import {
    beginDfuSession,
    clearDfuSession,
    dfuInProgress,
    dfuSession,
    endDfuSession,
    finishDfuSession,
    getDfuAbortSignal,
    updateDfuProgress,
  } from "$lib/stores/dfuSession";
  import { addressFromDeviceId, bleAddressesEqual, findRememberedByDeviceRouteParam } from "$lib/utils/deviceId";

  const deviceId = $derived(page.params.deviceId ?? "");
  const resolvedAddress = $derived(addressFromDeviceId(deviceId));
  const known = $derived(findRememberedByDeviceRouteParam(deviceId, $rememberedDevices));
  /** Use stored id in child links so History/Settings URLs match `RememberedDevice.id` (encoded address). */
  const routeDeviceKey = $derived(known?.id ?? deviceId);
  const isCurrentDevice = $derived(
    Boolean(known?.address && $selectedAddress && bleAddressesEqual($selectedAddress, known.address) && $connected),
  );
  const isConnectingDevice = $derived(
    Boolean($connectingAddress && bleAddressesEqual($connectingAddress, resolvedAddress)),
  );
  const isConnectErrorForDevice = $derived(
    Boolean($connectError && bleAddressesEqual($connectError.address, resolvedAddress)),
  );

  const showDeviceInfoSection = $derived(
    known ? profilePreferenceIncludesDeviceInformation(known.profilePreference, $deviceProfileCatalog) : false,
  );
  const canShowLiveDeviceInfo = $derived(showDeviceInfoSection && isCurrentDevice);

  type RangeKey = "1d" | "3d" | "7d";
  const RANGE_MS: Record<RangeKey, number> = {
    "1d": 24 * 60 * 60 * 1000,
    "3d": 3 * 24 * 60 * 60 * 1000,
    "7d": 7 * 24 * 60 * 60 * 1000,
  };
  let selectedRange = $state<RangeKey>("3d");

  let dfuBusy = $derived($dfuInProgress);
  let dfuStatus = $derived($dfuSession?.deviceId === (known?.id ?? deviceId) ? $dfuSession : null);
  let dfuConfirmation = $state<{ batteryLine: string; resolve: (confirmed: boolean) => void } | null>(null);

  const canDfu = $derived(isCurrentDevice && $activeFeatureIds.includes(FeatureId.infinitimeDfu));
  const allSamplesForDevice = $derived((known ? ($batteryHistoryByDevice[known.id] ?? []) : []));
  const rangeStartMs = $derived(Date.now() - RANGE_MS[selectedRange]);
  const filteredSamples = $derived(
    allSamplesForDevice.filter((sample) => Date.parse(sample.at) >= rangeStartMs),
  );
  const chartPoints = $derived(
    filteredSamples.map((sample) => ({ time: new Date(sample.at), percent: sample.percent })),
  );
  /** Aligns connection strip with battery chart window (both use the range buttons). */
  const rangeEndMs = $derived(Date.now());
  const rangeSpanMs = $derived(Math.max(1, rangeEndMs - rangeStartMs));

  const connectionEventsForDevice = $derived(known ? ($connectionHistoryByDevice[known.id] ?? []) : []);
  const connectionSegments = $derived(
    connectionSegmentsForRange(connectionEventsForDevice, rangeStartMs, rangeEndMs),
  );

  /** Compact label like "Sun 12" (saves width on narrow screens). */
  function formatShortDayLabel(d: Date): string {
    const weekday = d.toLocaleDateString(undefined, { weekday: "short" });
    return `${weekday} ${d.getDate()}`;
  }

  /** Calendar-day bands (local) for the date row above the timeline (hidden for 1W — axis shows days). */
  function connectionTimelineDayBands(
    startMs: number,
    endMs: number,
    range: RangeKey,
  ): { start: number; end: number; label: string }[] {
    const bands: { start: number; end: number; label: string }[] = [];
    let dayStart = new Date(startMs);
    dayStart = new Date(dayStart.getFullYear(), dayStart.getMonth(), dayStart.getDate());
    let t = dayStart.getTime();
    const compact = range === "7d";
    while (t < endMs) {
      const next = t + 24 * 60 * 60 * 1000;
      const segStart = Math.max(startMs, t);
      const segEnd = Math.min(endMs, next);
      if (segEnd > segStart) {
        bands.push({
          start: segStart,
          end: segEnd,
          label: compact
            ? formatShortDayLabel(new Date(t))
            : new Date(t).toLocaleDateString(undefined, {
                weekday: "short",
                month: "short",
                day: "numeric",
              }),
        });
      }
      t = next;
    }
    return bands;
  }

  /** Local midnights stepped by `hours` (4 or 8) from the first boundary at/after `startMs`. */
  function connectionTimelineHourGridTicks(startMs: number, endMs: number, hours: number): number[] {
    const start = new Date(startMs);
    const sod = new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime();
    let t = sod;
    const step = hours * 60 * 60 * 1000;
    while (t + step <= startMs) t += step;
    while (t < startMs) t += step;
    const out: number[] = [];
    while (t <= endMs) {
      out.push(t);
      t += step;
    }
    return out;
  }

  /** Vertical lines at each local midnight in the range (for 1W). */
  function connectionTimelineDayBoundaryTicks(startMs: number, endMs: number): number[] {
    const start = new Date(startMs);
    let t = new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime();
    if (t < startMs) t += 24 * 60 * 60 * 1000;
    const out: number[] = [];
    while (t <= endMs) {
      out.push(t);
      t += 24 * 60 * 60 * 1000;
    }
    return out;
  }

  function formatConnectionTimelineClock(ms: number): string {
    const d = new Date(ms);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }

  function formatTimelineAxisTick(ms: number, range: RangeKey): string {
    if (range === "7d") return formatShortDayLabel(new Date(ms));
    return formatConnectionTimelineClock(ms);
  }

  const timelineGridStepHours = $derived(
    selectedRange === "1d" ? 4 : selectedRange === "3d" ? 8 : null,
  );

  const timelineTicks = $derived(
    selectedRange === "7d"
      ? connectionTimelineDayBoundaryTicks(rangeStartMs, rangeEndMs)
      : connectionTimelineHourGridTicks(
          rangeStartMs,
          rangeEndMs,
          selectedRange === "3d" ? 8 : 4,
        ),
  );

  const timelineDayBands = $derived(connectionTimelineDayBands(rangeStartMs, rangeEndMs, selectedRange));
  const timelineTickLabelStep = $derived(
    timelineTicks.length > 36 ? 3 : timelineTicks.length > 22 ? 2 : 1,
  );

  const DFU_STAGING_DIR = "dfu-import";

  /** A cache-directory suffix only needs to be unique; WebViews may lack crypto.randomUUID(). */
  function newDfuSessionId(): string {
    const bytes = new Uint8Array(16);
    if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
      crypto.getRandomValues(bytes);
      return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
    }
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  }

  /**
   * Copy the file the user picked into the app cache with a normal path.
   * Android/content:// and similar URIs are not openable from Rust `std::fs`; plugin-fs resolves them.
   */
  async function stagePickedFileForRust(
    sourcePath: string,
    destFileName: keyof typeof DFU_FILE_LIMITS,
    sessionDir: string,
    signal: AbortSignal,
    progressStart: number,
    progressEnd: number,
  ): Promise<string> {
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
    } finally {
      await file.close();
    }
    if (signal.aborted) throw new Error("DFU_CANCELLED");
    await mkdir(sessionDir, { baseDir: BaseDirectory.AppCache, recursive: true });
    const rel = `${sessionDir}/${destFileName}`;
    await writeFile(rel, bytes, { baseDir: BaseDirectory.AppCache });
    if (signal.aborted) throw new Error("DFU_CANCELLED");
    updateDfuProgress("staging", progressEnd);
    return join(await appCacheDir(), rel);
  }

  function friendlyDfuPhase(phase: string): string {
    const map: Record<string, string> = {
      selecting_package: "Choose a firmware package",
      staging: "Copying selected files into app storage",
      starting: "Starting",
      init_packet: "Init packet",
      priming: "Priming",
      transfer: "Transferring firmware",
      validating: "Validating firmware on the watch",
      applying: "Requesting activation (watch may reboot)",
      activation_requested: "Activation requested",
    };
    return map[phase] ?? phase;
  }

  function requestDfuConfirmation(batteryLine: string): Promise<boolean> {
    return new Promise((resolve) => {
      dfuConfirmation = { batteryLine, resolve };
    });
  }

  function finishDfuConfirmation(confirmed: boolean): void {
    const pending = dfuConfirmation;
    dfuConfirmation = null;
    pending?.resolve(confirmed);
  }

  onDestroy(() => finishDfuConfirmation(false));

  async function onDfuStart(packageKind: "zip" | "bin"): Promise<void> {
    if (!canDfu || $connectingAddress || !beginDfuSession(known?.id ?? deviceId, known?.name ?? "PineTime")) return;
    let unlisten: (() => void) | undefined;
    let keepResult = false;
    let activationRequested = false;
    let sessionDir: string | null = null;
    const signal = getDfuAbortSignal();
    if (!signal) {
      endDfuSession();
      return;
    }
    try {
      sessionDir = `${DFU_STAGING_DIR}/${newDfuSessionId()}`;
      const batteryLine =
        $batteryPercent !== null
          ? `Battery: ${$batteryPercent}% (use a charger if low).`
          : "Battery: unknown — charge the watch before updating.";
      const ok = await requestDfuConfirmation(batteryLine);
      if (!ok || signal.aborted) return;

      const pickerStartedAt = performance.now();
      const first = await withDfuCancellation(open({
        multiple: false,
        title: packageKind === "zip" ? "Select DFU ZIP package" : "Select firmware (.bin)",
        filters: [packageKind === "zip"
          ? { name: "DFU ZIP", extensions: ["zip"] }
          : { name: "Firmware (.bin)", extensions: ["bin"] }],
      }), signal);
      if (import.meta.env.DEV) {
        console.info(`[DFU] Android package picker returned after ${Math.round(performance.now() - pickerStartedAt)} ms`);
      }
      if (first === DFU_ABORTED || first === null || signal.aborted) return;
      const path = Array.isArray(first) ? first[0] : first;
      if (!path) return;

      let datPath: string | undefined;
      if (packageKind === "bin") {
        const datPick = await withDfuCancellation(open({
          multiple: false,
          title: "Select init packet (.dat)",
          filters: [{ name: "Init packet", extensions: ["dat"] }],
        }), signal);
        if (datPick === DFU_ABORTED || datPick === null || signal.aborted) return;
        datPath = Array.isArray(datPick) ? datPick[0] : datPick;
        if (!datPath) return;
      }

      let input: { zipPath?: string; firmwareBinPath?: string; initDatPath?: string };
      updateDfuProgress("staging", 0);
      if (packageKind === "bin" && datPath !== undefined) {
        input = {
          firmwareBinPath: await stagePickedFileForRust(path, "firmware.bin", sessionDir, signal, 0, 45),
          initDatPath: await stagePickedFileForRust(datPath, "init.dat", sessionDir, signal, 45, 50),
        };
      } else {
        input = { zipPath: await stagePickedFileForRust(path, "package.zip", sessionDir, signal, 0, 50) };
      }
      if (signal.aborted) return;

      unlisten = await listen<{ phase: string; percent: number }>("dfu-progress", (e) => {
        updateDfuProgress(e.payload.phase, e.payload.percent);
      });
      if (signal.aborted) return;
      updateDfuProgress("starting", 0);
      await invoke("ble_dfu_flash_package", { input });
      activationRequested = true;
      finishDfuSession("success");
      keepResult = true;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (signal.aborted || /cancel(?:led|ed)/i.test(message)) return;
      finishDfuSession("error", message);
      keepResult = true;
    } finally {
      unlisten?.();
      if (sessionDir) {
        await remove(sessionDir, { baseDir: BaseDirectory.AppCache, recursive: true }).catch(() => {});
      }
      endDfuSession();
      if (activationRequested) await disconnectAfterDfu();
      if (!keepResult) clearDfuSession();
    }
  }

  async function onForget(): Promise<void> {
    if (dfuBusy || !known) return;
    const confirmed = window.confirm(
      `Forget ${known.name}? This removes the device and its local data.`,
    );
    if (!confirmed) return;
    if (isCurrentDevice) {
      await disconnectDevice();
    }
    if (!(await forgetRememberedDevice(known.id))) return;
    await goto("/home");
  }
</script>

<section class="grid min-w-0 gap-4">
  <article class="card border border-[color:var(--color-surface-200-800)] p-4 preset-tonal-surface">
    <div class="mb-3 flex items-center justify-between gap-2">
      <h2 class="m-0 text-base font-semibold">Device</h2>
      <a
        class="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[color:var(--color-primary-600)] bg-[color:var(--color-primary-500)] text-white no-underline"
        href={`/device/${routeDeviceKey}/settings`}
        aria-label="Open device settings"
      >
        <Settings class="size-4 text-white" />
      </a>
    </div>
    {#if known}
      <p class="m-0"><strong>{known.name}</strong></p>
      <p class="m-0 mt-2 font-mono text-sm">{known.address}</p>
      {#if isCurrentDevice && ($batteryPercent !== null || $stepCount !== null || $activeFeatureIds.includes(FeatureId.bleHr))}
        <div class="mt-2 flex flex-col gap-1 text-sm">
          {#if $batteryPercent !== null}
            <p class="m-0 flex items-center gap-1">
              <Battery class="size-4 shrink-0" />
              {$batteryPercent}%
            </p>
          {/if}
          {#if $stepCount !== null}
            <p class="m-0 flex items-center gap-1">
              <Footprints class="size-4 shrink-0" />
              {$stepCount.toLocaleString()} steps
            </p>
          {/if}
          {#if $activeFeatureIds.includes(FeatureId.bleHr)}
            <p class="m-0 flex items-center gap-1">
              <Heart class="size-4 shrink-0" />
              {$heartRateBpm !== null ? $heartRateBpm : '--'} bpm
            </p>
          {/if}
        </div>
      {/if}
      <p class="m-0 mt-2 text-sm text-[color:var(--color-surface-700-300)]">
        Last seen: {new Date(known.lastSeenAt).toLocaleString()}
      </p>
    {:else}
      <p class="m-0 font-mono text-sm">{resolvedAddress}</p>
    {/if}
  </article>

  {#if known && showDeviceInfoSection}
    <article class="card border border-[color:var(--color-surface-200-800)] p-4 preset-tonal-surface">
      <h2 class="m-0 mb-3 text-base font-semibold">Device information</h2>
      {#if !canShowLiveDeviceInfo}
        <p class="m-0 text-sm text-[color:var(--color-surface-700-300)]">
          Connect to this device to read Bluetooth Device Information (GATT).
        </p>
      {:else if $deviceInformationError}
        <p class="m-0 text-sm text-[color:var(--color-error-700-300)]">{$deviceInformationError}</p>
        <button
          class="btn btn-sm preset-tonal-primary mt-2"
          type="button"
          onclick={() => void refreshDeviceInformationNow()}
        >
          Retry
        </button>
      {:else if $deviceInformation}
        {@const di = $deviceInformation}
        <div class="max-w-2xl overflow-x-auto">
          <table class="w-full border-collapse text-left text-sm">
            <tbody class="divide-y divide-[color:var(--color-surface-200-800)]">
              <tr>
                <th
                  scope="row"
                  class="w-[40%] max-w-[11rem] py-2 pr-4 align-top font-normal text-[color:var(--color-surface-700-300)]"
                >
                  Manufacturer
                </th>
                <td class="py-2 font-medium">{di.manufacturerName?.trim() ? di.manufacturerName : "—"}</td>
              </tr>
              <tr>
                <th
                  scope="row"
                  class="w-[40%] max-w-[11rem] py-2 pr-4 align-top font-normal text-[color:var(--color-surface-700-300)]"
                >
                  Model
                </th>
                <td class="py-2 font-medium">{di.modelNumber?.trim() ? di.modelNumber : "—"}</td>
              </tr>
              <tr>
                <th
                  scope="row"
                  class="w-[40%] max-w-[11rem] py-2 pr-4 align-top font-normal text-[color:var(--color-surface-700-300)]"
                >
                  Serial number
                </th>
                <td class="py-2 font-mono text-xs sm:text-sm">{di.serialNumber?.trim() ? di.serialNumber : "—"}</td>
              </tr>
              <tr>
                <th
                  scope="row"
                  class="w-[40%] max-w-[11rem] py-2 pr-4 align-top font-normal text-[color:var(--color-surface-700-300)]"
                >
                  Firmware
                </th>
                <td class="py-2 font-medium">{di.firmwareRevision?.trim() ? di.firmwareRevision : "—"}</td>
              </tr>
              <tr>
                <th
                  scope="row"
                  class="w-[40%] max-w-[11rem] py-2 pr-4 align-top font-normal text-[color:var(--color-surface-700-300)]"
                >
                  Hardware
                </th>
                <td class="py-2 font-medium">{di.hardwareRevision?.trim() ? di.hardwareRevision : "—"}</td>
              </tr>
              <tr>
                <th
                  scope="row"
                  class="w-[40%] max-w-[11rem] py-2 pr-4 align-top font-normal text-[color:var(--color-surface-700-300)]"
                >
                  Software
                </th>
                <td class="py-2 font-medium">{di.softwareRevision?.trim() ? di.softwareRevision : "—"}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <button
          class="btn btn-xs preset-tonal-surface mt-3"
          type="button"
          onclick={() => void refreshDeviceInformationNow()}
        >
          Refresh
        </button>
      {:else}
        <p class="m-0 text-sm text-[color:var(--color-surface-700-300)]">Loading…</p>
      {/if}
    </article>
  {/if}

  <article class="card border border-[color:var(--color-surface-200-800)] p-4 preset-tonal-surface">
    <h2 class="m-0 mb-3 text-base font-semibold">Actions</h2>
    <div class="grid gap-4">
      <div>
        <p class="m-0 mb-2 text-xs font-semibold uppercase tracking-wide text-[color:var(--color-surface-700-300)]">Connection</p>
        <div class="flex flex-wrap gap-2">
          {#if isCurrentDevice}
            <button class="btn btn-sm preset-tonal-surface" type="button" disabled={dfuBusy} onclick={() => { if (!dfuBusy) void disconnectDevice(); }}>
              Disconnect
            </button>
          {:else}
            <button
              class="btn btn-sm preset-filled-primary-500"
              type="button"
              onclick={() => { if (!dfuBusy) void connectTo(resolvedAddress); }}
              disabled={isConnectingDevice || dfuBusy}
            >
              {isConnectingDevice ? "Connecting…" : "Connect"}
            </button>
          {/if}
          <button class="btn btn-sm preset-tonal-error" type="button" disabled={dfuBusy} onclick={() => void onForget()}>
            Forget
          </button>
        </div>
      </div>
      {#if isCurrentDevice && canDfu}
        <div class="border-t border-[color:var(--color-surface-200-800)] pt-4">
          <h3 class="m-0 text-sm font-semibold">Firmware update</h3>
          <p class="m-0 mt-1 text-sm text-[color:var(--color-surface-700-300)]">Choose a package format. Review the safety check first, then select your firmware in Android’s file picker.</p>
          <div class="mt-3 grid gap-2 sm:grid-cols-2">
            <button class="btn btn-sm preset-tonal-primary" type="button" disabled={dfuBusy || Boolean($connectingAddress)} onclick={() => void onDfuStart("zip")}>
              {dfuBusy ? "Update in progress…" : "Choose DFU ZIP…"}
            </button>
            <button class="btn btn-sm preset-tonal-surface" type="button" disabled={dfuBusy || Boolean($connectingAddress)} onclick={() => void onDfuStart("bin")}>
              Choose BIN + init DAT…
            </button>
          </div>
        </div>
      {:else if isCurrentDevice}
        <p class="m-0 text-sm text-[color:var(--color-surface-700-300)]">
          OTA requires the <span class="font-mono">infinitime.dfu</span> feature on this device’s profile (Settings → Device Profiles).
        </p>
      {/if}
    </div>
    {#if dfuStatus}
      <div class="mt-3 max-w-xl space-y-2">
        {#if dfuStatus.outcome === "running"}
          <p class="m-0 text-sm">
            {friendlyDfuPhase(dfuStatus.phase) || "…"}
            <span class="tabular-nums text-[color:var(--color-surface-700-300)]">({dfuStatus.percent}%)</span>
          </p>
          {#if dfuStatus.phase !== "selecting_package"}
            <progress class="h-2 w-full accent-[color:var(--color-primary-500)]" max={100} value={dfuStatus.percent}></progress>
          {/if}
          <p class="m-0 text-xs text-[color:var(--color-surface-700-300)]">
            The watch shows the bootloader’s own step; the percentage here is bytes sent from the phone and often will not
            match. Transfer speed is limited by Bluetooth — stay close. Cancel is best-effort and may take a few seconds.
          </p>
        {:else if dfuStatus.outcome === "success"}
          <p class="m-0 text-sm text-[color:var(--color-success-700-300)]">Firmware validated and activation requested. Reconnect and check the firmware version, then confirm the trial firmware on the watch. Installation has not been verified by Furu.</p>
        {:else if dfuStatus.error}
          <div class="min-w-0 space-y-2 text-sm text-[color:var(--color-error-700-300)]" role="alert">
            <p class="m-0 font-medium">Firmware update failed.</p>
            <details class="min-w-0 rounded-md border border-[color:var(--color-error-700-300)]/40 p-2">
              <summary class="cursor-pointer">Technical details</summary>
              <pre class="mb-0 mt-2 max-h-40 max-w-full overflow-auto whitespace-pre-wrap break-words font-mono text-xs">{dfuStatus.error}</pre>
            </details>
          </div>
        {/if}
      </div>
    {/if}
    {#if isConnectErrorForDevice}
      <p class="m-0 mt-3 text-sm text-[color:var(--color-error-700-300)]">{$connectError?.message}</p>
    {/if}
  </article>

  <article class="card border border-[color:var(--color-surface-200-800)] p-4 preset-tonal-surface">
    <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
      <h2 class="m-0 text-base font-semibold">Battery Trend</h2>
      <div class="inline-flex items-center gap-1 rounded-md border border-[color:var(--color-surface-300-700)] p-1">
        <button
          class={`btn btn-xs ${selectedRange === "1d" ? "preset-filled-primary-500" : "preset-tonal-surface"}`}
          type="button"
          onclick={() => (selectedRange = "1d")}
        >
          1D
        </button>
        <button
          class={`btn btn-xs ${selectedRange === "3d" ? "preset-filled-primary-500" : "preset-tonal-surface"}`}
          type="button"
          onclick={() => (selectedRange = "3d")}
        >
          3D
        </button>
        <button
          class={`btn btn-xs ${selectedRange === "7d" ? "preset-filled-primary-500" : "preset-tonal-surface"}`}
          type="button"
          onclick={() => (selectedRange = "7d")}
        >
          1W
        </button>
      </div>
    </div>

    {#if !$batteryHistoryHydrated}
      <p class="m-0 text-sm text-[color:var(--color-surface-700-300)]">Loading battery history...</p>
    {:else if !known}
      <p class="m-0 text-sm text-[color:var(--color-surface-700-300)]">Unknown remembered device.</p>
    {:else if !chartPoints.length}
      <p class="m-0 text-sm text-[color:var(--color-surface-700-300)]">
        No battery samples for this range yet. Connect the device to collect data.
      </p>
    {:else}
      <div class="h-56 rounded border border-[color:var(--color-surface-300-700)] bg-[color:var(--color-surface-50-950)] p-2">
        <LineChart
          data={chartPoints}
          x="time"
          y="percent"
          yDomain={[0, 100]}
          xDomain={[new Date(rangeStartMs), new Date(rangeEndMs)]}
          height={200}
          axis={true}
          grid={true}
          points={false}
          rule={false}
          props={{
            spline: { stroke: "var(--color-primary-500)", strokeWidth: 2.5 },
            xAxis: {
              ticks: 4,
              format: (v: Date) => v.toLocaleDateString(),
              classes: {
                tickLabel: "fill-[color:var(--color-surface-700-300)]",
                tick: "stroke-[color:var(--color-surface-500-500)]",
                rule: "stroke-[color:var(--color-surface-500-500)]",
              },
            },
            yAxis: {
              ticks: [0, 25, 50, 75, 100],
              format: (v: number) => `${v}%`,
              classes: {
                tickLabel: "fill-[color:var(--color-surface-700-300)]",
                tick: "stroke-[color:var(--color-surface-500-500)]",
                rule: "stroke-[color:var(--color-surface-500-500)]",
              },
            },
            grid: {
              class: "stroke-[color:var(--color-surface-400-600)]",
            },
          }}
        />
      </div>
    {/if}
  </article>

  <article
    class="card max-w-full min-w-0 overflow-x-hidden border border-[color:var(--color-surface-200-800)] p-4 preset-tonal-surface"
  >
    <div class="mb-3 flex min-w-0 flex-wrap items-center justify-between gap-2">
      <h2 class="m-0 text-base font-semibold">Connection timeline</h2>
      <p class="m-0 max-w-full text-xs text-[color:var(--color-surface-700-300)]">
        Same range as battery chart · local time
      </p>
    </div>
    {#if !$connectionHistoryHydrated}
      <p class="m-0 text-sm text-[color:var(--color-surface-700-300)]">Loading connection history…</p>
    {:else if !known}
      <p class="m-0 text-sm text-[color:var(--color-surface-700-300)]">Unknown remembered device.</p>
    {:else if !connectionSegments.length}
      <p class="m-0 text-sm text-[color:var(--color-surface-700-300)]">
        No connection events in this range yet. Connect and disconnect to build the timeline.
      </p>
    {:else}
      <p class="m-0 mb-2 flex min-w-0 flex-wrap gap-x-4 gap-y-1 text-xs text-[color:var(--color-surface-700-300)]">
        <span class="inline-flex items-center gap-1">
          <span class="inline-block h-2 w-4 shrink-0 rounded-sm bg-[color:var(--color-success-500)]" aria-hidden="true"
          ></span>
          Connected
        </span>
        <span class="inline-flex items-center gap-1">
          <span
            class="inline-block h-2 w-4 shrink-0 rounded-sm bg-[color:var(--color-surface-400-600)]"
            aria-hidden="true"
          ></span>
          Disconnected
        </span>
        {#if timelineTickLabelStep > 1 && timelineGridStepHours !== null}
          <span class="text-[color:var(--color-surface-600-400)]">
            Time labels every {timelineTickLabelStep * timelineGridStepHours}h (dense range)
          </span>
        {/if}
      </p>

      <div class="min-w-0 max-w-full">
        {#if selectedRange !== "7d"}
          <div
            class="mb-1 flex w-full min-w-0 max-w-full border-b border-[color:var(--color-surface-300-700)] pb-1 text-[color:var(--color-surface-700-300)]"
            aria-hidden="true"
          >
            {#each timelineDayBands as band (band.start)}
              <div
                class="min-w-0 truncate text-center text-[10px] font-medium leading-tight sm:text-[11px]"
                style="flex: {band.end - band.start} 1 0"
              >
                {band.label}
              </div>
            {/each}
          </div>
        {/if}

        <div
          class="relative w-full min-w-0 max-w-full overflow-hidden rounded-md border border-[color:var(--color-surface-300-700)] bg-[color:var(--color-surface-50-950)]"
        >
          <!-- Vertical grid (4h / 8h / midnight by range) -->
          {#each timelineTicks as tick (tick)}
            {@const pct = ((tick - rangeStartMs) / rangeSpanMs) * 100}
            <div
              class="pointer-events-none absolute bottom-0 top-0 z-20 w-px bg-[color:var(--color-surface-400-600)] opacity-70"
              style="left: {pct}%"
              aria-hidden="true"
            ></div>
          {/each}
          <div
            class="pointer-events-none absolute bottom-0 left-0 top-0 z-20 w-px bg-[color:var(--color-surface-400-600)] opacity-70"
            aria-hidden="true"
          ></div>
          <div
            class="pointer-events-none absolute bottom-0 right-0 top-0 z-20 w-px bg-[color:var(--color-surface-400-600)] opacity-70"
            aria-hidden="true"
          ></div>

          <div
            class="relative z-10 h-7 w-full min-w-0 max-w-full border-b border-[color:var(--color-surface-300-700)]/60"
          >
            {#each timelineTicks as tick, ti (tick)}
              {@const pct = ((tick - rangeStartMs) / rangeSpanMs) * 100}
              {#if ti % timelineTickLabelStep === 0}
                <span
                  class="absolute top-1 max-w-[2.75rem] -translate-x-1/2 truncate text-center text-[10px] tabular-nums text-[color:var(--color-surface-700-300)] sm:max-w-[3.25rem]"
                  style="left: {pct}%"
                  title={formatTimelineAxisTick(tick, selectedRange)}
                >
                  {formatTimelineAxisTick(tick, selectedRange)}
                </span>
              {/if}
            {/each}
          </div>

          <div
            class="relative z-10 flex h-5 w-full min-w-0 max-w-full"
            role="img"
            aria-label="Connection state over time for the selected range"
          >
            {#each connectionSegments as seg, i (i)}
              {@const dur = seg.endMs - seg.startMs}
              {#if dur > 0}
                <div
                  class="h-full min-w-px {seg.connected
                    ? 'bg-[color:var(--color-success-500)]'
                    : 'bg-[color:var(--color-surface-400-600)]'}"
                  style="flex-grow: {Math.max(dur, 1)}"
                  title="{seg.connected ? 'Connected' : 'Disconnected'}: {new Date(
                    seg.startMs,
                  ).toLocaleString()} → {new Date(seg.endMs).toLocaleString()}"
                ></div>
              {/if}
            {/each}
          </div>
        </div>
      </div>
    {/if}
  </article>

</section>

{#if dfuConfirmation}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
    <div
      class="card w-full max-w-md border border-[color:var(--color-surface-200-800)] p-5 shadow-xl preset-tonal-surface"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="dfu-confirm-title"
      aria-describedby="dfu-confirm-description"
      tabindex="-1"
    >
      <h2 id="dfu-confirm-title" class="m-0 text-lg font-semibold">Before you flash</h2>
      <div id="dfu-confirm-description" class="mt-3 space-y-2 text-sm">
        <p class="m-0">This will flash firmware over Bluetooth using Nordic legacy DFU. A wrong file or interrupted update can make the watch unusable.</p>
        <p class="m-0">Stay nearby, keep Furu open, and do not disconnect until the transfer finishes.</p>
        <p class="m-0 font-medium">{dfuConfirmation.batteryLine}</p>
      </div>
      <div class="mt-5 flex justify-end gap-2">
        <button class="btn btn-sm preset-tonal-surface" type="button" onclick={() => finishDfuConfirmation(false)}>
          Cancel
        </button>
        <button class="btn btn-sm preset-filled-primary-500" type="button" onclick={() => finishDfuConfirmation(true)}>
          Choose firmware
        </button>
      </div>
    </div>
  </div>
{/if}
