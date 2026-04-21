<script lang="ts">
  import Battery from "@lucide/svelte/icons/battery";
  import Footprints from "@lucide/svelte/icons/footprints";
  import Heart from "@lucide/svelte/icons/heart";
  import { FeatureId } from "$lib/bleContract";
  import {
    activeFeatureIds,
    batteryPercent,
    connectError,
    connectTo,
    connected,
    connectingAddress,
    heartRateBpm,
    selectedAddress,
    stepCount,
  } from "$lib/stores/bleSession";
  import { devicesHydrated, rememberedDevices } from "$lib/stores/devices";
  import { bleAddressesEqual } from "$lib/utils/deviceId";

  const isConnectedDevice = (address: string) =>
    Boolean($connected && $selectedAddress && bleAddressesEqual($selectedAddress, address));
  const isConnectingDevice = (address: string) =>
    Boolean($connectingAddress && bleAddressesEqual($connectingAddress, address));
  const connectErrorFor = (address: string) =>
    $connectError && bleAddressesEqual($connectError.address, address) ? $connectError.message : null;
</script>

<section class="grid gap-4">
  {#if !$devicesHydrated}
    <p class="text-[color:var(--color-surface-700-300)]">Loading devices...</p>
  {:else if !$rememberedDevices.length}
    <p class="text-[color:var(--color-surface-700-300)]">No remembered devices.</p>
  {:else}
    {#each $rememberedDevices as device (device.id)}
      <div class="relative">
        <a
          class="card preset-tonal-surface block border border-[color:var(--color-surface-200-800)] pr-28 no-underline text-inherit outline-offset-[-2px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--color-primary-500)]"
          href={`/device/${device.id}`}
        >
          <div class="p-4">
            <div class="font-bold text-[color:var(--color-primary-700-300)]">{device.name}</div>
            <p class="m-0 mt-1 font-mono text-xs text-[color:var(--color-surface-700-300)]">{device.address}</p>
            {#if isConnectedDevice(device.address) && ($batteryPercent !== null || $stepCount !== null || $activeFeatureIds.includes(FeatureId.bleHr))}
              <div class="mt-2 flex flex-col gap-1 text-sm text-[color:var(--color-surface-900-100)]">
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
          </div>
        </a>

        <div class="absolute right-3 top-3 flex items-center justify-end">
          {#if isConnectedDevice(device.address)}
            <span class="badge preset-filled-success-500">Connected</span>
          {:else}
            <button
              class="btn btn-sm preset-tonal-primary"
              type="button"
              onclick={() => void connectTo(device.address)}
              disabled={isConnectingDevice(device.address)}
            >
              {isConnectingDevice(device.address) ? "Connecting…" : "Connect"}
            </button>
          {/if}
        </div>
        {#if connectErrorFor(device.address)}
          <p class="m-0 mt-2 text-sm text-[color:var(--color-error-700-300)]">{connectErrorFor(device.address)}</p>
        {/if}
      </div>
    {/each}
  {/if}

  <a class="btn preset-filled-primary-500 w-full justify-center sm:w-auto" href="/add">Add Device</a>
</section>
