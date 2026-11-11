<script lang="ts">
  import Battery from "@lucide/svelte/icons/battery";
  import ChevronRight from "@lucide/svelte/icons/chevron-right";
  import Footprints from "@lucide/svelte/icons/footprints";
  import Heart from "@lucide/svelte/icons/heart";
  import Plus from "@lucide/svelte/icons/plus";
  import Watch from "@lucide/svelte/icons/watch";
  import { FeatureId } from "#lib/bleContract";
  import { describeConnection, describeLastSeen } from "#lib/connectionStatus";
  import { firmwareLabel } from "#lib/firmwareLabel";
  import {
    activeFeatureIds,
    activeProfileId,
    batteryPercent,
    connectError,
    connectTo,
    connected,
    connectingAddress,
    deviceInformation,
    heartRateBpm,
    nativeConnection,
    profiles,
    selectedAddress,
    stepCount,
  } from "#lib/stores/bleSession";
  import { devicesHydrated, deviceDisplayName, rememberedDevices } from "#lib/stores/devices";
  import { toastCaught } from "#lib/stores/toast";
  import { bleAddressesEqual } from "#lib/utils/deviceId";
  import EmptyState from "#lib/components/ui/EmptyState.svelte";
  import PageHeading from "#lib/components/ui/PageHeading.svelte";
  import StatusPill from "#lib/components/ui/StatusPill.svelte";

  const isLive = (address: string) =>
    Boolean($connected && $selectedAddress && bleAddressesEqual($selectedAddress, address));
  const isConnecting = (address: string) =>
    Boolean($connectingAddress && bleAddressesEqual($connectingAddress, address));
  const errorFor = (address: string) =>
    $connectError && bleAddressesEqual($connectError.address, address) ? $connectError.message : null;
  const profileLabel = $derived(
    $profiles.find((profile) => profile.id === $activeProfileId)?.label ?? $activeProfileId,
  );

  /** Only the live watch has readings; the rest show identity and recency. */
  const liveStats = $derived(
    isLive($selectedAddress ?? "")
      ? [
          $batteryPercent !== null ? { icon: Battery, text: `${$batteryPercent}%` } : null,
          $activeFeatureIds.includes(FeatureId.bleDisSteps) && $stepCount !== null
            ? { icon: Footprints, text: $stepCount.toLocaleString() }
            : null,
          $activeFeatureIds.includes(FeatureId.bleHr) && $heartRateBpm !== null
            ? { icon: Heart, text: String($heartRateBpm) }
            : null,
        ].filter((stat) => stat !== null)
      : [],
  );

  async function connect(address: string): Promise<void> {
    try {
      await connectTo(address);
    } catch (error) {
      toastCaught("Could not connect", error);
    }
  }
</script>

<div class="grid min-w-0 gap-4">
  <PageHeading title="Devices" description="Paired watches and their connection state.">
    {#snippet actions()}
      <a class="btn btn-sm preset-filled-primary-500 gap-1.5" href="/devices/add">
        <Plus class="size-4" />
        Add
      </a>
    {/snippet}
  </PageHeading>

  {#if !$devicesHydrated}
    <div class="grid gap-2" aria-busy="true">
      <div class="h-20 animate-pulse rounded-lg bg-surface-200-800/60"></div>
      <div class="h-20 animate-pulse rounded-lg bg-surface-200-800/60"></div>
    </div>
  {:else if !$rememberedDevices.length}
    <EmptyState
      title="No devices yet"
      description="Pair a PineTime to start reading battery, activity and firmware updates."
    >
      {#snippet icon()}<Watch class="size-10" />{/snippet}
      {#snippet actions()}
        <a class="btn preset-filled-primary-500" href="/devices/add">Pair a watch</a>
      {/snippet}
    </EmptyState>
  {:else}
    <ul class="m-0 grid list-none gap-2 p-0">
      {#each $rememberedDevices as device (device.id)}
        {@const live = isLive(device.address)}
        {@const status = describeConnection($nativeConnection, device.address, bleAddressesEqual)}
        {@const error = errorFor(device.address)}
        <li class="min-w-0">
          <!-- One bordered card per device: stats and error stay inside it. -->
          <div class="min-w-0 rounded-lg border border-surface-200-800 p-3">
            <div class="flex min-w-0 items-start gap-3">
              <a
                class="min-w-0 flex-1 no-underline text-inherit"
                href={`/device/${device.id}`}
                aria-label={`Open ${deviceDisplayName(device)}`}
              >
                <span class="flex min-w-0 items-center gap-2">
                  <span class="truncate text-sm font-semibold">{deviceDisplayName(device)}</span>
                  {#if live}
                    <StatusPill label={status.label} tone={status.tone} busy={status.busy} />
                  {/if}
                </span>
                <span class="mt-0.5 block truncate text-xs text-surface-700-300">
                  {live ? firmwareLabel(device, $deviceInformation) : firmwareLabel(device, null)}
                  · {live ? profileLabel : `last seen ${describeLastSeen(device.lastSeenAt)}`}
                </span>
                {#if live && liveStats.length}
                  <span class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-surface-700-300">
                    {#each liveStats as stat, index (index)}
                      <span class="inline-flex items-center gap-1">
                        <stat.icon class="size-3.5" />
                        {stat.text}
                      </span>
                    {/each}
                  </span>
                {/if}
              </a>
              <div class="flex shrink-0 items-center gap-1">
                {#if !live}
                  <button
                    class="btn btn-xs preset-tonal-primary"
                    type="button"
                    disabled={isConnecting(device.address)}
                    onclick={() => void connect(device.address)}
                  >
                    {isConnecting(device.address) ? "…" : "Connect"}
                  </button>
                {/if}
                <a
                  class="btn-icon btn-xs preset-tonal-surface"
                  href={`/device/${device.id}`}
                  aria-label={`Open ${deviceDisplayName(device)} details`}
                >
                  <ChevronRight class="size-4" />
                </a>
              </div>
            </div>
            {#if error}
              <p class="m-0 mt-2 text-xs text-error-700-300" role="alert">{error}</p>
            {/if}
          </div>
        </li>
      {/each}
    </ul>
  {/if}
</div>
