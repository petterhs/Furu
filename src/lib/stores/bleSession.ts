import { Channel, invoke } from "@tauri-apps/api/core";
import {
  type BleDevice,
  checkPermissions,
  connect,
  disconnect,
  getAdapterState,
  getScanningUpdates,
  startScan,
  stopScan,
} from "@mnlphlp/plugin-blec";
import { get, writable } from "svelte/store";
import type { ProfileInfo } from "$lib/bleContract";
import { ProfileId } from "$lib/bleContract";
import { bindRememberedDevice, getRememberedByAddress, touchRememberedDevice } from "$lib/stores/devices";
import { bleAddressesEqual } from "$lib/utils/deviceId";

export const scanResults = writable<BleDevice[]>([]);
export const connected = writable(false);
export const scanning = writable(false);
export const adapterState = writable<string>("—");
export const permissionsOk = writable<boolean | null>(null);
export const logLines = writable<string[]>([]);
export const profiles = writable<ProfileInfo[]>([]);
export const activeProfileId = writable<string>(ProfileId.unknown);
export const activeFeatureIds = writable<string[]>([]);
export const selectedAddress = writable<string | null>(null);
export const connectingAddress = writable<string | null>(null);
export const connectError = writable<{ address: string; message: string } | null>(null);

let initialized = false;
const connectionListeners = new Set<(state: boolean) => void>();

function pushLog(message: string): void {
  const line = `${new Date().toISOString().slice(11, 19)} ${message}`;
  logLines.update((lines) => [...lines.slice(-80), line]);
}

async function syncAndroidBleKeepalive(isConnected: boolean): Promise<void> {
  try {
    if (isConnected) {
      await invoke("plugin:ble-keepalive|start_service");
    } else {
      await invoke("plugin:ble-keepalive|stop_service");
    }
  } catch (error) {
    pushLog(`BLE keepalive (${isConnected ? "start" : "stop"}): ${String(error)}`);
  }
}

export async function refreshProfileState(): Promise<void> {
  try {
    activeProfileId.set(await invoke<string>("ble_get_active_profile"));
    activeFeatureIds.set(await invoke<string[]>("ble_list_features_for_active_profile"));
  } catch (error) {
    pushLog(`profile state error: ${String(error)}`);
  }
}

export async function initializeBleSession(): Promise<void> {
  if (initialized) return;
  initialized = true;

  try {
    profiles.set(await invoke<ProfileInfo[]>("ble_list_profiles"));
    await refreshProfileState();
  } catch (error) {
    pushLog(`ble_list_profiles error: ${String(error)}`);
  }

  const connectionChannel = new Channel<boolean>();
  connectionChannel.onmessage = (state) => {
    connected.set(state);
    pushLog(`connection: ${state ? "connected" : "disconnected"}`);
    void syncAndroidBleKeepalive(state);
    for (const listener of connectionListeners) {
      listener(state);
    }
  };
  await invoke("plugin:blec|connection_state", { update: connectionChannel });

  await getScanningUpdates((state) => {
    scanning.set(state);
  });
}

/** Subscribe to live BLE connection updates (mirrors the single native subscription). */
export function subscribeConnectionState(handler: (connected: boolean) => void): () => void {
  connectionListeners.add(handler);
  handler(get(connected));
  return () => {
    connectionListeners.delete(handler);
  };
}

export async function setActiveProfile(profileId: string): Promise<void> {
  try {
    await invoke("ble_set_active_profile", { profileId });
    activeProfileId.set(profileId);
    await refreshProfileState();
    pushLog(`active profile: ${profileId}`);
  } catch (error) {
    pushLog(`ble_set_active_profile error: ${String(error)}`);
  }
}

export async function refreshAdapter(): Promise<void> {
  try {
    adapterState.set(await getAdapterState());
  } catch (error) {
    pushLog(`adapter state error: ${String(error)}`);
  }
}

export async function requestBlePermissions(ask: boolean): Promise<void> {
  try {
    const ok = await checkPermissions(ask);
    permissionsOk.set(ok);
    pushLog(`permissions (${ask ? "may prompt" : "no prompt"}): ${ok}`);
  } catch (error) {
    pushLog(`permissions error: ${String(error)}`);
  }
}

export async function beginScan(): Promise<void> {
  scanResults.set([]);
  try {
    await startScan((found) => scanResults.set(found), 15_000, false);
  } catch (error) {
    pushLog(`startScan error: ${String(error)}`);
  }
}

