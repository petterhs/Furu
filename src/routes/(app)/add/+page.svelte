<script lang="ts">
  import {
    adapterState,
    beginScan,
    connectTo,
    endScan,
    permissionsOk,
    refreshAdapter,
    requestBlePermissions,
    scanResults,
    scanning,
  } from "$lib/stores/bleSession";
  import { bindRememberedDevice } from "$lib/stores/devices";
</script>

<section class="stack">
  <article class="card">
    <h2>Bluetooth Controls</h2>
    <div class="row">
      <button type="button" onclick={() => requestBlePermissions(true)}>Request Permissions</button>
      <button type="button" onclick={refreshAdapter}>Refresh Adapter</button>
      {#if $scanning}
        <button type="button" onclick={endScan}>Stop Scan</button>
      {:else}
        <button type="button" onclick={beginScan}>Start Scan</button>
      {/if}
    </div>
    <p>Adapter: {$adapterState}</p>
    <p>Permissions: {$permissionsOk === null ? "unknown" : $permissionsOk ? "granted" : "denied"}</p>
    <p>Scanning: {$scanning ? "yes" : "no"}</p>
  </article>

  <article class="card">
    <h2>Scan Results</h2>
    {#if !$scanResults.length}
      <p>No devices found yet.</p>
    {:else}
      <ul class="list">
        {#each $scanResults as device (device.address)}
          <li>
            <div>
              <strong>{device.name || "Unknown device"}</strong>
              <div class="mono">{device.address}</div>
              <div class="mono">RSSI {device.rssi}</div>
            </div>
            <div class="actions">
              <button type="button" onclick={() => bindRememberedDevice(device)}>Bind</button>
              <button type="button" onclick={() => connectTo(device.address)}>Connect</button>
            </div>
          </li>
        {/each}
      </ul>
    {/if}
  </article>
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
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
  }
  button {
    border: 1px solid #c7c7c7;
    background: #f9f9f9;
    border-radius: 0.5rem;
    padding: 0.5rem 0.7rem;
  }
  .list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.65rem;
  }
  li {
    border: 1px solid #e6e6e6;
    border-radius: 0.6rem;
    padding: 0.6rem;
    display: flex;
    justify-content: space-between;
    gap: 0.7rem;
  }
  .actions {
    display: grid;
    gap: 0.4rem;
    align-content: start;
  }
  .mono {
    font-family: ui-monospace, monospace;
    font-size: 0.8rem;
    color: #666;
  }
</style>
