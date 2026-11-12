<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import {
    dfuCancelable,
    dfuSession,
    dismissDfuSession,
    requestDfuCancel,
  } from "#lib/stores/dfuSession";

  /**
   * Firmware-update progress that outlives the device route. Rendered inside the
   * app header so it stays visible on every page while a transfer runs.
   */
  function phaseLabel(phase: string, percent: number): string {
    if (phase === "selecting_package") return "Choose a firmware package in the file picker.";
    if (phase === "staging") return "Copying the selected file into app storage.";
    if (phase === "downloading") return "Downloading and checking the Kongle release package.";
    if (phase === "transfer" && percent === 100)
      return "Transfer complete; waiting for the watch to acknowledge the image.";
    if (phase === "validating") return "Transfer complete; the watch is verifying the image.";
    if (phase === "applying") return "Image verified; requesting a trial boot.";
    if (phase === "activation_requested")
      return "Trial boot requested; closing the Bluetooth session.";
    return `${phase.replaceAll("_", " ")} (${percent}%)`;
  }

  function cancellationHint(phase: string): string {
    if (phase === "selecting_package") return "Cancel if the picker does not open.";
    if (phase === "downloading") return "Keep Furu open until the download finishes.";
    return "Keep Furu open and stay near the watch.";
  }

  function cancel(): void {
    requestDfuCancel();
    void invoke("ble_dfu_cancel").catch(() => {});
  }
</script>

{#if $dfuSession}
  <div
    class="flex items-start justify-between gap-3 rounded-lg border border-primary-500 bg-primary-950 p-3 text-sm"
    role="status"
    aria-live="polite"
  >
    <div class="min-w-0 flex-1 space-y-1">
      <p class="m-0 font-medium">
        Firmware update for {$dfuSession.deviceName}
        {#if $dfuSession.outcome === "running"}
          (in progress)
        {:else if $dfuSession.outcome === "success"}
          (complete)
        {:else}
          (failed)
        {/if}
      </p>
      {#if $dfuSession.outcome === "running"}
        <p class="m-0 text-surface-700-300">
          {phaseLabel($dfuSession.phase, $dfuSession.percent)}
          {cancellationHint($dfuSession.phase)}
        </p>
        {#if $dfuSession.phase !== "selecting_package" && $dfuSession.phase !== "downloading"}
          <progress
            class="h-1.5 w-full accent-[color:var(--color-primary-500)]"
            max={100}
            value={$dfuSession.percent}
          ></progress>
        {/if}
      {:else if $dfuSession.outcome === "success"}
        <p class="m-0 text-surface-700-300">
          Activation was requested. Reconnect to check the watch; Furu cannot confirm
          installation.
        </p>
      {:else}
        <p class="m-0 text-error-700-300">
          {$dfuSession.error ?? "The update did not finish."}
        </p>
      {/if}
    </div>
    {#if $dfuSession.outcome === "running" && $dfuCancelable}
      <button class="btn btn-sm preset-tonal-surface shrink-0" type="button" onclick={cancel}>
        Cancel
      </button>
    {:else if $dfuSession.outcome !== "running"}
      <button
        class="btn btn-sm preset-tonal-surface shrink-0"
        type="button"
        onclick={dismissDfuSession}
        aria-label="Dismiss firmware update result"
      >
        Dismiss
      </button>
    {/if}
  </div>
{/if}
