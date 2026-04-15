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
import { derived, get, writable, type Readable } from "svelte/store";
import type { ProfileInfo } from "$lib/bleContract";
import { FeatureId, ProfileId } from "$lib/bleContract";
import { appSettings } from "$lib/stores/appSettings";
import { notificationFilters } from "$lib/stores/notificationFilters";
import { resolveProfileIdFromDeviceName } from "$lib/profileNameMatch";
import {
  appendBatterySample,
} from "$lib/stores/batteryHistory";
import {
  bindRememberedDevice,
  clampCtsSyncIntervalMinutes,
  getRememberedByAddress,
  rememberedDevices,
  touchRememberedDevice,
} from "$lib/stores/devices";
import {
  catalogToProfileInfos,
  deviceProfileCatalog,
  getFeatureIdsForProfileId,
  hydrateDeviceProfiles,
} from "$lib/stores/deviceProfiles";
import { bleAddressesEqual } from "$lib/utils/deviceId";

export const scanResults = writable<BleDevice[]>([]);
export const connected = writable(false);
export const scanning = writable(false);
export const adapterState = writable<string>("—");
export const permissionsOk = writable<boolean | null>(null);
export const logLines = writable<string[]>([]);
export const profiles: Readable<ProfileInfo[]> = derived(deviceProfileCatalog, catalogToProfileInfos);
export const activeProfileId = writable<string>(ProfileId.unknown);
export const activeFeatureIds = writable<string[]>([]);
export const selectedAddress = writable<string | null>(null);
export const connectingAddress = writable<string | null>(null);
export const connectError = writable<{ address: string; message: string } | null>(null);
export const batteryPercent = writable<number | null>(null);
export const batteryUpdatedAt = writable<number | null>(null);
export const batteryError = writable<string | null>(null);

let initialized = false;
const connectionListeners = new Set<(state: boolean) => void>();

let ctsSyncIntervalId: ReturnType<typeof setInterval> | null = null;
let batteryPollIntervalId: ReturnType<typeof setInterval> | null = null;
let batteryReadInFlight = false;
const BATTERY_POLL_INTERVAL_MS = 60_000;
let lastBatteryGateLog: string | null = null;

async function applySessionProfileAfterConnect(
  connectAddress: string,
  advertisementName: string | undefined,
): Promise<void> {
  const remembered = getRememberedByAddress(connectAddress);
  let profileId: string = ProfileId.unknown;
  if (remembered?.profilePreference && remembered.profilePreference !== "auto") {
    profileId = remembered.profilePreference;
  } else if (remembered?.profilePreference === "auto") {
    profileId = resolveProfileIdFromDeviceName(advertisementName, get(deviceProfileCatalog).nameRules);
  }

  const featureIds = getFeatureIdsForProfileId(profileId);

  try {
    await invoke("ble_set_active_capabilities", { profileId, featureIds });
    activeProfileId.set(profileId);
    await refreshProfileState();
    pushLog(`session profile: ${profileId} (${featureIds.length} features)`);
  } catch (error) {
    pushLog(`ble_set_active_capabilities failed (${profileId}), falling back to unknown: ${String(error)}`);
    try {
      const fb = getFeatureIdsForProfileId(ProfileId.unknown);
      await invoke("ble_set_active_capabilities", { profileId: ProfileId.unknown, featureIds: fb });
      activeProfileId.set(ProfileId.unknown);
      await refreshProfileState();
    } catch (e2) {
      pushLog(`ble_set_active_capabilities (unknown) error: ${String(e2)}`);
    }
  }
}

function reconcileCtsSyncTimer(): void {
  if (ctsSyncIntervalId !== null) {
    clearInterval(ctsSyncIntervalId);
    ctsSyncIntervalId = null;
  }
  if (!get(connected)) return;
  const addr = get(selectedAddress);
  if (!addr) return;
  const remembered = getRememberedByAddress(addr);
  if (!remembered?.currentTimeSyncEnabled) return;
  if (!get(activeFeatureIds).includes(FeatureId.bleCurrentTime)) return;

  const minutes = clampCtsSyncIntervalMinutes(remembered.currentTimeSyncIntervalMinutes);
  ctsSyncIntervalId = setInterval(() => {
    void sendCurrentTime();
  }, minutes * 60_000);
  void sendCurrentTime();
}

function wireCtsSyncReconciliation(): void {
  const run = () => {
    reconcileCtsSyncTimer();
  };
  connected.subscribe(run);
  selectedAddress.subscribe(run);
  activeFeatureIds.subscribe(run);
  rememberedDevices.subscribe(run);
  deviceProfileCatalog.subscribe(run);
  run();
}

function clearBatteryState(): void {
  batteryPercent.set(null);
  batteryUpdatedAt.set(null);
  batteryError.set(null);
}

function logBatteryGate(message: string): void {
  if (lastBatteryGateLog === message) return;
  lastBatteryGateLog = message;
  pushLog(message);
}

