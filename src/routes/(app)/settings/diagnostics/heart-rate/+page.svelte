<script lang="ts">
  import { save } from "@tauri-apps/plugin-dialog";
  import { writeTextFile } from "@tauri-apps/plugin-fs";
  import { Activity, Download, Square, Trash2 } from "@lucide/svelte";
  import {
    captureActive,
    captureAddress,
    captureError,
    captureSamples,
    captureToCsv,
    captureToJson,
    resetCapture,
    startCapture,
    stopCapture,
  } from "#lib/stores/heartRateCapture";
  import { localFileStamp } from "#lib/utils/timestamp";
  import { connected, selectedAddress } from "#lib/stores/bleSession";
  import { toastCaught, toastSuccess } from "#lib/stores/toast";
  import Card from "#lib/components/ui/Card.svelte";
  import PageHeading from "#lib/components/ui/PageHeading.svelte";

  let busy = $state(false);

  const counts = $derived.by(() => {
    const totals = { measurement: 0, diagnostics: 0, quality: 0 };
    for (const sample of $captureSamples) totals[sample.source] += 1;
    return totals;
  });

  async function toggle(): Promise<void> {
    if (busy) return;
    busy = true;
    try {
      if ($captureActive) {
        await stopCapture();
        toastSuccess("Capture stopped", `${$captureSamples.length} samples recorded.`);
      } else if (!$connected || !$selectedAddress) {
        toastCaught("Connect a watch first", "Capture needs an active Bluetooth session.");
      } else {
        await startCapture($selectedAddress);
      }
    } catch (error) {
      toastCaught("Capture failed", error);
    } finally {
      busy = false;
    }
  }

  async function exportAs(format: "csv" | "json"): Promise<void> {
    if (!$captureSamples.length) return;
    const stamp = localFileStamp(new Date());
    try {
      const path = await save({
        defaultPath: `furu-hr-capture-${stamp}.${format}`,
        filters: [{ name: format.toUpperCase(), extensions: [format] }],
      });
      if (!path) return;
      await writeTextFile(path, format === "csv" ? captureToCsv() : captureToJson());
      toastSuccess("Capture saved", path);
    } catch (error) {
      toastCaught("Could not save the capture", error);
    }
  }
</script>

<div class="grid gap-4">
  <PageHeading
    title="Heart-rate capture"
    description="Record the raw bytes the watch sends, then analyse them offline."
  />

  <Card>
    <p class="m-0 text-sm text-surface-700-300">
      Furu records every SIG Heart Rate measurement and every Kongle diagnostics
      notification with a timestamp. Nothing is uploaded; the file stays on this phone.
      Start a measurement on the watch after recording begins.
    </p>

    <div class="mt-4 flex flex-wrap gap-2">
      <button
        class={`btn gap-1.5 ${$captureActive ? "preset-filled-error-500" : "preset-filled-primary-500"}`}
        type="button"
        disabled={busy}
        onclick={() => void toggle()}
      >
        {#if $captureActive}
          <Square class="size-4" />
          Stop recording
        {:else}
          <Activity class="size-4" />
          Start recording
        {/if}
      </button>
      <button
        class="btn preset-tonal-surface gap-1.5"
        type="button"
        disabled={!$captureSamples.length}
        onclick={() => void exportAs("csv")}
      >
        <Download class="size-4" />
        Save CSV
      </button>
      <button
        class="btn preset-tonal-surface gap-1.5"
        type="button"
        disabled={!$captureSamples.length}
        onclick={() => void exportAs("json")}
      >
        <Download class="size-4" />
        Save JSON
      </button>
      <button
        class="btn preset-tonal-surface gap-1.5"
        type="button"
        disabled={!$captureSamples.length}
        onclick={resetCapture}
      >
        <Trash2 class="size-4" />
        Clear
      </button>
    </div>

    {#if $captureActive}
      <p class="m-0 mt-3 text-xs text-success-700-300" role="status">
        Recording{$captureAddress ? ` from ${$captureAddress}` : ""}…
      </p>
    {:else if $captureSamples.length}
      <p class="m-0 mt-3 text-xs text-surface-700-300">
        Stopped. {$captureSamples.length} samples: {counts.measurement} measurements,
        {counts.diagnostics} diagnostics, {counts.quality} quality reads.
      </p>
    {/if}

    {#if $captureError}
      <p class="m-0 mt-3 text-xs text-warning-700-300" role="alert">{$captureError}</p>
    {/if}
  </Card>

  {#if $captureSamples.length}
    <Card title="Latest samples" description="Newest first. The exported file holds everything.">
      <div class="max-h-72 overflow-y-auto font-mono text-xs preset-filled-surface-950-50 rounded-lg p-3">
        {#each $captureSamples.slice(-40).reverse() as sample (`${sample.tMs}-${sample.source}-${sample.hex}`)}
          <div class="whitespace-pre-wrap break-words py-px">
            {String(sample.tMs).padStart(7, " ")}ms {sample.source.padEnd(11, " ")} {sample.hex}
          </div>
        {/each}
      </div>
    </Card>
  {/if}

  <Card title="What the bytes mean">
    <dl class="m-0 grid gap-2 text-sm">
      <div>
        <dt class="m-0 font-medium">Measurement (0x2A37)</dt>
        <dd class="m-0 text-surface-700-300">
          Byte 0 is the flags; the rate follows, 8 or 16 bit depending on bit 0.
          Kongle sends flags 0x00 while idle with a zero rate.
        </dd>
      </div>
      <div>
        <dt class="m-0 font-medium">Diagnostics</dt>
        <dd class="m-0 text-surface-700-300">
          20 bytes: version, phase, BPM, error, sample count and gain, PPG and ambient
          counters, one-second min/max, elapsed milliseconds.
        </dd>
      </div>
    </dl>
  </Card>
</div>
