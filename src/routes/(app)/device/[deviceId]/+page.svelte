<script lang="ts">
  import Battery from "@lucide/svelte/icons/battery";
  import { page } from "$app/state";
  import {
    batteryPercent,
    connected,
    connectError,
    connectTo,
    connectingAddress,
    disconnectDevice,
    selectedAddress,
  } from "$lib/stores/bleSession";
  import { rememberedDevices } from "$lib/stores/devices";
  import { addressFromDeviceId, bleAddressesEqual, findRememberedByDeviceRouteParam } from "$lib/utils/deviceId";

  const deviceId = $derived(page.params.deviceId ?? "");
  const resolvedAddress = $derived(addressFromDeviceId(deviceId));
  const known = $derived(findRememberedByDeviceRouteParam(deviceId, $rememberedDevices));
  /** Use stored id in child links so History/Settings URLs match `RememberedDevice.id` (encoded address). */
  const routeDeviceKey = $derived(known?.id ?? deviceId);
  const isCurrentDevice = $derived(
    Boolean(known?.address && $selectedAddress && bleAddressesEqual($selectedAddress, known.address) && $connected),
  );
  const isConnectedToOtherRememberedDevice = $derived(
    Boolean(
      $connected &&
        $selectedAddress &&
        known?.address &&
        !bleAddressesEqual($selectedAddress, known.address),
    ),
  );
  const isConnectedAddressUnknown = $derived(Boolean($connected && !$selectedAddress));
  const isConnectingDevice = $derived(
    Boolean($connectingAddress && bleAddressesEqual($connectingAddress, resolvedAddress)),
  );
  const isConnectErrorForDevice = $derived(
    Boolean($connectError && bleAddressesEqual($connectError.address, resolvedAddress)),
  );
</script>

<section class="grid gap-4">
  <article class="card border border-[color:var(--color-surface-200-800)] p-4 preset-tonal-surface">
    <h2 class="m-0 mb-3 text-base font-semibold">Device</h2>
    {#if known}
      <p class="m-0"><strong>{known.name}</strong></p>
      <p class="m-0 mt-2 font-mono text-sm">{known.address}</p>
      <p class="m-0 mt-2 text-sm text-[color:var(--color-surface-700-300)]">
        Last seen: {new Date(known.lastSeenAt).toLocaleString()}
      </p>
      {#if isCurrentDevice && $batteryPercent !== null}
        <p class="m-0 mt-2 flex items-center gap-1 text-sm">
          <Battery class="size-4" />
          {$batteryPercent}%
        </p>
      {/if}
    {:else}
      <p class="m-0 font-mono text-sm">{resolvedAddress}</p>
    {/if}
  </article>

  <article class="card border border-[color:var(--color-surface-200-800)] p-4 preset-tonal-surface">
    <h2 class="m-0 mb-3 text-base font-semibold">Quick Actions</h2>
    <div class="flex flex-wrap gap-2">
      <button
        class="btn btn-sm preset-filled-primary-500"
        type="button"
        onclick={() => void connectTo(resolvedAddress)}
        disabled={isConnectingDevice}
      >
        {isConnectingDevice ? "Connecting…" : "Connect"}
      </button>
      <button class="btn btn-sm preset-tonal-surface" type="button" onclick={disconnectDevice} disabled={!$connected}>
        Disconnect
      </button>
    </div>
    {#if isConnectErrorForDevice}
      <p class="m-0 mt-3 text-sm text-[color:var(--color-error-700-300)]">{$connectError?.message}</p>
    {/if}
    {#if isCurrentDevice}
      <p class="m-0 mt-3 text-sm">This device is currently connected.</p>
    {:else if isConnectedToOtherRememberedDevice}
      <p class="m-0 mt-3 text-sm text-[color:var(--color-surface-700-300)]">
        Connected to another device: <span class="font-mono">{$selectedAddress}</span>
      </p>
    {:else if isConnectedAddressUnknown}
      <p class="m-0 mt-3 text-sm text-[color:var(--color-surface-700-300)]">
        Connected to a device, but the active device address is currently unknown.
      </p>
    {:else}
      <p class="m-0 mt-3 text-sm text-[color:var(--color-surface-700-300)]">Not connected.</p>
    {/if}
  </article>

  <div class="flex flex-wrap gap-2">
    <a class="btn btn-sm preset-tonal-surface no-underline" href={`/device/${routeDeviceKey}/history`}>History</a>
    <a class="btn btn-sm preset-tonal-surface no-underline" href={`/device/${routeDeviceKey}/settings`}>Settings</a>
  </div>
</section>
