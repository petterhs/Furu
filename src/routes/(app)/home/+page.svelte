<script lang="ts">
  import { connectTo, connected, selectedAddress } from "$lib/stores/bleSession";
  import { devicesHydrated, rememberedDevices } from "$lib/stores/devices";
  import { bleAddressesEqual } from "$lib/utils/deviceId";

  const isConnectedDevice = (address: string) =>
    Boolean($connected && $selectedAddress && bleAddressesEqual($selectedAddress, address));
</script>

<section class="stack">
  {#if !$devicesHydrated}
    <p>Loading devices...</p>
  {:else if !$rememberedDevices.length}
    <p>No remembered devices.</p>
  {:else}
    {#each $rememberedDevices as device (device.id)}
      <div class="card">
        <a class="card-body" href={`/device/${device.id}`}>
          <div class="card-head">
            <span class="device-name">{device.name}</span>
          </div>
          <p class="mono">{device.address}</p>
        </a>

        <div class="card-corner">
          {#if isConnectedDevice(device.address)}
            <span class="status connected">Connected</span>
          {:else}
            <button class="status connect-button" type="button" onclick={() => void connectTo(device.address)}>
              Connect
            </button>
          {/if}
        </div>
      </div>
    {/each}
  {/if}

  <a class="button" href="/add">Add Device</a>
</section>

<style>
  .stack {
    display: grid;
    gap: 0.9rem;
  }
  .card {
    position: relative;
    background: #fff;
    border: 1px solid #ddd;
    border-radius: 0.75rem;
    padding: 0;
    overflow: hidden;
  }
  .card-body {
    display: block;
    padding: 0.9rem 5.75rem 0.9rem 0.9rem;
    text-decoration: none;
    color: inherit;
  }
  .card-body:focus-visible {
    outline: 2px solid #0d47a1;
    outline-offset: -2px;
  }
  .card-corner {
    position: absolute;
    top: 0.75rem;
    right: 0.75rem;
    display: flex;
    align-items: center;
    justify-content: flex-end;
  }
  p {
    margin: 0.25rem 0;
  }
  .card-head {
    display: grid;
    grid-template-columns: 1fr auto;
    align-items: center;
    gap: 0.6rem;
  }
  .device-name {
    color: #0d47a1;
    font-weight: 700;
  }
  .mono {
    font-family: ui-monospace, monospace;
    font-size: 0.82rem;
    color: #666;
  }
  .status {
    font-size: 0.8rem;
    font-weight: 700;
    border-radius: 999px;
    padding: 0.3rem 0.6rem;
    text-decoration: none;
  }
  .connected {
    background: #e6f6ea;
    color: #1b5e20;
  }
  .connect-button {
    background: #eef4ff;
    color: #0d47a1;
    border: none;
    cursor: pointer;
    font: inherit;
  }
  .button {
    display: inline-block;
    text-align: center;
    padding: 0.65rem 0.8rem;
    border-radius: 0.6rem;
    text-decoration: none;
    background: #0d47a1;
    color: #fff;
    font-weight: 600;
  }
</style>
