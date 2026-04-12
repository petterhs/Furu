<script lang="ts">
  import { onMount } from "svelte";
  import {
    type BleDevice,
    checkPermissions,
    connect,
    disconnect,
    getAdapterState,
    getConnectionUpdates,
    getScanningUpdates,
    readString,
    sendString,
    startScan,
    stopScan,
  } from "@mnlphlp/plugin-blec";

  /** Same service/characteristic UUIDs as the plugin’s `examples/test-server`. */
  const SERVICE_UUID = "A07498CA-AD5B-474E-940D-16F1FBE7E8CD";
  const CHARACTERISTIC_UUID = "51FF12BB-3ED8-46E5-B4F9-D64E2FEC021B";

  let devices = $state<BleDevice[]>([]);
  let connected = $state(false);
  let scanning = $state(false);
  let adapterState = $state<string>("—");
  let permissionsOk = $state<boolean | null>(null);
  let logLines = $state<string[]>([]);
  let sendPayload = $state("hello from furu");
  let readResult = $state("");

  function log(msg: string) {
    logLines = [...logLines.slice(-80), `${new Date().toISOString().slice(11, 19)} ${msg}`];
  }

  onMount(() => {
    void (async () => {
      await getConnectionUpdates((state) => {
        connected = state;
        log(`connection: ${state ? "connected" : "disconnected"}`);
      });
      await getScanningUpdates((state) => {
        scanning = state;
      });
    })();
  });

  async function refreshAdapter() {
    try {
      adapterState = await getAdapterState();
    } catch (e) {
      log(`adapter state error: ${String(e)}`);
    }
  }

  async function requestPermissions(ask: boolean) {
    try {
      permissionsOk = await checkPermissions(ask);
      log(`permissions (${ask ? "may prompt" : "no prompt"}): ${permissionsOk}`);
    } catch (e) {
      log(`permissions error: ${String(e)}`);
    }
  }

  async function beginScan() {
    devices = [];
    try {
      await startScan(
        (found) => {
          devices = found;
        },
        15_000,
        false,
      );
    } catch (e) {
      log(`startScan error: ${String(e)}`);
    }
  }

  async function endScan() {
    try {
      await stopScan();
    } catch (e) {
      log(`stopScan error: ${String(e)}`);
    }
  }

  async function connectTo(addr: string) {
    try {
      await connect(addr, () => log("device disconnected (callback)"), false);
      log(`connect requested: ${addr}`);
    } catch (e) {
      log(`connect error: ${String(e)}`);
    }
  }

  async function doDisconnect() {
    try {
      await disconnect();
      log("disconnect requested");
    } catch (e) {
      log(`disconnect error: ${String(e)}`);
    }
  }

  async function doSend() {
    try {
      await sendString(CHARACTERISTIC_UUID, sendPayload, "withResponse", SERVICE_UUID);
      log(`send ok (${sendPayload.length} chars)`);
    } catch (e) {
      log(`send error: ${String(e)}`);
    }
  }

  async function doRead() {
    try {
      readResult = await readString(CHARACTERISTIC_UUID, SERVICE_UUID);
      log(`read ok (${readResult.length} chars)`);
    } catch (e) {
      readResult = "";
      log(`read error: ${String(e)}`);
    }
  }
</script>

