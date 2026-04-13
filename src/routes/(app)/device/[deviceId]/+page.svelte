<script lang="ts">
  import { page } from "$app/state";
  import { connected, connectTo, disconnectDevice, selectedAddress } from "$lib/stores/bleSession";
  import { rememberedDevices } from "$lib/stores/devices";
  import { addressFromDeviceId, bleAddressesEqual } from "$lib/utils/deviceId";

  const deviceId = $derived(page.params.deviceId ?? "");
  const resolvedAddress = $derived(addressFromDeviceId(deviceId));
  const known = $derived(
    $rememberedDevices.find((item) => item.id === deviceId || bleAddressesEqual(item.address, resolvedAddress)),
  );
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
    {:else}
      <p class="m-0 font-mono text-sm">{resolvedAddress}</p>
    {/if}
  </article>

  <article class="card border border-[color:var(--color-surface-200-800)] p-4 preset-tonal-surface">
    <h2 class="m-0 mb-3 text-base font-semibold">Quick Actions</h2>
    <div class="flex flex-wrap gap-2">
      <button class="btn btn-sm preset-filled-primary-500" type="button" onclick={() => connectTo(resolvedAddress)}>
        Connect
      </button>
      <button class="btn btn-sm preset-tonal-surface" type="button" onclick={disconnectDevice} disabled={!$connected}>
        Disconnect
      </button>
    </div>
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
    <a class="btn btn-sm preset-tonal-surface no-underline" href={`/device/${deviceId}/history`}>History</a>
    <a class="btn btn-sm preset-tonal-surface no-underline" href={`/device/${deviceId}/settings`}>Settings</a>
  </div>
</section>
