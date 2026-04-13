<script lang="ts">
  import { FeatureId } from "$lib/bleContract";
  import {
    activeFeatureIds,
    activeProfileId,
    adapterState,
    beginScan,
    connectTo,
    connected,
    disconnectDevice,
    endScan,
    logLines,
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

  let notifTitle = $state("Furu");
  let notifMessage = $state("Hello from the companion app");
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

  <article
    class="card max-h-48 overflow-y-auto border border-[color:var(--color-surface-200-800)] p-4 font-mono text-xs preset-filled-surface-950-50"
  >
    <h2 class="m-0 mb-3 text-sm font-semibold">Log</h2>
    {#each $logLines as line (`${line}`)}
      <div class="whitespace-pre-wrap">{line}</div>
    {/each}
  </article>
</section>
