<script lang="ts">
  import { goto } from "$app/navigation";
  import Battery from "@lucide/svelte/icons/battery";
  import Footprints from "@lucide/svelte/icons/footprints";
  import Heart from "@lucide/svelte/icons/heart";
  import Plug from "@lucide/svelte/icons/plug";
  import Settings from "@lucide/svelte/icons/settings";
  import Unplug from "@lucide/svelte/icons/unplug";
  import Watch from "@lucide/svelte/icons/watch";
  import { FeatureId } from "#lib/bleContract";
  import { describeConnection, describeLastSeen, pickPrimaryDevice } from "#lib/connectionStatus";
  import { RANGE_MS, type RangeKey } from "#lib/deviceHistory";
  import { firmwareLabel } from "#lib/firmwareLabel";
  import { batteryHistoryByDevice, batteryHistoryHydrated } from "#lib/stores/batteryHistory";
  import {
    activeFeatureIds,
    activeProfileId,
    batteryCharging,
    batteryPercent,
    batteryVoltageMv,
    connectTo,
    connected,
    connectingAddress,
    deviceInformation,
    disconnectDevice,
    heartRateBpm,
    nativeConnection,
    profiles,
    selectedAddress,
    stepCount,
  } from "#lib/stores/bleSession";
  import { connectionHistoryByDevice, connectionHistoryHydrated } from "#lib/stores/connectionHistory";
  import {
    answerProfileSuggestion,
    deviceDisplayName,
    devicesHydrated,
    rememberedDevices,
  } from "#lib/stores/devices";
  import { toastCaught } from "#lib/stores/toast";
  import { bleAddressesEqual } from "#lib/utils/deviceId";
  import Card from "#lib/components/ui/Card.svelte";
  import EmptyState from "#lib/components/ui/EmptyState.svelte";
  import StatTile from "#lib/components/ui/StatTile.svelte";
  import StatusPill from "#lib/components/ui/StatusPill.svelte";
  import DeviceHistorySummary from "#lib/components/device/DeviceHistorySummary.svelte";

  const primary = $derived(
    pickPrimaryDevice($rememberedDevices, $selectedAddress, bleAddressesEqual),
  );
  const primaryIsLive = $derived(
    Boolean(primary && $connected && $selectedAddress && bleAddressesEqual($selectedAddress, primary.address)),
  );
  const primaryIsConnecting = $derived(
    Boolean(primary && $connectingAddress && bleAddressesEqual($connectingAddress, primary.address)),
  );
  const status = $derived(
    describeConnection($nativeConnection, primary?.address ?? null, bleAddressesEqual),
  );
  const profileLabel = $derived(
    $profiles.find((profile) => profile.id === $activeProfileId)?.label ?? $activeProfileId,
  );

  /*
   * Heart rate is deliberately not a headline stat. The PineTime's sensor is not
   * reliable enough for continuous use, so it only appears when the watch is
   * actively reporting a reading — never as a permanent empty tile.
   */
  const showHeartRate = $derived(
    primaryIsLive &&
      $activeFeatureIds.includes(FeatureId.bleHr) &&
      $heartRateBpm !== null,
  );
  const showSteps = $derived(primaryIsLive && $activeFeatureIds.includes(FeatureId.bleDisSteps));

  const suggestion = $derived(primary?.profileSuggestion);

  let suggestionBusy = $state(false);

  async function answerSuggestion(accept: boolean): Promise<void> {
    if (!primary || suggestionBusy) return;
    suggestionBusy = true;
    try {
      await answerProfileSuggestion(primary.id, accept);
    } catch (error) {
      toastCaught("Could not save the profile choice", error);
    } finally {
      suggestionBusy = false;
    }
  }

  async function connect(device: { address: string }): Promise<void> {
    try {
      await connectTo(device.address);
    } catch (error) {
      toastCaught("Could not connect", error);
    }
  }

  async function disconnect(): Promise<void> {
    try {
      await disconnectDevice();
    } catch (error) {
      toastCaught("Could not disconnect", error);
    }
  }
</script>