<main class="wrap">
  <h1>BLE PoC (tauri-plugin-blec)</h1>
  <p class="hint">
    Use the plugin’s
    <a href="https://github.com/MnlPhlp/tauri-plugin-blec/tree/main/examples/test-server" target="_blank" rel="noreferrer">test-server</a>
    example on another machine or phone to exercise GATT read/write.
  </p>

  <section class="row">
    <button type="button" onclick={refreshAdapter}>Adapter state</button>
    <span>{adapterState}</span>
    <button type="button" onclick={() => requestPermissions(true)}>Permissions (prompt if needed)</button>
    <button type="button" onclick={() => requestPermissions(false)}>Permissions (no prompt)</button>
    <span>{permissionsOk === null ? "—" : permissionsOk ? "granted" : "denied"}</span>
  </section>

  <section class="row">
    {#if scanning}
      <button type="button" onclick={endScan}>Stop scan</button>
      <span class="scanning">Scanning…</span>
    {:else}
      <button type="button" onclick={beginScan}>Scan 15s</button>
    {/if}
    <span>{connected ? "Connected" : "Not connected"}</span>
    <button type="button" onclick={doDisconnect} disabled={!connected}>Disconnect</button>
  </section>

  <section class="gatt">
    <label>
      Payload
      <input bind:value={sendPayload} />
    </label>
    <button type="button" onclick={doSend} disabled={!connected}>Send (with response)</button>
    <button type="button" onclick={doRead} disabled={!connected}>Read</button>
    <pre class="readout">{readResult || "—"}</pre>
  </section>

  <ul class="devices">
    {#each devices as d (d.address)}
      <li>
        <button type="button" class="dev" onclick={() => connectTo(d.address)}>
          Connect
        </button>
        <span class="name">{d.name || "(no name)"}</span>
        <span class="addr">{d.address}</span>
        <span class="rssi">RSSI {d.rssi}</span>
      </li>
    {:else}
      <li class="empty">No devices in the last scan result yet.</li>
    {/each}
  </ul>

  <section class="log">
    <h2>Log</h2>
    {#each logLines as line}
      <div>{line}</div>
    {/each}
  </section>
</main>

<style>
  .wrap {
    max-width: 52rem;
    margin: 0 auto;
    padding: 1.25rem 1rem 3rem;
    font-family: system-ui, sans-serif;
    line-height: 1.45;
  }

  h1 {
    font-size: 1.35rem;
    margin: 0 0 0.5rem;
  }

  .hint {
    margin: 0 0 1rem;
    color: #555;
    font-size: 0.9rem;
  }

  .hint a {
    color: #246;
  }

  section {
    margin-bottom: 1rem;
  }

  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem 0.75rem;
    align-items: center;
  }

  .scanning {
    color: #0a6;
    font-weight: 600;
  }

  .gatt {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    align-items: flex-start;
  }

  .gatt label {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    width: 100%;
    max-width: 28rem;
  }

  .gatt input {
    padding: 0.35rem 0.5rem;
  }

  .readout {
    margin: 0;
    padding: 0.5rem;
    background: #f4f4f4;
    border-radius: 6px;
    min-height: 2.5rem;
    white-space: pre-wrap;
    width: 100%;
    max-width: 36rem;
    font-size: 0.85rem;
  }

  .devices {
    list-style: none;
    padding: 0;
    margin: 0 0 1rem;
    border: 1px solid #ddd;
    border-radius: 8px;
    max-height: 14rem;
    overflow: auto;
  }

  .devices li {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem 0.75rem;
    align-items: center;
    padding: 0.45rem 0.65rem;
    border-bottom: 1px solid #eee;
  }

  .devices li:last-child {
    border-bottom: none;
  }

  .devices .empty {
    color: #777;
    font-style: italic;
  }

  button.dev {
    flex: 0 0 auto;
  }

  .name {
    font-weight: 600;
  }

  .addr {
    font-family: ui-monospace, monospace;
    font-size: 0.85rem;
  }

  .rssi {
    font-size: 0.85rem;
    color: #666;
  }

  .log {
    font-size: 0.8rem;
    background: #1e1e1e;
    color: #e0e0e0;
    padding: 0.75rem 1rem;
    border-radius: 8px;
    max-height: 12rem;
    overflow: auto;
  }

  .log h2 {
    margin: 0 0 0.5rem;
    font-size: 0.95rem;
  }

  @media (prefers-color-scheme: dark) {
    .hint {
      color: #aaa;
    }

    .readout {
      background: #2a2a2a;
      color: #eee;
    }

    .devices {
      border-color: #444;
    }

    .devices li {
      border-bottom-color: #333;
    }
  }
</style>