async function refreshBatteryLevel(): Promise<void> {
  if (batteryReadInFlight) {
    logBatteryGate("battery polling: read already in flight");
    return;
  }
  if (!get(connected)) {
    logBatteryGate("battery polling: skipped (not connected)");
    return;
  }
  if (!get(selectedAddress)) {
    logBatteryGate("battery polling: skipped (no selected address)");
    return;
  }
  if (!get(activeFeatureIds).includes(FeatureId.bleBattery)) {
    logBatteryGate("battery polling: skipped (active profile lacks ble.battery)");
    return;
  }
  lastBatteryGateLog = null;
  batteryReadInFlight = true;
  try {
    pushLog("battery read: requesting BAS battery level");
    const level = await invoke<number>("ble_read_battery_percentage");
    batteryPercent.set(level);
    batteryUpdatedAt.set(Date.now());
    batteryError.set(null);
    const connectedAddress = get(selectedAddress);
    if (connectedAddress) {
      const remembered = getRememberedByAddress(connectedAddress);
      if (remembered) {
        await appendBatterySample(remembered.id, level);
      } else {
        pushLog(`battery read: sample skipped (unknown remembered device ${connectedAddress})`);
      }
    }
    pushLog(`battery read: ${level}%`);
  } catch (error) {
    batteryError.set(`Battery read failed: ${String(error)}`);
    pushLog(`battery read error: ${String(error)}`);
  } finally {
    batteryReadInFlight = false;
  }
}

function reconcileBatteryPolling(): void {
  if (batteryPollIntervalId !== null) {
    clearInterval(batteryPollIntervalId);
    batteryPollIntervalId = null;
  }
  if (!get(connected) || !get(selectedAddress)) {
    logBatteryGate("battery polling: disabled (missing connection context)");
    clearBatteryState();
    return;
  }
  if (!get(activeFeatureIds).includes(FeatureId.bleBattery)) {
    logBatteryGate("battery polling: disabled (feature gate ble.battery missing)");
    clearBatteryState();
    return;
  }
  logBatteryGate("battery polling: enabled");
  void refreshBatteryLevel();
  batteryPollIntervalId = setInterval(() => {
    void refreshBatteryLevel();
  }, BATTERY_POLL_INTERVAL_MS);
}

function wireBatteryPollingReconciliation(): void {

  const run = () => {
    reconcileBatteryPolling();
  };
  connected.subscribe(run);
  selectedAddress.subscribe(run);
  activeFeatureIds.subscribe(run);
  run();
}

async function syncNativeNotificationForwardingGates(): Promise<void> {
  const isConnected = get(connected);
  const globalEnabled = get(appSettings).notificationForwardingEnabled;
  const addr = get(selectedAddress);
  const deviceEnabled = addr ? (getRememberedByAddress(addr)?.notificationsEnabled ?? false) : false;
  const blockedPackages = get(notificationFilters).blockedPackages;
  try {
    await invoke("ble_set_connection_state", { connected: isConnected });
    await invoke("ble_set_notification_forwarding_enabled", { enabled: globalEnabled });
    await invoke("ble_set_active_device_notifications_enabled", { enabled: deviceEnabled });
    await invoke("ble_set_blocked_notification_packages", { packages: blockedPackages });
  } catch (error) {
    pushLog(`notification gate sync error: ${String(error)}`);
  }
}

function wireNotificationForwardingGateSync(): void {
  const run = () => {
    void syncNativeNotificationForwardingGates();
  };
  connected.subscribe(run);
  selectedAddress.subscribe(run);
  rememberedDevices.subscribe(run);
  appSettings.subscribe(run);
  notificationFilters.subscribe(run);
  run();
}

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
    await hydrateDeviceProfiles();
  } catch (error) {
    pushLog(`device profiles hydrate error: ${String(error)}`);
  }

  try {
    await refreshProfileState();
  } catch (error) {
    pushLog(`refresh profile state error: ${String(error)}`);
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

  wireCtsSyncReconciliation();
  wireBatteryPollingReconciliation();
  wireNotificationForwardingGateSync();
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
  const featureIds = getFeatureIdsForProfileId(profileId);
  try {
    await invoke("ble_set_active_capabilities", { profileId, featureIds });
    activeProfileId.set(profileId);
    await refreshProfileState();
    pushLog(`active profile: ${profileId}`);
  } catch (error) {
    pushLog(`ble_set_active_capabilities error: ${String(error)}`);
  }
}

export async function refreshAdapter(): Promise<void> {
  try {
    adapterState.set(await getAdapterState());
  } catch (error) {
    pushLog(`adapter state error: ${String(error)}`);
  }
}

export async function requestBlePermissions(ask: boolean): Promise<boolean> {
  try {
    const ok = await checkPermissions(ask);
    permissionsOk.set(ok);
    pushLog(`permissions (${ask ? "may prompt" : "no prompt"}): ${ok}`);
    return ok;
  } catch (error) {
    pushLog(`permissions error: ${String(error)}`);
    return false;
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
        await touchRememberedDevice(connectAddress, fromScan.name);
      } else {
        await bindRememberedDevice(fromScan);
      }
      await applySessionProfileAfterConnect(connectAddress, fromScan.name);
      await syncNativeNotificationForwardingGates();
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

