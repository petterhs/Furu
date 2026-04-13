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

<section class="stack">
  <article class="card">
    <h2>Profile</h2>
    <label>
      Active profile
      <select value={$activeProfileId} onchange={(e) => setActiveProfile((e.currentTarget as HTMLSelectElement).value)}>
        {#each $profiles as profile (profile.id)}
          <option value={profile.id}>{profile.label}</option>
        {/each}
      </select>
    </label>
    <p>Features: {$activeFeatureIds.length ? $activeFeatureIds.join(", ") : "none"}</p>
  </article>

  <article class="card">
    <h2>BLE Session</h2>
    <div class="row">
      <button type="button" onclick={refreshAdapter}>Adapter State</button>
      <button type="button" onclick={() => requestBlePermissions(true)}>Permissions</button>
      {#if $scanning}
        <button type="button" onclick={endScan}>Stop Scan</button>
      {:else}
        <button type="button" onclick={beginScan}>Start Scan</button>
      {/if}
      <button type="button" onclick={disconnectDevice} disabled={!$connected}>Disconnect</button>
    </div>
    <p>Adapter: {$adapterState}</p>
    <p>Permissions: {$permissionsOk === null ? "unknown" : $permissionsOk ? "granted" : "denied"}</p>
    <p>Connected: {$connected ? "yes" : "no"}</p>
  </article>

  <article class="card">
    <h2>GATT PoC Actions</h2>
    <p>Uses features <code>{FeatureId.bleCurrentTime}</code> and <code>{FeatureId.bleAnss}</code>.</p>
    <div class="row">
      <button type="button" onclick={sendCurrentTime} disabled={!$connected}>Send Current Time</button>
    </div>
    <label>
      Notification title
      <input bind:value={notifTitle} />
    </label>
    <label>
      Notification message
      <input bind:value={notifMessage} />
    </label>
    <button type="button" onclick={() => sendNotification(notifTitle, notifMessage)} disabled={!$connected}>
      Send Notification
    </button>
  </article>

  <article class="card">
    <h2>Scan + Connect</h2>
    <ul class="list">
      {#each $scanResults as d (d.address)}
        <li>
          <span>{d.name || "Unknown"} ({d.address})</span>
          <button type="button" onclick={() => connectTo(d.address)}>Connect</button>
        </li>
      {:else}
        <li>No scan results yet.</li>
      {/each}
    </ul>
  </article>

  <article class="card log">
    <h2>Log</h2>
    {#each $logLines as line (`${line}`)}
      <div>{line}</div>
    {/each}
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
  label {
    display: grid;
    gap: 0.35rem;
    margin-bottom: 0.5rem;
  }
  input,
  select,
  button {
    border: 1px solid #c7c7c7;
    border-radius: 0.5rem;
    padding: 0.5rem 0.7rem;
    background: #fff;
  }
  .list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.5rem;
  }
  li {
    display: flex;
    justify-content: space-between;
    gap: 0.5rem;
    align-items: center;
  }
  .log {
    background: #1f1f1f;
    color: #ececec;
    max-height: 12rem;
    overflow: auto;
    font-family: ui-monospace, monospace;
    font-size: 0.8rem;
  }
</style>
