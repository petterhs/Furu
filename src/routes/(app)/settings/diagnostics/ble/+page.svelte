<script lang="ts">
  import { FeatureId } from "#lib/bleContract";
  import {
    activeFeatureIds,
    activeProfileId,
    adapterState,
    beginScan,
    connectTo,
    connected,
    connectingAddress,
    disconnectDevice,
    endScan,
    permissionsOk,
    profiles,
    refreshAdapter,
    requestBlePermissions,
    scanResults,
    scanning,
    sendCurrentTime,
    sendNotification,
    setActiveProfile,
  } from "#lib/stores/bleSession";
  import { rememberedDevices } from "#lib/stores/devices";
  import {
    drainNotifications,
    postTestNotification,
    type ForwardedNotification,
  } from "#lib/stores/notificationForwarder";
  import { toastCaught, toastSuccess } from "#lib/stores/toast";
  import Card from "#lib/components/ui/Card.svelte";
  import ListRow from "#lib/components/ui/ListRow.svelte";
  import PageHeading from "#lib/components/ui/PageHeading.svelte";
  import SettingRow from "#lib/components/ui/SettingRow.svelte";

  let notifTitle = $state("Furu");
  let notifMessage = $state("Hello from the companion app");
  let testTitle = $state("Furu debug test");
  let testMessage = $state("This should enter the notification drain queue");
  let drained = $state<ForwardedNotification[]>([]);
  let testingBusy = $state(false);
  let testError = $state<string | null>(null);
  let directConnectAddress = $state("");
  let directConnectBusy = $state(false);

  async function sendTestNotification(): Promise<void> {
    testError = null;
    try {
      await postTestNotification(testTitle, testMessage);
    } catch (error) {
      toastCaught("Could not post a test notification", error);
    }
  }

  async function drainNow(): Promise<void> {
    testingBusy = true;
    testError = null;
    try {
      drained = await drainNotifications();
    } catch (error) {
      testError = error instanceof Error ? error.message : "Failed to drain notifications.";
    } finally {
      testingBusy = false;
    }
  }

  async function sendAndDrain(): Promise<void> {
    await sendTestNotification();
    await new Promise((resolve) => setTimeout(resolve, 500));
    await drainNow();
  }

  $effect(() => {
    const list = $rememberedDevices;
    if (!directConnectAddress.trim() && list.length > 0) {
      directConnectAddress = list[0].address;
    }
  });

  async function connectDirectNoScan(): Promise<void> {
    const address = directConnectAddress.trim();
    if (!address) return;
    directConnectBusy = true;
    try {
      await connectTo(address, { skipScan: true });
      toastSuccess("Direct connect requested");
    } catch (error) {
      toastCaught("Direct connect failed", error);
    } finally {
      directConnectBusy = false;
    }
  }

  async function connectScanned(address: string): Promise<void> {
    try {
      await connectTo(address);
    } catch (error) {
      toastCaught("Could not connect", error);
    }
  }
</script>

