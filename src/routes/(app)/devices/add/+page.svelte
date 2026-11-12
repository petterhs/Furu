<script lang="ts">
  import { goto } from "$app/navigation";
  import { onMount } from "svelte";
  import { Radio, Search } from "@lucide/svelte";
  import {
    beginScan,
    connected,
    connectTo,
    selectedAddress,
    requestBlePermissions,
    scanning,
    scanResults,
  } from "#lib/stores/bleSession";
  import { ProfileId } from "#lib/bleContract";
  import { resolveProfileIdFromDeviceName } from "#lib/profileNameMatch";
  import { deviceProfileCatalog } from "#lib/stores/deviceProfiles";
  import { toastCaught } from "#lib/stores/toast";
  import Card from "#lib/components/ui/Card.svelte";
  import EmptyState from "#lib/components/ui/EmptyState.svelte";
  import ListRow from "#lib/components/ui/ListRow.svelte";
  import PageHeading from "#lib/components/ui/PageHeading.svelte";

  let showUnknownDevices = $state(false);
  let cancelling = false;
  const PERMISSION_POLL_INTERVAL_MS = 300;
  const PERMISSION_POLL_TIMEOUT_MS = 6_000;

  /** Watches are recognised by their advertised name; unknown devices are opt-in. */
  const filteredResults = $derived.by(() => {
    if (showUnknownDevices) return $scanResults;
    const rules = $deviceProfileCatalog.nameRules;
    return $scanResults.filter(
      (device) => resolveProfileIdFromDeviceName(device.name, rules) !== ProfileId.unknown,
    );
  });
  const hiddenUnknownCount = $derived($scanResults.length - filteredResults.length);

  async function handleConnect(address: string): Promise<void> {
    try {
      await connectTo(address);
      if ($connected && $selectedAddress && $selectedAddress.toLowerCase() === address.toLowerCase()) {
        await goto("/home");
      }
    } catch (error) {
      toastCaught("Could not pair this device", error);
    }
  }

  onMount(() => {
    void (async () => {
      // The OS prompt only appears for a request with `ask`, so poll until granted.
      const initial = await requestBlePermissions(true);
      if (cancelling) return;
      let granted = initial === true;
      if (!granted) {
        const deadline = Date.now() + PERMISSION_POLL_TIMEOUT_MS;
        while (!cancelling && Date.now() < deadline) {
          await new Promise((resolve) => setTimeout(resolve, PERMISSION_POLL_INTERVAL_MS));
          granted = (await requestBlePermissions(false)) === true;
          if (granted) break;
        }
      }
      if (!granted || cancelling) return;
      await beginScan();
    })();

    return () => {
      cancelling = true;
    };
  });
</script>

<div class="grid gap-4">
  <PageHeading
    title="Pair a watch"
    description="Turn Bluetooth on and keep the watch nearby. Nearby watches appear below."
  />

  <Card>
    <div class="flex items-center gap-2 text-sm">
      {#if $scanning}
        <span
          class="inline-block size-3.5 animate-spin rounded-full border-2 border-primary-500 border-t-transparent"
          aria-hidden="true"
        ></span>
        <span class="text-surface-700-300">Scanning for watches…</span>
      {:else}
        <Search class="size-4 text-surface-700-300" aria-hidden="true" />
        <span class="text-surface-700-300">Scan idle</span>
      {/if}
    </div>

    <label class="mt-3 flex items-center gap-2 text-sm">
      <input class="checkbox" type="checkbox" bind:checked={showUnknownDevices} />
      <span>Show devices Furu does not recognise</span>
    </label>

    <div class="mt-3 grid gap-2">
      {#each filteredResults as device (device.address)}
        <ListRow
          title={device.name || "Unknown device"}
          subtitle={device.address}
          detail={`Signal ${device.rssi} dBm`}
        >
          {#snippet leading()}<Radio class="size-4" />{/snippet}
          {#snippet trailing()}
            <button
              class="btn btn-xs preset-filled-primary-500"
              type="button"
              onclick={() => void handleConnect(device.address)}
            >
              Pair
            </button>
          {/snippet}
        </ListRow>
      {:else}
        <EmptyState
          title={$scanning ? "No watches found yet" : "Scanning has not started"}
          description={$scanning
            ? "Give the watch a moment. Some firmwares stop advertising while connected to another device."
            : "Grant Bluetooth permission to start scanning."}
        />
      {/each}
    </div>

    {#if hiddenUnknownCount > 0 && !showUnknownDevices}
      <p class="m-0 mt-3 text-xs text-surface-700-300">
        {hiddenUnknownCount} other Bluetooth device{hiddenUnknownCount === 1 ? "" : "s"} hidden.
      </p>
    {/if}
  </Card>
</div>