<div class="grid min-w-0 gap-4">
  {#if !$devicesHydrated}
    <div class="grid gap-4" aria-busy="true">
      <div class="h-48 animate-pulse rounded-xl bg-surface-200-800/60"></div>
      <div class="h-40 animate-pulse rounded-xl bg-surface-200-800/60"></div>
    </div>
  {:else if !primary}
    <EmptyState
      title="No watch paired yet"
      description="Pair a PineTime running InfiniTime, Kongle or another supported firmware to see battery, activity and firmware updates here."
    >
      {#snippet icon()}<Watch class="size-10" />{/snippet}
      {#snippet actions()}
        <a class="btn preset-filled-primary-500" href="/devices/add">Pair a watch</a>
      {/snippet}
    </EmptyState>
  {:else}
    <!-- The device nickname is the page heading; no separate "Home" title above it. -->
    <Card padded={false} class="overflow-hidden">
      <div class="min-w-0 p-4">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <h1 class="m-0 truncate text-xl font-semibold">{deviceDisplayName(primary)}</h1>
            <p class="m-0 mt-0.5 text-sm text-surface-700-300">
              {primaryIsLive
                ? firmwareLabel(primary, $deviceInformation)
                : firmwareLabel(primary, null)}
              · {profileLabel}{primary.profilePreference === "auto" ? " (auto)" : ""}
            </p>
          </div>
          <StatusPill label={status.label} tone={status.tone} busy={status.busy} />
        </div>

        {#if primaryIsLive}
          <div class="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
            <StatTile
              label="Battery"
              value={$batteryPercent !== null ? String($batteryPercent) : "—"}
              unit={$batteryPercent !== null ? "%" : undefined}
              tone={$batteryCharging ? "success" : "neutral"}
              hint={$batteryCharging
                ? "Charging"
                : $batteryVoltageMv !== null
                  ? `${($batteryVoltageMv / 1000).toFixed(2)} V`
                  : undefined}
            >
              {#snippet icon()}<Battery class="size-3.5" />{/snippet}
            </StatTile>
            {#if showSteps}
              <StatTile
                label="Steps"
                value={$stepCount !== null ? $stepCount.toLocaleString() : "—"}
                tone="success"
              >
                {#snippet icon()}<Footprints class="size-3.5" />{/snippet}
              </StatTile>
            {/if}
            {#if showHeartRate}
              <StatTile
                label="Heart"
                value={String($heartRateBpm)}
                unit="bpm"
                tone="error"
              >
                {#snippet icon()}<Heart class="size-3.5" />{/snippet}
              </StatTile>
            {/if}
          </div>
        {:else}
          <p class="m-0 mt-3 text-sm text-surface-700-300">
            Last seen {describeLastSeen(primary.lastSeenAt)}. Connect to read battery and
            activity.
          </p>
        {/if}

        <!-- Real buttons: bordered, with icons and an obvious tap target. -->
        <div class="mt-4 flex flex-wrap gap-2">
          {#if primaryIsLive}
            <button
              class="btn preset-tonal-surface gap-1.5"
              type="button"
              onclick={() => void disconnect()}
            >
              <Unplug class="size-4" />
              Disconnect
            </button>
          {:else}
            <button
              class="btn preset-filled-primary-500 gap-1.5"
              type="button"
              disabled={primaryIsConnecting}
              onclick={() => void connect(primary)}
            >
              <Plug class="size-4" />
              {primaryIsConnecting ? "Connecting…" : "Connect"}
            </button>
          {/if}
          <a class="btn preset-tonal-surface gap-1.5" href={`/device/${primary.id}`}>
            <Watch class="size-4" />
            Details
          </a>
          <button
            class="btn preset-tonal-surface gap-1.5"
            type="button"
            onclick={() => void goto(`/device/${primary.id}/settings`)}
          >
            <Settings class="size-4" />
            Settings
          </button>
        </div>
      </div>
    </Card>

    {#if suggestion}
      <Card
        title="Firmware changed on this watch"
        description={`Furu detected ${$profiles.find((p) => p.id === suggestion.detectedProfileId)?.label ?? suggestion.detectedProfileId}, but this device is set to ${$profiles.find((p) => p.id === suggestion.overrideProfileId)?.label ?? suggestion.overrideProfileId}.`}
      >
        <div class="flex flex-wrap gap-2">
          <button
            class="btn preset-filled-primary-500"
            type="button"
            disabled={suggestionBusy}
            onclick={() => void answerSuggestion(true)}
          >
            Switch profile
          </button>
          <button
            class="btn preset-tonal-surface"
            type="button"
            disabled={suggestionBusy}
            onclick={() => void answerSuggestion(false)}
          >
            Keep current
          </button>
        </div>
      </Card>
    {/if}

    <DeviceHistorySummary
      deviceName={deviceDisplayName(primary)}
      samples={$batteryHistoryByDevice[primary.id] ?? []}
      connectionEvents={$connectionHistoryByDevice[primary.id] ?? []}
      hydrated={$batteryHistoryHydrated && $connectionHistoryHydrated}
    />
  {/if}
</div>
