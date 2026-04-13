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

<section class="stack">
  <article class="card">
    <h2>Device</h2>
    {#if known}
      <p><strong>{known.name}</strong></p>
      <p class="mono">{known.address}</p>
      <p class="muted">Last seen: {new Date(known.lastSeenAt).toLocaleString()}</p>
    {:else}
      <p class="mono">{resolvedAddress}</p>
    {/if}
  </article>

  <article class="card">
    <h2>Quick Actions</h2>
    <div class="row">
      <button type="button" onclick={() => connectTo(resolvedAddress)}>Connect</button>
      <button type="button" onclick={disconnectDevice} disabled={!$connected}>Disconnect</button>
    </div>
    {#if isCurrentDevice}
      <p>This device is currently connected.</p>
    {:else if isConnectedToOtherRememberedDevice}
      <p class="muted">Connected to another device: <span class="mono">{$selectedAddress}</span></p>
    {:else if isConnectedAddressUnknown}
      <p class="muted">Connected to a device, but the active device address is currently unknown.</p>
    {:else}
      <p class="muted">Not connected.</p>
    {/if}
  </article>

  <div class="row">
    <a class="button" href={`/device/${deviceId}/history`}>History</a>
    <a class="button" href={`/device/${deviceId}/settings`}>Settings</a>
  </div>
</section>

<style>
  .stack {
    display: grid;
    gap: 0.9rem;
  }
  .card {
    background: #fff;
    border: 1px solid #ddd;
    border-radius: 0.75rem;
    padding: 0.9rem;
  }
  h2 {
    margin: 0 0 0.6rem;
    font-size: 1rem;
  }
  .row {
    display: flex;
    gap: 0.55rem;
    flex-wrap: wrap;
  }
  button,
  .button {
    border: 1px solid #c7c7c7;
    border-radius: 0.5rem;
    padding: 0.5rem 0.7rem;
    background: #f9f9f9;
    text-decoration: none;
    color: inherit;
  }
  .mono {
    font-family: ui-monospace, monospace;
    font-size: 0.82rem;
  }
  .muted {
    color: #666;
  }
</style>
