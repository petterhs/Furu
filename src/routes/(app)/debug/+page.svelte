<script lang="ts">
  import { FeatureId } from "$lib/bleContract";
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
  } from "$lib/stores/bleSession";
  import { rememberedDevices } from "$lib/stores/devices";
  import {
    drainNotifications,
    postTestNotification,
    type ForwardedNotification,
  } from "$lib/stores/notificationForwarder";

  let notifTitle = $state("Furu");
  let notifMessage = $state("Hello from the companion app");
  let testTitle = $state("Furu debug test");
  let testMessage = $state("This should enter the notification drain queue");
  let drained = $state<ForwardedNotification[]>([]);
  let testingBusy = $state(false);
  let testError = $state<string | null>(null);
  let directConnectAddress = $state("");
  let directConnectBusy = $state(false);

  async function sendTestNotification() {
    testError = null;
    await postTestNotification(testTitle, testMessage);
  }

  async function drainNow() {
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

  async function sendAndDrain() {
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
    const addr = directConnectAddress.trim();
    if (!addr) return;
    directConnectBusy = true;
    try {
      await connectTo(addr, { skipScan: true });
    } finally {
      directConnectBusy = false;
    }
  }
</script>

<section class="grid gap-4">
  <article class="card border border-[color:var(--color-surface-200-800)] p-4 preset-tonal-surface">
    <h2 class="m-0 mb-3 text-base font-semibold">Profile</h2>
    <label class="label">
      <span class="label-text">Active profile</span>
      <select
        class="select"
        value={$activeProfileId}
        onchange={(e) => setActiveProfile((e.currentTarget as HTMLSelectElement).value)}
      >
        {#each $profiles as profile (profile.id)}
          <option value={profile.id}>{profile.label}</option>
        {/each}
      </select>
    </label>
    <p class="m-0 mt-3 text-sm">
      Features: {$activeFeatureIds.length ? $activeFeatureIds.join(", ") : "none"}
    </p>
  </article>

  <article class="card border border-[color:var(--color-surface-200-800)] p-4 preset-tonal-surface">
    <h2 class="m-0 mb-3 text-base font-semibold">BLE Session</h2>
    <div class="mb-3 flex flex-wrap gap-2">
      <button class="btn btn-sm preset-tonal-surface" type="button" onclick={refreshAdapter}>Adapter State</button>
      <button class="btn btn-sm preset-tonal-surface" type="button" onclick={() => requestBlePermissions(true)}>
        Permissions
      </button>
      {#if $scanning}
        <button class="btn btn-sm preset-tonal-surface" type="button" onclick={endScan}>Stop Scan</button>
      {:else}
        <button class="btn btn-sm preset-tonal-surface" type="button" onclick={beginScan}>Start Scan</button>
      {/if}
      <button class="btn btn-sm preset-tonal-surface" type="button" onclick={disconnectDevice} disabled={!$connected}>
        Disconnect
      </button>
    </div>
    <p class="m-0 text-sm">Adapter: {$adapterState}</p>
    <p class="m-0 mt-1 text-sm">
      Permissions: {$permissionsOk === null ? "unknown" : $permissionsOk ? "granted" : "denied"}
    </p>
    <p class="m-0 mt-1 text-sm">Connected: {$connected ? "yes" : "no"}</p>
  </article>

  <article class="card border border-[color:var(--color-surface-200-800)] p-4 preset-tonal-surface">
    <h2 class="m-0 mb-3 text-base font-semibold">GATT PoC Actions</h2>
    <p class="m-0 text-sm">
      Uses features <code class="font-mono text-xs">{FeatureId.bleCurrentTime}</code> and
      <code class="font-mono text-xs">{FeatureId.bleAnss}</code>.
    </p>
    <div class="mt-3 flex flex-wrap gap-2">
      <button class="btn btn-sm preset-filled-primary-500" type="button" onclick={sendCurrentTime} disabled={!$connected}>
        Send Current Time
      </button>
    </div>
    <label class="label mt-3">
      <span class="label-text">Notification title</span>
      <input class="input" bind:value={notifTitle} />
    </label>
    <label class="label mt-3">
      <span class="label-text">Notification message</span>
      <input class="input" bind:value={notifMessage} />
    </label>
    <button
      class="btn btn-sm preset-tonal-primary mt-3"
      type="button"
      onclick={() => sendNotification(notifTitle, notifMessage)}
      disabled={!$connected}
    >
      Send Notification
    </button>
  </article>

  <article class="card border border-[color:var(--color-surface-200-800)] p-4 preset-tonal-surface">
    <h2 class="m-0 mb-3 text-base font-semibold">Direct connect (no scan)</h2>
    <p class="m-0 text-sm text-[color:var(--color-surface-700-300)]">
      Same path as auto-reconnect: <code class="font-mono text-xs">connect(address)</code> without starting a BLE scan.
      Useful to verify the OS still knows the peripheral (often after bonding). If this fails, try Scan + Connect
      below.
    </p>
    <label class="label mt-3">
      <span class="label-text">Device address</span>
      <select class="select" bind:value={directConnectAddress}>
        {#each $rememberedDevices as d (d.id)}
          <option value={d.address}>{d.name} — {d.address}</option>
        {:else}
          <option value="">No remembered devices (pair from Home first)</option>
        {/each}
      </select>
    </label>
    <div class="mt-3 flex flex-wrap gap-2">
      <button
        class="btn btn-sm preset-filled-primary-500"
        type="button"
        onclick={() => void connectDirectNoScan()}
        disabled={directConnectBusy || !$rememberedDevices.length || $connectingAddress != null}
      >
        {directConnectBusy ? "Connecting…" : "Connect without scan"}
      </button>
    </div>
  </article>

  <article class="card border border-[color:var(--color-surface-200-800)] p-4 preset-tonal-surface">
    <h2 class="m-0 mb-3 text-base font-semibold">Scan + Connect</h2>
    <ul class="m-0 grid list-none gap-2 p-0">
      {#each $scanResults as d (d.address)}
        <li class="flex items-center justify-between gap-3 border border-[color:var(--color-surface-200-800)] p-3 preset-tonal-surface">
          <span class="min-w-0 truncate text-sm">{d.name || "Unknown"} ({d.address})</span>
          <button class="btn btn-sm preset-filled-primary-500 shrink-0" type="button" onclick={() => connectTo(d.address)}>
            Connect
          </button>
        </li>
      {:else}
        <li class="border border-[color:var(--color-surface-200-800)] p-3 text-sm preset-tonal-surface">
          No scan results yet.
        </li>
      {/each}
    </ul>
  </article>

  <article class="card border border-[color:var(--color-surface-200-800)] p-4 preset-tonal-surface">
    <h2 class="m-0 mb-3 text-base font-semibold">Notification Forwarder Test</h2>
    <label class="label">
      <span class="label-text">Notification title</span>
      <input class="input" bind:value={testTitle} />
    </label>
    <label class="label mt-3">
      <span class="label-text">Notification message</span>
      <input class="input" bind:value={testMessage} />
    </label>
    <div class="mt-3 flex flex-wrap gap-2">
      <button
        class="btn btn-sm preset-tonal-surface"
        type="button"
        onclick={sendTestNotification}
        disabled={testingBusy}
      >
        Post local test notification
      </button>
      <button class="btn btn-sm preset-tonal-surface" type="button" onclick={drainNow} disabled={testingBusy}>
        Drain now
      </button>
      <button class="btn btn-sm preset-filled-primary-500" type="button" onclick={sendAndDrain} disabled={testingBusy}>
        Post + drain
      </button>
    </div>
    <p class="m-0 mt-3 text-sm">Drained count: {drained.length}</p>
    {#if testError}
      <p class="m-0 mt-2 text-sm text-red-500">{testError}</p>
    {/if}
    <ul class="m-0 mt-3 grid list-none gap-2 p-0">
      {#each drained as item, index (`${item.packageName}-${item.postedAtMs}-${index}`)}
        <li class="border border-[color:var(--color-surface-200-800)] p-3 text-sm preset-tonal-surface">
          <p class="m-0"><span class="font-semibold">Package:</span> {item.packageName}</p>
          <p class="m-0 mt-1"><span class="font-semibold">Title:</span> {item.title}</p>
          <p class="m-0 mt-1"><span class="font-semibold">Message:</span> {item.message}</p>
          <p class="m-0 mt-1"><span class="font-semibold">Time:</span> {new Date(item.postedAtMs).toLocaleTimeString()}</p>
        </li>
      {:else}
        <li class="border border-[color:var(--color-surface-200-800)] p-3 text-sm preset-tonal-surface">
          No drained notifications yet.
        </li>
      {/each}
    </ul>
  </article>
</section>
