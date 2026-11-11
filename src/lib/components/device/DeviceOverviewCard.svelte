<script lang="ts">
  import Battery from "@lucide/svelte/icons/battery";
  import Footprints from "@lucide/svelte/icons/footprints";
  import Heart from "@lucide/svelte/icons/heart";
  import Pencil from "@lucide/svelte/icons/pencil";
  import { FeatureId } from "#lib/bleContract";
  import { describeConnection, describeLastSeen } from "#lib/connectionStatus";
  import { firmwareLabel } from "#lib/firmwareLabel";
  import {
    activeFeatureIds,
    activeProfileId,
    batteryCharging,
    batteryPercent,
    batteryVoltageMv,
    connected,
    connectTo,
    connectingAddress,
    deviceInformation,
    disconnectDevice,
    heartRateBpm,
    nativeConnection,
    profiles,
    selectedAddress,
    stepCount,
  } from "#lib/stores/bleSession";
  import { toastCaught } from "#lib/stores/toast";
  import type { RememberedDevice } from "#lib/types/device";
  import { bleAddressesEqual } from "#lib/utils/deviceId";
  import Card from "#lib/components/ui/Card.svelte";
  import StatTile from "#lib/components/ui/StatTile.svelte";
  import StatusPill from "#lib/components/ui/StatusPill.svelte";

  type Props = {
    device: RememberedDevice | undefined;
    /** Raw route address, used when the device is not in the list. */
    address: string;
    deviceName: string;
    settingsHref: string;
    onrepair: () => Promise<void>;
    repairing: boolean;
  };

  let { device, address, deviceName, settingsHref, onrepair, repairing }: Props = $props();

  const live = $derived(
    Boolean(device && $connected && $selectedAddress && bleAddressesEqual($selectedAddress, device.address)),
  );
  const connecting = $derived(
    Boolean($connectingAddress && bleAddressesEqual($connectingAddress, address)),
  );
  const status = $derived(describeConnection($nativeConnection, address, bleAddressesEqual));
  const profileLabel = $derived(
    $profiles.find((profile) => profile.id === $activeProfileId)?.label ?? $activeProfileId,
  );
  const android = $derived(typeof navigator !== "undefined" && /android/i.test(navigator.userAgent));
  const showHeartRate = $derived(live && $activeFeatureIds.includes(FeatureId.bleHr));
  const showSteps = $derived(live && $activeFeatureIds.includes(FeatureId.bleDisSteps));

  async function connect(): Promise<void> {
    try {
      await connectTo(address);
    } catch (error) {
      toastCaught("Could not connect", error);
    }
  }
</script>

<Card padded={false}>
  <div class="p-4">
    <div class="flex items-start justify-between gap-3">
      <div class="min-w-0">
        <p class="m-0 truncate text-lg font-semibold">{deviceName}</p>
        {#if device}
          <p class="m-0 mt-0.5 font-mono text-xs text-surface-700-300">{address}</p>
          <p class="m-0 mt-1 text-sm text-surface-700-300">
            {live
              ? firmwareLabel(device, $deviceInformation)
              : firmwareLabel(device, null)}
            · {profileLabel}{device.profilePreference === "auto" ? " (auto)" : ""}
          </p>
        {:else}
          <p class="m-0 mt-1 text-sm text-surface-700-300">
            Furu does not have this device saved. Pair it from Devices to keep its settings.
          </p>
        {/if}
      </div>
      <div class="flex shrink-0 items-center gap-1">
        <StatusPill label={status.label} tone={status.tone} busy={status.busy} />
        <a
          class="btn-icon btn-sm preset-tonal-surface"
          href={settingsHref}
          aria-label="Open device settings"
        >
          <Pencil class="size-4" />
        </a>
      </div>
    </div>

    {#if live}
      <div class="mt-4 grid grid-cols-3 gap-2">
        <StatTile
          label="Battery"
          value={$batteryPercent !== null ? String($batteryPercent) : "—"}
          unit={$batteryPercent !== null ? "%" : undefined}
          tone={$batteryCharging ? "success" : "neutral"}
          hint={$batteryCharging
            ? "Charging"
            : $batteryVoltageMv !== null
              ? `${($batteryVoltageMv / 1000).toFixed(2)} V`
              : undefined}
        >
          {#snippet icon()}<Battery class="size-3.5" />{/snippet}
        </StatTile>
        {#if showHeartRate}
          <StatTile
            label="Heart"
            value={$heartRateBpm !== null ? String($heartRateBpm) : "—"}
            unit={$heartRateBpm !== null ? "bpm" : undefined}
            tone="error"
          >
            {#snippet icon()}<Heart class="size-3.5" />{/snippet}
          </StatTile>
        {/if}
        {#if showSteps}
          <StatTile
            label="Steps"
            value={$stepCount !== null ? $stepCount.toLocaleString() : "—"}
            tone="success"
          >
            {#snippet icon()}<Footprints class="size-3.5" />{/snippet}
          </StatTile>
        {/if}
      </div>
    {:else if device}
      <p class="m-0 mt-3 text-sm text-surface-700-300">
        Last seen {describeLastSeen(device.lastSeenAt)}. Connect to read battery and activity.
      </p>
    {/if}

    <div class="mt-4 flex flex-wrap gap-2">
      {#if live}
        <button class="btn btn-sm preset-tonal-surface" type="button" onclick={() => void disconnectDevice()}>
          Disconnect
        </button>
      {:else}
        <button
          class="btn btn-sm preset-filled-primary-500"
          type="button"
          disabled={connecting || repairing}
          onclick={() => void connect()}
        >
          {connecting ? "Connecting…" : "Connect"}
        </button>
      {/if}
      {#if connecting && !live}
        <button
          class="btn btn-sm preset-tonal-surface"
          type="button"
          onclick={() => void disconnectDevice()}
        >
          Cancel connection
        </button>
      {/if}
      {#if android}
        <button
          class="btn btn-sm preset-tonal-surface"
          type="button"
          disabled={connecting || repairing}
          onclick={() => void onrepair()}
        >
          {repairing ? "Repairing…" : "Repair connection"}
        </button>
      {/if}
    </div>
  </div>
</Card>
