<script lang="ts">
  import {
    RANGE_MS,
    formatTimelineAxisTick,
    connectionTimelineDayBands,
    timelineGridStepHours,
    timelineTickLabelStep,
    timelineTicksFor,
    type RangeKey,
  } from "#lib/deviceHistory";
  import type { ConnectionHistorySegment } from "#lib/types/connectionHistory";
  import Card from "#lib/components/ui/Card.svelte";

  type Props = {
    segments: readonly ConnectionHistorySegment[];
    hydrated: boolean;
    known: boolean;
    range: RangeKey;
    nowMs: number;
  };

  let { segments, hydrated, known, range, nowMs }: Props = $props();

  const rangeStartMs = $derived(nowMs - RANGE_MS[range]);
  const rangeSpanMs = $derived(Math.max(1, nowMs - rangeStartMs));
  const ticks = $derived(timelineTicksFor(range, rangeStartMs, nowMs));
  const dayBands = $derived(connectionTimelineDayBands(rangeStartMs, nowMs, range));
  const labelStep = $derived(timelineTickLabelStep(ticks.length));
  const gridHours = $derived(timelineGridStepHours(range));
</script>

<Card title="Connection timeline" description="Same range as the battery chart, in local time.">
  {#if !hydrated}
    <p class="m-0 text-sm text-surface-700-300">Loading connection history…</p>
  {:else if !known}
    <p class="m-0 text-sm text-surface-700-300">This device is not in Furu's device list.</p>
  {:else if !segments.length}
    <p class="m-0 text-sm text-surface-700-300">
      No connection events in this range yet. Connect and disconnect to build the timeline.
    </p>
  {:else}
    <p class="m-0 mb-2 flex min-w-0 flex-wrap gap-x-4 gap-y-1 text-xs text-surface-700-300">
      <span class="inline-flex items-center gap-1">
        <span class="inline-block h-2 w-4 shrink-0 rounded-sm bg-success-500" aria-hidden="true"></span>
        Connected
      </span>
      <span class="inline-flex items-center gap-1">
        <span class="inline-block h-2 w-4 shrink-0 rounded-sm bg-surface-400-600" aria-hidden="true"></span>
        Disconnected
      </span>
      {#if labelStep > 1 && gridHours !== null}
        <span class="text-surface-600-400">
          Labels every {labelStep * gridHours}h
        </span>
      {/if}
    </p>

    <div class="min-w-0 max-w-full">
      {#if range !== "7d"}
        <div
          class="mb-1 flex w-full min-w-0 max-w-full border-b border-surface-300-700 pb-1 text-surface-700-300"
          aria-hidden="true"
        >
          {#each dayBands as band (band.start)}
            <div
              class="min-w-0 truncate text-center text-[10px] font-medium leading-tight sm:text-[11px]"
              style="flex: {band.end - band.start} 1 0"
            >
              {band.label}
            </div>
          {/each}
        </div>
      {/if}

      <div class="relative w-full min-w-0 max-w-full overflow-hidden rounded-lg border border-surface-300-700 bg-surface-50-950">
        {#each ticks as tick (tick)}
          {@const pct = ((tick - rangeStartMs) / rangeSpanMs) * 100}
          <div
            class="pointer-events-none absolute bottom-0 top-0 z-20 w-px bg-surface-400-600 opacity-70"
            style="left: {pct}%"
            aria-hidden="true"
          ></div>
        {/each}
        <div class="pointer-events-none absolute bottom-0 left-0 top-0 z-20 w-px bg-surface-400-600 opacity-70" aria-hidden="true"></div>
        <div class="pointer-events-none absolute bottom-0 right-0 top-0 z-20 w-px bg-surface-400-600 opacity-70" aria-hidden="true"></div>

        <div class="relative z-10 h-7 w-full min-w-0 max-w-full border-b border-surface-300-700/60">
          {#each ticks as tick, index (tick)}
            {@const pct = ((tick - rangeStartMs) / rangeSpanMs) * 100}
            {#if index % labelStep === 0}
              <span
                class="absolute top-1 max-w-[2.75rem] -translate-x-1/2 truncate text-center text-[10px] tabular-nums text-surface-700-300 sm:max-w-[3.25rem]"
                style="left: {pct}%"
                title={formatTimelineAxisTick(tick, range)}
              >
                {formatTimelineAxisTick(tick, range)}
              </span>
            {/if}
          {/each}
        </div>

        <div class="relative z-10 flex h-5 w-full min-w-0 max-w-full" role="img" aria-label="Connection state over time for the selected range">
          {#each segments as seg, index (index)}
            {@const duration = seg.endMs - seg.startMs}
            {#if duration > 0}
              <div
                class="h-full min-w-px {seg.connected ? 'bg-success-500' : 'bg-surface-400-600'}"
                style="flex-grow: {Math.max(duration, 1)}"
                title="{seg.connected ? 'Connected' : 'Disconnected'}: {new Date(seg.startMs).toLocaleString()} → {new Date(seg.endMs).toLocaleString()}"
              ></div>
            {/if}
          {/each}
        </div>
      </div>
    </div>
  {/if}
</Card>
