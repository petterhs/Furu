<script lang="ts">
  import { goto } from "$app/navigation";
  import Battery from "@lucide/svelte/icons/battery";
  import Footprints from "@lucide/svelte/icons/footprints";
  import Heart from "@lucide/svelte/icons/heart";
  import Settings from "@lucide/svelte/icons/settings";
  import { LineChart } from "layerchart";
  import { page } from "$app/state";
  import { batteryHistoryByDevice, batteryHistoryHydrated } from "$lib/stores/batteryHistory";
  import {
    connectionHistoryByDevice,
    connectionHistoryHydrated,
    connectionSegmentsForRange,
  } from "$lib/stores/connectionHistory";
  import { FeatureId } from "$lib/bleContract";
  import {
    activeFeatureIds,
    batteryPercent,
    connected,
    connectError,
    connectTo,
    connectingAddress,
    disconnectDevice,
    heartRateBpm,
    selectedAddress,
    stepCount,
  } from "$lib/stores/bleSession";
  import { forgetRememberedDevice, rememberedDevices } from "$lib/stores/devices";
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

  type RangeKey = "1d" | "3d" | "7d";
  const RANGE_MS: Record<RangeKey, number> = {
    "1d": 24 * 60 * 60 * 1000,
    "3d": 3 * 24 * 60 * 60 * 1000,
    "7d": 7 * 24 * 60 * 60 * 1000,
  };
  let selectedRange = $state<RangeKey>("3d");
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

  async function onForget(): Promise<void> {
    if (!known) return;
    const confirmed = window.confirm(
      `Forget ${known.name}? This removes the device and its local data.`,
    );
    if (!confirmed) return;
    if (isCurrentDevice) {
      await disconnectDevice();
    }
    await forgetRememberedDevice(known.id);
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

  <article class="card border border-[color:var(--color-surface-200-800)] p-4 preset-tonal-surface">
    <h2 class="m-0 mb-3 text-base font-semibold">Actions</h2>
    <div class="flex flex-wrap gap-2">
      {#if isCurrentDevice}
        <button class="btn btn-sm preset-tonal-surface" type="button" onclick={disconnectDevice}>
          Disconnect
        </button>
        <button class="btn btn-sm preset-tonal-surface" type="button" disabled>
          OTA Update / DFU
        </button>
      {:else}
        <button
          class="btn btn-sm preset-filled-primary-500"
          type="button"
          onclick={() => void connectTo(resolvedAddress)}
          disabled={isConnectingDevice}
        >
          {isConnectingDevice ? "Connecting…" : "Connect"}
        </button>
      {/if}
      <button class="btn btn-sm preset-tonal-error" type="button" onclick={() => void onForget()}>
        Forget
      </button>
    </div>
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