export async function endScan(): Promise<void> {
  try {
    await stopScan();
  } catch (error) {
    pushLog(`stopScan error: ${String(error)}`);
  }
}

const CONNECT_SCAN_TIMEOUT_MS = 15_000;
const CONNECT_ATTEMPT_TIMEOUT_MS = 12_000;

async function connectWithTimeout(address: string, timeoutMs: number): Promise<void> {
  await Promise.race([
    connect(address, () => pushLog("device disconnected (callback)"), false),
    new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`connect timeout after ${Math.round(timeoutMs / 1000)}s`));
      }, timeoutMs);
    }),
  ]);
}

/**
 * Run a scan until `address` appears (or timeout). Some platforms only allow
 * `connect` to peripherals seen during an active / recent scan.
 *
 * Does not stop the scan when a match appears — stopping before `connect` can
 * drop the peripheral from the cache on some stacks; `connectTo` stops scan
 * after attempting connection.
 */
function scanUntilAddressFound(address: string, timeoutMs: number): Promise<BleDevice | null> {
  const requested = address.trim();
  return new Promise((resolve, reject) => {
    let settled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const settle = (device: BleDevice | null) => {
      if (settled) return;
      settled = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      resolve(device);
    };

    timeoutId = setTimeout(() => {
      const match = get(scanResults).find((d) => bleAddressesEqual(d.address, requested));
      settle(match ?? null);
    }, timeoutMs);

    startScan(
      (devices) => {
        scanResults.set(devices);
        const match = devices.find((d) => bleAddressesEqual(d.address, requested));
        if (!match || settled) return;
        settle(match);
      },
      timeoutMs,
      false,
    )
      .catch((error) => {
        if (settled) return;
        settled = true;
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        reject(error);
      });
  });
}

export async function connectTo(address: string): Promise<void> {
  let stopScanAfterConnect = false;
  const requested = address.trim();
  if (!requested) return;
  if (get(connectingAddress)) {
    pushLog(`connect: already connecting to ${get(connectingAddress)}`);
    return;
  }
  connectingAddress.set(requested);
  connectError.set(null);
  try {
    const ok = await checkPermissions(true);
    permissionsOk.set(ok);
    if (!ok) {
      connectError.set({ address: requested, message: "BLE permissions not granted." });
      pushLog("connect: BLE permissions not granted");
      return;
    }
    try {
      await stopScan();
    } catch {
      /* ignore: no scan in progress */
    }
    scanResults.set([]);
    pushLog(`connect: scanning for ${requested}…`);
    const fromScan = await scanUntilAddressFound(requested, CONNECT_SCAN_TIMEOUT_MS);
    if (!fromScan) {
      connectError.set({ address: requested, message: "Could not find the device while scanning." });
      pushLog(`connect: device not found while scanning: ${requested}`);
      return;
    }
    stopScanAfterConnect = true;

    const connectAddress = fromScan.address;
    try {
      await connectWithTimeout(connectAddress, CONNECT_ATTEMPT_TIMEOUT_MS);
      selectedAddress.set(connectAddress);
      connectError.set(null);
      if (getRememberedByAddress(connectAddress)) {
        void touchRememberedDevice(connectAddress, fromScan.name);
      } else {
        void bindRememberedDevice(fromScan);
      }
      pushLog(`connect requested: ${connectAddress}`);
    } finally {
      if (stopScanAfterConnect) {
        try {
          await stopScan();
        } catch {
          /* ignore */
        }
      }
    }
  } catch (error) {
    connectError.set({ address: requested, message: "Could not connect to the device. Please try again." });
    pushLog(`connect error: ${String(error)}`);
  } finally {
    connectingAddress.set(null);
  }
}

export async function disconnectDevice(): Promise<void> {
  try {
    await disconnect();
    selectedAddress.set(null);
    pushLog("disconnect requested");
  } catch (error) {
    pushLog(`disconnect error: ${String(error)}`);
  }
}

export async function sendCurrentTime(): Promise<void> {
  try {
    await invoke("ble_poc_send_current_time");
    pushLog("current time (CTS 0x2A2B) write sent");
  } catch (error) {
    pushLog(`CTS time write error: ${String(error)}`);
  }
}

export async function sendNotification(title: string, message: string): Promise<void> {
  try {
    await invoke("ble_poc_send_notification", { title, message });
    pushLog("ANS New Alert (0x2A46) sent");
  } catch (error) {
    pushLog(`ANS notification error: ${String(error)}`);
  }
}

