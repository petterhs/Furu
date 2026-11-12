<script lang="ts">
  import { page } from "$app/state";
  import { onDestroy, onMount } from "svelte";
  import { FeatureId } from "#lib/bleContract";
  import { profilePreferenceIncludesDeviceInformation } from "#lib/deviceProfileEffective";
  import {
    RANGE_MS,
    type RangeKey,
  } from "#lib/deviceHistory";
  import {
    activeFeatureIds,
    connected,
    connectingAddress,
    deviceInformation,
    deviceInformationError,
    refreshDeviceInformationNow,
    repairServiceCache,
    selectedAddress,
  } from "#lib/stores/bleSession";
  import { batteryHistoryByDevice, batteryHistoryHydrated } from "#lib/stores/batteryHistory";
  import {
    connectionHistoryByDevice,
    connectionHistoryHydrated,
    connectionSegmentsForRange,
  } from "#lib/stores/connectionHistory";
  import { deviceProfileCatalog } from "#lib/stores/deviceProfiles";
  import { dfuInProgress } from "#lib/stores/dfuSession";
  import { deviceDisplayName, rememberedDevices } from "#lib/stores/devices";
  import { toastCaught } from "#lib/stores/toast";
  import {
    addressFromDeviceId,
    bleAddressesEqual,
    findRememberedByDeviceRouteParam,
  } from "#lib/utils/deviceId";
  import BatteryHistoryChart from "#lib/components/device/BatteryHistoryChart.svelte";
  import ConnectionTimelineCard from "#lib/components/device/ConnectionTimelineCard.svelte";
  import DeviceInformationCard from "#lib/components/device/DeviceInformationCard.svelte";
  import DeviceOverviewCard from "#lib/components/device/DeviceOverviewCard.svelte";
  import FirmwareUpdateCard from "#lib/components/device/FirmwareUpdateCard.svelte";
  import RangeSelector from "#lib/components/device/RangeSelector.svelte";
  import WatchConfigurationCard from "#lib/components/device/WatchConfigurationCard.svelte";

  const deviceId = $derived(page.params.deviceId ?? "");
  const resolvedAddress = $derived(addressFromDeviceId(deviceId));
  const known = $derived(findRememberedByDeviceRouteParam(deviceId, $rememberedDevices));
  /** Stored id in child links so settings/history URLs match `RememberedDevice.id`. */
  const routeDeviceKey = $derived(known?.id ?? deviceId);
  const isCurrentDevice = $derived(
    Boolean(known?.address && $selectedAddress && bleAddressesEqual($selectedAddress, known.address) && $connected),
  );

  const showDeviceInfo = $derived(
    known ? profilePreferenceIncludesDeviceInformation(known.profilePreference, $deviceProfileCatalog) : false,
  );
  const canShowLiveInfo = $derived(showDeviceInfo && isCurrentDevice);
  const canFlash = $derived(isCurrentDevice && $activeFeatureIds.includes(FeatureId.infinitimeDfu));
  const missingDfuFeature = $derived(isCurrentDevice && !$activeFeatureIds.includes(FeatureId.infinitimeDfu));

  /** Kongle devices, or any profile that opted into the watch-config capability. */
  const watchConfigSupported = $derived(
    Boolean(known) &&
      (known!.detectedProfileId === "kongle" ||
        known!.profilePreference === "kongle" ||
        $activeFeatureIds.includes(FeatureId.kongleWatchConfig)),
  );

  let range = $state<RangeKey>("3d");
  let nowMs = $state(Date.now());
  let rangeClock: ReturnType<typeof setInterval>;

  let repairing = $state(false);

  const rangeStartMs = $derived(nowMs - RANGE_MS[range]);
  const rangeEndMs = $derived(nowMs);
  const batterySamples = $derived(known ? ($batteryHistoryByDevice[known.id] ?? []) : []);
  const connectionEvents = $derived(known ? ($connectionHistoryByDevice[known.id] ?? []) : []);
  const connectionSegments = $derived(
    connectionSegmentsForRange(connectionEvents, rangeStartMs, rangeEndMs),
  );

  async function onRepair(): Promise<void> {
    if ($dfuInProgress || repairing) return;
    repairing = true;
    try {
      await repairServiceCache(resolvedAddress);
    } catch (error) {
      toastCaught("Could not repair the connection", error);
    } finally {
      repairing = false;
    }
  }

  onMount(() => {
    rangeClock = setInterval(() => { nowMs = Date.now(); }, 1_000);
  });

  onDestroy(() => {
    clearInterval(rangeClock);
  });
</script>

<div class="grid gap-4">
  <DeviceOverviewCard
    device={known}
    address={resolvedAddress}
    deviceName={known ? deviceDisplayName(known) : resolvedAddress}
    settingsHref={`/device/${routeDeviceKey}/settings`}
    onrepair={onRepair}
    {repairing}
  />

  {#if known && showDeviceInfo}
    <DeviceInformationCard
      info={$deviceInformation}
      error={$deviceInformationError}
      canRead={canShowLiveInfo}
      onrefresh={() => void refreshDeviceInformationNow()}
    />
  {/if}

  {#if known}
    <FirmwareUpdateCard
      deviceId={known.id}
      deviceName={deviceDisplayName(known)}
      {canFlash}
      missingFeature={missingDfuFeature}
      isConnected={isCurrentDevice}
    />
  {/if}

  <div class="flex flex-wrap items-center justify-between gap-2">
    <h2 class="m-0 text-base font-semibold">History</h2>
    <RangeSelector value={range} onchange={(next) => (range = next)} label="History range" />
  </div>

  <BatteryHistoryChart
    title="Battery trend"
    description="Percent charge across the selected range."
    samples={batterySamples}
    segments={connectionSegments}
    hydrated={$batteryHistoryHydrated}
    startMs={rangeStartMs}
    endMs={rangeEndMs}
  />
  <ConnectionTimelineCard
    segments={connectionSegments}
    hydrated={$connectionHistoryHydrated}
    known={Boolean(known)}
    {range}
    {nowMs}
  />
</div>
