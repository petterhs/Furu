<script lang="ts">
  import { onMount } from "svelte";
  import {
    beginScan,
    connectTo,
    requestBlePermissions,
    scanning,
    scanResults,
  } from "$lib/stores/bleSession";
  import { ProfileId } from "$lib/bleContract";
  import { resolveProfileIdFromDeviceName } from "$lib/profileNameMatch";
  import { deviceProfileCatalog } from "$lib/stores/deviceProfiles";

  let showUnknownDevices = $state(false);
  let cancelled = false;
  const PERMISSION_POLL_INTERVAL_MS = 300;
  const PERMISSION_POLL_TIMEOUT_MS = 6_000;

  const filteredResults = $derived.by(() => {
    if (showUnknownDevices) return $scanResults;
    const rules = $deviceProfileCatalog.nameRules;
    return $scanResults.filter(
      (device) => resolveProfileIdFromDeviceName(device.name, rules) !== ProfileId.unknown,
    );
  });

  onMount(() => {
    void (async () => {
      // Trigger OS prompt when needed.
      const initialPermission = await requestBlePermissions(true);
      if (cancelled) return;

      let permissionsGranted = initialPermission === true;
      if (!permissionsGranted) {
        const deadline = Date.now() + PERMISSION_POLL_TIMEOUT_MS;
        while (!cancelled && Date.now() < deadline) {
          await new Promise((resolve) => setTimeout(resolve, PERMISSION_POLL_INTERVAL_MS));
          permissionsGranted = (await requestBlePermissions(false)) === true;
          if (permissionsGranted) break;
        }
      }

      if (!permissionsGranted || cancelled) return;
      await beginScan();
    })();

    return () => {
      cancelled = true;
    };
  });
</script>

<section class="grid gap-4">
  <article class="card border border-[color:var(--color-surface-200-800)] p-4 preset-tonal-surface">
    <h2 class="m-0 text-base font-semibold">Scan Results</h2>
    <div class="mt-2 flex items-center gap-2 text-sm text-[color:var(--color-surface-700-300)]">
      {#if $scanning}
        <span
          class="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-[color:var(--color-primary-500)] border-t-transparent"
          aria-hidden="true"
        ></span>
        <span>Scanning for devices...</span>
      {:else}
        <span>Scan idle</span>
      {/if}
    </div>
    <label class="mt-3 flex items-center gap-2 text-sm">
      <input class="checkbox" type="checkbox" bind:checked={showUnknownDevices} />
      <span>Show unknown devices</span>
    </label>
    {#if !filteredResults.length}
      <p class="m-0 mt-3 text-sm text-[color:var(--color-surface-700-300)]">No devices found yet.</p>
    {:else}
      <ul class="m-0 mt-3 grid list-none gap-3 p-0">
        {#each filteredResults as device (device.address)}
          <li
            class="flex flex-col gap-3 border border-[color:var(--color-surface-200-800)] p-3 preset-tonal-surface sm:flex-row sm:items-center sm:justify-between"
          >
            <div class="min-w-0">
              <strong class="block truncate">{device.name || "Unknown device"}</strong>
              <div class="mt-1 font-mono text-xs text-[color:var(--color-surface-700-300)]">{device.address}</div>
              <div class="mt-1 font-mono text-xs text-[color:var(--color-surface-700-300)]">RSSI {device.rssi}</div>
            </div>
            <div class="grid gap-2 sm:w-44 sm:justify-items-stretch">
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
