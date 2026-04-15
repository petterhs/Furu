<script lang="ts">
  import { goto } from "$app/navigation";
  import Battery from "@lucide/svelte/icons/battery";
  import Settings from "@lucide/svelte/icons/settings";
  import { LineChart } from "layerchart";
  import { page } from "$app/state";
  import { batteryHistoryByDevice, batteryHistoryHydrated } from "$lib/stores/batteryHistory";
  import {
    batteryPercent,
    connected,
    connectError,
    connectTo,
    connectingAddress,
    disconnectDevice,
    selectedAddress,
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

<section class="grid gap-4">
  <article class="card border border-[color:var(--color-surface-200-800)] p-4 preset-tonal-surface">
    <div class="mb-3 flex items-center justify-between gap-2">
      <h2 class="m-0 text-base font-semibold">Device</h2>
      <a
        class="btn btn-icon btn-sm border border-[color:var(--color-primary-600)] bg-[color:var(--color-primary-500)] text-white no-underline"
        href={`/device/${routeDeviceKey}/settings`}
        aria-label="Open device settings"
      >
        <Settings class="size-4 !text-white !stroke-white" />
        <Settings class="size-4" />
          <Battery class="size-4" />
      </a>
        <Settings class="size-4" />
    </div>
    {#if known}
      <p class="m-0"><strong>{known.name}</strong></p>
      <p class="m-0 mt-2 font-mono text-sm">{known.address}</p>
      {#if isCurrentDevice && $batteryPercent !== null}
        <p class="m-0 mt-2 flex items-center gap-1 text-sm">
          <Battery class="size-4" />
          {$batteryPercent}%
        </p>
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
          xDomain={[new Date(rangeStartMs), new Date()]}
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

</section>
