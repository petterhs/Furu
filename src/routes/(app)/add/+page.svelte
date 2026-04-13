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

<section class="grid gap-4">
  <article class="card border border-[color:var(--color-surface-200-800)] p-4 preset-tonal-surface">
    <h2 class="m-0 mb-3 text-base font-semibold">Bluetooth Controls</h2>
    <div class="mb-3 flex flex-wrap gap-2">
      <button class="btn btn-sm preset-tonal-surface" type="button" onclick={() => requestBlePermissions(true)}>
        Request Permissions
      </button>
      <button class="btn btn-sm preset-tonal-surface" type="button" onclick={refreshAdapter}>Refresh Adapter</button>
      {#if $scanning}
        <button class="btn btn-sm preset-tonal-surface" type="button" onclick={endScan}>Stop Scan</button>
      {:else}
        <button class="btn btn-sm preset-tonal-surface" type="button" onclick={beginScan}>Start Scan</button>
      {/if}
    </div>
    <p class="m-0 text-sm">Adapter: {$adapterState}</p>
    <p class="m-0 mt-1 text-sm">
      Permissions: {$permissionsOk === null ? "unknown" : $permissionsOk ? "granted" : "denied"}
    </p>
    <p class="m-0 mt-1 text-sm">Scanning: {$scanning ? "yes" : "no"}</p>
  </article>

  <article class="card border border-[color:var(--color-surface-200-800)] p-4 preset-tonal-surface">
    <h2 class="m-0 mb-3 text-base font-semibold">Scan Results</h2>
    {#if !$scanResults.length}
      <p class="m-0 text-sm text-[color:var(--color-surface-700-300)]">No devices found yet.</p>
    {:else}
      <ul class="m-0 grid list-none gap-3 p-0">
        {#each $scanResults as device (device.address)}
          <li
            class="flex flex-col gap-3 border border-[color:var(--color-surface-200-800)] p-3 preset-tonal-surface sm:flex-row sm:items-center sm:justify-between"
          >
            <div class="min-w-0">
              <strong class="block truncate">{device.name || "Unknown device"}</strong>
              <div class="mt-1 font-mono text-xs text-[color:var(--color-surface-700-300)]">{device.address}</div>
              <div class="mt-1 font-mono text-xs text-[color:var(--color-surface-700-300)]">RSSI {device.rssi}</div>
            </div>
            <div class="grid gap-2 sm:w-44 sm:justify-items-stretch">
              <button class="btn btn-sm preset-tonal-primary" type="button" onclick={() => bindRememberedDevice(device)}>
                Bind
              </button>
              <button class="btn btn-sm preset-filled-primary-500" type="button" onclick={() => connectTo(device.address)}>
                Connect
              </button>
            </div>
          </li>
        {/each}
      </ul>
    {/if}
  </article>
</section>