<div class="grid gap-4">
  <PageHeading
    title="Bluetooth tools"
    description="Manual controls for diagnosing connection problems. Daily use should not need this page."
  />

  <Card title="Adapter and session">
    <div class="grid gap-2 text-sm">
      <div class="flex justify-between gap-3 border-b border-surface-200-800 pb-1.5">
        <span class="text-surface-700-300">Adapter</span>
        <span class="font-medium">{$adapterState}</span>
      </div>
      <div class="flex justify-between gap-3 border-b border-surface-200-800 pb-1.5">
        <span class="text-surface-700-300">Permissions</span>
        <span class="font-medium">{$permissionsOk === null ? "unknown" : $permissionsOk ? "granted" : "denied"}</span>
      </div>
      <div class="flex justify-between gap-3">
        <span class="text-surface-700-300">Connected</span>
        <span class="font-medium">{$connected ? "yes" : "no"}</span>
      </div>
    </div>
    <div class="mt-3 flex flex-wrap gap-2">
      <button class="btn btn-sm preset-tonal-surface" type="button" onclick={refreshAdapter}>Refresh adapter</button>
      <button class="btn btn-sm preset-tonal-surface" type="button" onclick={() => requestBlePermissions(true)}>
        Request permissions
      </button>
      {#if $scanning}
        <button class="btn btn-sm preset-tonal-surface" type="button" onclick={endScan}>Stop scan</button>
      {:else}
        <button class="btn btn-sm preset-tonal-surface" type="button" onclick={beginScan}>Start scan</button>
      {/if}
      <button class="btn btn-sm preset-tonal-surface" type="button" onclick={() => void disconnectDevice()} disabled={!$connected}>
        Disconnect
      </button>
    </div>
  </Card>

  <Card title="Active profile">
    <SettingRow label="Profile" hint="Which feature set Furu assumes for the connected watch." stacked>
      <select
        class="select"
        value={$activeProfileId}
        onchange={(event) => setActiveProfile(event.currentTarget.value)}
      >
        {#each $profiles as profile (profile.id)}
          <option value={profile.id}>{profile.label}</option>
        {/each}
      </select>
    </SettingRow>
    <p class="m-0 mt-3 text-xs text-surface-700-300">
      Features: {$activeFeatureIds.length ? $activeFeatureIds.join(", ") : "none"}
    </p>
  </Card>

  <Card title="Test actions" description="Requires a connected watch whose profile includes the feature.">
    <div class="flex flex-wrap gap-2">
      <button
        class="btn btn-sm preset-filled-primary-500"
        type="button"
        disabled={!$connected || !$activeFeatureIds.includes(FeatureId.bleCurrentTime)}
        onclick={() => void sendCurrentTime()}
      >
        Send current time
      </button>
    </div>
    <div class="mt-4 grid gap-2">
      <input class="input" placeholder="Notification title" bind:value={notifTitle} />
      <input class="input" placeholder="Notification message" bind:value={notifMessage} />
      <button
        class="btn btn-sm preset-tonal-primary justify-center"
        type="button"
        disabled={!$connected || !$activeFeatureIds.includes(FeatureId.bleAnss)}
        onclick={() => void sendNotification(notifTitle, notifMessage)}
      >
        Send notification
      </button>
    </div>
  </Card>

  <Card
    title="Connect without scanning"
    description="Uses the same path as auto-reconnect, so it verifies the OS still knows the peripheral."
  >
    <select class="select" bind:value={directConnectAddress}>
      {#each $rememberedDevices as device (device.id)}
        <option value={device.address}>{device.name} — {device.address}</option>
      {:else}
        <option value="">No remembered devices; pair one from Devices first</option>
      {/each}
    </select>
    <button
      class="btn btn-sm preset-filled-primary-500 mt-2 w-full justify-center"
      type="button"
      onclick={() => void connectDirectNoScan()}
      disabled={directConnectBusy || !$rememberedDevices.length || $connectingAddress != null}
    >
      {directConnectBusy ? "Connecting…" : "Connect without scan"}
    </button>
  </Card>

  <Card title="Nearby devices">
    <div class="grid gap-2">
      {#each $scanResults as device (device.address)}
        <ListRow
          title={device.name || "Unknown device"}
          subtitle={device.address}
          detail={`Signal ${device.rssi} dBm`}
        >
          {#snippet trailing()}
            <button
              class="btn btn-xs preset-filled-primary-500"
              type="button"
              onclick={() => void connectScanned(device.address)}
            >
              Connect
            </button>
          {/snippet}
        </ListRow>
      {:else}
        <p class="m-0 text-sm text-surface-700-300">No scan results yet. Start a scan above.</p>
      {/each}
    </div>
  </Card>

  <Card title="Notification forwarder test">
    <div class="grid gap-2">
      <input class="input" placeholder="Title" bind:value={testTitle} />
      <input class="input" placeholder="Message" bind:value={testMessage} />
      <div class="flex flex-wrap gap-2">
        <button class="btn btn-sm preset-tonal-surface" type="button" onclick={() => void sendTestNotification()} disabled={testingBusy}>
          Post local notification
        </button>
        <button class="btn btn-sm preset-tonal-surface" type="button" onclick={() => void drainNow()} disabled={testingBusy}>
          Drain now
        </button>
        <button class="btn btn-sm preset-filled-primary-500" type="button" onclick={() => void sendAndDrain()} disabled={testingBusy}>
          Post and drain
        </button>
      </div>
    </div>
    <p class="m-0 mt-3 text-sm text-surface-700-300">Drained: {drained.length}</p>
    {#if testError}
      <p class="m-0 mt-1 text-sm text-error-500" role="alert">{testError}</p>
    {/if}
    <div class="mt-3 grid gap-2">
      {#each drained as item, index (`${item.packageName}-${item.postedAtMs}-${index}`)}
        <div class="rounded-lg border border-surface-200-800 p-2 text-sm">
          <p class="m-0 font-mono text-xs text-surface-700-300">{item.packageName}</p>
          <p class="m-0 mt-1 font-medium">{item.title}</p>
          <p class="m-0 mt-0.5 text-surface-700-300">{item.message}</p>
          <p class="m-0 mt-1 text-xs text-surface-600-400">{new Date(item.postedAtMs).toLocaleTimeString()}</p>
        </div>
      {:else}
        <p class="m-0 text-sm text-surface-700-300">Nothing drained yet.</p>
      {/each}
    </div>
  </Card>
</div>
