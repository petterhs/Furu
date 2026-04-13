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
import { bindRememberedDevice, touchRememberedDevice } from "$lib/stores/devices";
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

export async function connectTo(address: string): Promise<void> {
  try {
    const requested = address.trim();
    const fromScan = get(scanResults).find((device) => bleAddressesEqual(device.address, requested));
    const connectAddress = fromScan?.address ?? requested;
    await connect(connectAddress, () => pushLog("device disconnected (callback)"), false);
    selectedAddress.set(connectAddress);
    if (fromScan) {
      void touchRememberedDevice(connectAddress, fromScan.name);
    } else {
      void bindRememberedDevice({
        address: connectAddress,
        name: "",
        rssi: 0,
        isConnected: true,
        isBonded: false,
        services: [],
        manufacturerData: {},
        serviceData: {},
      });
    }
    pushLog(`connect requested: ${connectAddress}`);
  } catch (error) {
    pushLog(`connect error: ${String(error)}`);
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

