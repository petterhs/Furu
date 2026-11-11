<script lang="ts">
  import { LineChart } from "layerchart";
  import { RANGE_MS, splitAtGaps } from "#lib/deviceHistory";
  import type { BatteryHistorySample } from "#lib/types/batteryHistory";
  import type { ConnectionHistorySegment } from "#lib/types/connectionHistory";
  import Card from "#lib/components/ui/Card.svelte";

  type Props = {
    title: string;
    /** Rendered under the title. */
    description?: string;
    samples: readonly BatteryHistorySample[];
    /** Connection spans for the same window as `samples`. */
    segments: readonly ConnectionHistorySegment[];
    hydrated: boolean;
    /** Window start, shared with the caller so the strip and chart cannot drift. */
    startMs: number;
    endMs: number;
    /** Compact labels for a phone: "14:05" rather than "11/11/2026". */
    compactTime?: boolean;
    height?: number;
    /** Optional controls rendered on the heading row. */
    actionsSnippet?: import("svelte").Snippet;
  };

  let {
    title,
    description,
    samples,
    segments,
    hydrated,
    startMs,
    endMs,
    compactTime = false,
    height = 160,
    actionsSnippet,
  }: Props = $props();

  /**
   * Chart plot inset, in pixels. Shared by the chart (`padding`) and the
   * connection rows so a connected band lines up with the battery line above it.
   * Measured from a rendered chart: `padding.left` maps 1:1 to the data line's
   * inset (a 34px request renders at 35px once the axis stroke is included).
   */
  const PLOT_INSET = { left: 35, right: 9, top: 6, bottom: 22 };

  const points = $derived(
    samples
      .map((sample) => ({ time: new Date(sample.at), percent: sample.percent }))
      .filter((point) => {
        const at = point.time.getTime();
        return at >= startMs && at <= endMs;
      })
      .sort((a, b) => a.time.getTime() - b.time.getTime()),
  );

  const series = $derived(
    splitAtGaps(points).map((segment, index) => ({
      key: `segment-${index}`,
      data: segment,
      value: (point: { time: Date; percent: number }) => point.percent,
      color: "var(--color-primary-500)",
    })),
  );

  const latest = $derived(points.length ? points[points.length - 1].percent : null);
  const oldest = $derived(points.length ? points[0].percent : null);
  const delta = $derived(latest !== null && oldest !== null ? latest - oldest : null);

  /**
   * Connection spans clipped to the window, as percentages of the same
   * `startMs`/`endMs` the chart uses. The strip is inset by the chart's y-axis
   * gutter so the two share a horizontal origin.
   */
  const span = $derived(Math.max(1, endMs - startMs));
  const connectionBand = $derived(
    segments
      .map((segment) => ({
        start: Math.max(segment.startMs, startMs),
        end: Math.min(segment.endMs, endMs),
        connected: segment.connected,
      }))
      .filter((segment) => segment.end > segment.start)
      .map((segment) => ({
        left: ((segment.start - startMs) / span) * 100,
        width: ((segment.end - segment.start) / span) * 100,
        connected: segment.connected,
      })),
  );

  /** Share of the window the watch was connected, for the summary line. */
  const connectedRatio = $derived.by(() => {
    if (!connectionBand.length) return null;
    const connectedWidth = connectionBand
      .filter((segment) => segment.connected)
      .reduce((total, segment) => total + segment.width, 0);
    return Math.min(1, connectedWidth / 100);
  });

  const xDomain = $derived([new Date(startMs), new Date(endMs)]);

  const formatTick = (value: Date): string =>
    compactTime
      ? value.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
      : value.toLocaleDateString(undefined, { month: "short", day: "numeric" });
</script>

<Card {title} {description}>
  {#snippet actions()}
    {#if actionsSnippet}{@render actionsSnippet()}{/if}
  {/snippet}

  {#if !hydrated}
    <p class="m-0 text-sm text-surface-700-300">Loading history…</p>
  {:else if points.length < 2}
    <p class="m-0 text-sm text-surface-700-300">
      Not enough readings in this range yet. Furu records one every minute while the watch is
      connected.
    </p>
  {:else}
    {#if delta !== null || connectedRatio !== null}
      <div class="mb-2 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
        {#if delta !== null}
          <p class="m-0">
            <span
              class="font-semibold tabular-nums"
              class:text-warning-700-300={delta < 0}
              class:text-success-700-300={delta > 0}
            >
              {delta > 0 ? "+" : ""}{delta}%
            </span>
            <span class="text-surface-700-300">battery</span>
          </p>
        {/if}
        {#if connectedRatio !== null}
          <p class="m-0 text-surface-700-300">
            Connected {Math.round(connectedRatio * 100)}% of the window
          </p>
        {/if}
      </div>
    {/if}

    {#if connectionBand.length}
      <!--
        Connection rows. Each row spans the same `startMs`/`endMs` window as the
        chart and is inset by the same fixed y-axis gutter, so a connected bar
        sits directly above the corresponding stretch of battery line.
      -->
      <div
        class="relative h-2.5 w-full overflow-hidden rounded-sm bg-surface-300-700"
        style:margin-left="{PLOT_INSET.left}px"
        style:margin-right="{PLOT_INSET.right}px"
        style:width="calc(100% - {PLOT_INSET.left + PLOT_INSET.right}px)"
        role="img"
        aria-label="Connection state across the selected range"
      >
        {#each connectionBand as band, index (index)}
          <span
            class="absolute top-0 h-full {band.connected ? 'bg-success-500' : 'bg-surface-500-500'}"
            style:left="{band.left}%"
            style:width="{band.width}%"
          ></span>
        {/each}
      </div>
      <p class="m-0 mt-1 flex gap-3 text-[11px] text-surface-700-300">
        <span class="inline-flex items-center gap-1">
          <span class="inline-block size-2 rounded-full bg-success-500" aria-hidden="true"></span>
          Connected
        </span>
        <span class="inline-flex items-center gap-1">
          <span class="inline-block size-2 rounded-full bg-surface-500-500" aria-hidden="true"></span>
          Disconnected
        </span>
      </p>
    {/if}

    <div class="min-w-0 w-full" style:height="{height}px">
      <LineChart
        data={points}
        series={series}
        x="time"
        y="percent"
        xDomain={xDomain}
        yDomain={[0, 100]}
        {height}
        axis={true}
        grid={true}
        points={false}
        rule={false}
        /*
         * A fixed viewport inset, matching `PLOT_INSET` used by the connection
         * rows above. LayerChart otherwise sizes the inset from the measured
         * label text, which shifts between ranges and would put the rows and the
         * plot a few pixels out of step.
         */
        padding={PLOT_INSET}
        props={{
          spline: { stroke: "var(--color-primary-500)", strokeWidth: 2.5 },
          xAxis: {
            ticks: 4,
            format: formatTick,
            classes: {
              tickLabel: "fill-surface-700-300",
              tick: "stroke-surface-500-500",
              rule: "stroke-surface-500-500",
            },
          },
          yAxis: {
            ticks: [0, 25, 50, 75, 100],
            format: (value: number) => `${value}%`,
            classes: {
              tickLabel: "fill-surface-700-300",
              tick: "stroke-surface-500-500",
              rule: "stroke-surface-500-500",
            },
          },
          grid: { class: "stroke-surface-400-600" },
        }}
      />
    </div>
  {/if}
</Card>
