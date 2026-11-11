<script lang="ts">
  import { LineChart } from "layerchart";
  import { RANGE_MS } from "#lib/deviceHistory";
  import type { BatteryHistorySample } from "#lib/types/batteryHistory";
  import type { ConnectionHistoryEvent } from "#lib/types/connectionHistory";
  import { connectionSegmentsForRange } from "#lib/stores/connectionHistory";
  import { RANGE_LABELS, type RangeKey } from "#lib/deviceHistory";
  import BatteryHistoryChart from "./BatteryHistoryChart.svelte";
  import Card from "#lib/components/ui/Card.svelte";

  type Props = {
    deviceName: string;
    samples: readonly BatteryHistorySample[];
    connectionEvents: readonly ConnectionHistoryEvent[];
    hydrated: boolean;
  };

  let { deviceName, samples, connectionEvents, hydrated }: Props = $props();

  let range = $state<RangeKey>("1d");
  /** The chart window advances slowly; a phone does not need second precision. */
  let nowMs = $state(Date.now());

  $effect(() => {
    const clock = setInterval(() => { nowMs = Date.now(); }, 30_000);
    return () => clearInterval(clock);
  });

  const startMs = $derived(nowMs - RANGE_MS[range]);
  const endMs = $derived(nowMs);
  const segments = $derived(connectionSegmentsForRange([...connectionEvents], startMs, endMs));

  const voltagePoints = $derived(
    samples
      .map((sample) => ({ time: new Date(sample.at), voltageMv: sample.voltageMv }))
      .filter((point): point is { time: Date; voltageMv: number } =>
        point.voltageMv !== undefined && point.time.getTime() >= startMs)
      .sort((a, b) => a.time.getTime() - b.time.getTime()),
  );
  const voltageSeries = $derived([
    {
      key: "voltage",
      data: voltagePoints,
      value: (point: { time: Date; voltageMv: number }) => point.voltageMv,
      color: "var(--color-secondary-500)",
    },
  ]);
</script>

<div class="grid min-w-0 gap-4">
  <BatteryHistoryChart
    title="Recent history"
    description={`Battery and connection for ${deviceName}.`}
    {samples}
    {segments}
    {hydrated}
    {startMs}
    {endMs}
    compactTime
    height={160}
  >
    {#snippet actionsSnippet()}
      <div
        class="inline-flex gap-0.5 rounded-lg border border-surface-300-700 p-0.5"
        role="group"
        aria-label="History range"
      >
        {#each RANGE_LABELS.slice(0, 3) as option (option.key)}
          <button
            class={[
              "btn btn-xs min-w-9",
              range === option.key ? "preset-filled-primary-500" : "preset-tonal-surface",
            ].join(" ")}
            type="button"
            aria-pressed={range === option.key}
            onclick={() => (range = option.key)}
          >
            {option.label}
          </button>
        {/each}
      </div>
    {/snippet}
  </BatteryHistoryChart>

  {#if voltagePoints.length > 1}
    <Card title="Battery voltage" description="Raw voltage tracks drain more closely than the percentage.">
      <div class="h-40 min-w-0 w-full">
        <LineChart
          data={voltagePoints}
          series={voltageSeries}
          x="time"
          y="voltageMv"
          xDomain={[new Date(startMs), new Date(nowMs)]}
          yDomain={[3000, 4300]}
          height={130}
          axis={true}
          grid={true}
          points={false}
          rule={false}
          props={{
            spline: { stroke: "var(--color-secondary-500)", strokeWidth: 2 },
            xAxis: {
              ticks: 3,
              format: (value: Date) =>
                value.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }),
              classes: { tickLabel: "fill-surface-700-300", tick: "stroke-surface-500-500" },
            },
            yAxis: {
              ticks: [3000, 3500, 4000],
              format: (value: number) => `${(value / 1000).toFixed(1)} V`,
              classes: { tickLabel: "fill-surface-700-300", tick: "stroke-surface-500-500" },
            },
            grid: { class: "stroke-surface-400-600" },
          }}
        />
      </div>
    </Card>
  {/if}
</div>
