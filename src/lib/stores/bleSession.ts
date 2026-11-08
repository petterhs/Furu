import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import {
  type BleDevice,
  checkPermissions,
  getAdapterState,
  getScanningUpdates,
  read,
  startScan,
  stopScan,
  subscribe,
  unsubscribe,
} from "@mnlphlp/plugin-blec";
import { derived, get, writable, type Readable } from "svelte/store";
import type { ProfileInfo } from "$lib/bleContract";
import { FeatureId, ProfileId } from "$lib/bleContract";
import { appSettings } from "$lib/stores/appSettings";
import { notificationFilters } from "$lib/stores/notificationFilters";
import { resolveProfileIdFromDeviceName } from "$lib/profileNameMatch";
import { defaultNameRules } from "$lib/persistence/deviceProfilesStore";
import {
  appendBatterySample,
  mergeBatterySamples,
} from "$lib/stores/batteryHistory";
import type { BatteryHistorySample } from "$lib/types/batteryHistory";
import {
  bindRememberedDevice,
  clampAutoReconnectIntervalMinutes,
  clampAutoReconnectMaxAttempts,
  clampCtsSyncIntervalMinutes,
  getRememberedByAddress,
  rememberedDevices,
  devicesHydrated,
  recordDetectedProfile,
  touchRememberedDevice,
} from "$lib/stores/devices";
import {
  catalogToProfileInfos,
  deviceProfileCatalog,
  getFeatureIdsForProfileId,
  hydrateDeviceProfiles,
} from "$lib/stores/deviceProfiles";
import { mergeNativeConnectionHistory } from "$lib/stores/connectionHistory";
import {
  HEART_RATE_MEASUREMENT_CHAR_UUID,
  HEART_RATE_SERVICE_UUID,
  parseHeartRateMeasurement,
} from "$lib/ble/hrMeasurement";
import type { DeviceInformation } from "$lib/types/deviceInformation";
import { bleAddressesEqual } from "$lib/utils/deviceId";
import { beginBleMutation, endBleMutation, isDfuSessionActive, dfuInProgress,
  beginCapabilityUpdate, endCapabilityUpdate, bleOperationsReleased } from "$lib/stores/dfuSession";

export type ConnectOptions = { /** Debug action: request direct MAC connection. */ skipScan?: boolean };

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
export const batteryVoltageMv = writable<number | null>(null);
export const batteryCharging = writable<boolean | null>(null);
export const batteryUpdatedAt = writable<number | null>(null);
export const batteryError = writable<string | null>(null);
export const stepCount = writable<number | null>(null);
export const stepCountUpdatedAt = writable<number | null>(null);
export const stepCountError = writable<string | null>(null);
export const heartRateBpm = writable<number | null>(null);
export const heartRateUpdatedAt = writable<number | null>(null);
export const heartRateError = writable<string | null>(null);
export const deviceInformation = writable<DeviceInformation | null>(null);
export const deviceInformationError = writable<string | null>(null);
export const deviceInformationLoading = writable(false);

let initialized = false;
const connectionListeners = new Set<(state: boolean) => void>();

let ctsSyncIntervalId: ReturnType<typeof setInterval> | null = null;
let ctsSyncKey: string | null = null;
let ctsWriteInFlight: Promise<void> | null = null;
let batteryPollIntervalId: ReturnType<typeof setInterval> | null = null;
let batteryReadInFlight = false;
let batteryHistoryReadInFlight = false;
let batteryHistorySyncedAddress: string | null = null;
let batteryHistorySyncedAt = 0;
const BATTERY_HISTORY_SYNC_INTERVAL_MS = 30 * 60_000;
const BATTERY_POLL_INTERVAL_MS = 60_000;
let lastBatteryGateLog: string | null = null;

let stepPollIntervalId: ReturnType<typeof setInterval> | null = null;
let stepReadInFlight = false;
const STEP_POLL_INTERVAL_MS = 60_000;
let lastStepGateLog: string | null = null;

/** Monotonic token so overlapping async HR subscribe/unsubscribe runs do not race. */
let hrReconcileToken = 0;
let hrStaleTimerId: ReturnType<typeof setInterval> | null = null;
/** Hide HR if no valid notification for this long (watch HR app off / sensor idle). */
const HR_STALE_AFTER_MS = 120_000;

/** Avoid repeated DIS reads for the same connection unless forced. */
let disFetchCompletedForAddress: string | null = null;
let deviceInformationReadInFlight = false;

export type NativeConnectionSnapshot = {
  revision: number; sessionId: number; connected: boolean; status: string; address: string | null; name: string;
  profileId: string; featureIds: string[]; attempt: number; detail: string;
  events: { id: number; address: string; at: string; connected: boolean; detail: string }[];
};
export const nativeConnection = writable<NativeConnectionSnapshot | null>(null);
let latestNativeRevision = 0;
let nativeSessionToken = 0;
let nativeHistoryQueue: Promise<void> = Promise.resolve();
let nativePolicyQueue: Promise<void> = Promise.resolve();
let lastNativePolicies = "";

function syncNativeConnectionPolicies(): Promise<void> {
  if (!get(devicesHydrated)) return nativePolicyQueue;
  const catalog = get(deviceProfileCatalog);
  const policies = {
    notificationForwardingEnabled: get(appSettings).notificationForwardingEnabled,
    blockedNotificationPackages: get(notificationFilters).blockedPackages,
    devices: get(rememberedDevices).map((device) => ({
      address: device.address, name: device.name, nickname: device.nickname ?? "",
      profilePreference: device.profilePreference, enabled: device.autoReconnect,
      retryDelayMs: clampAutoReconnectIntervalMinutes(device.autoReconnectIntervalMinutes) * 60_000,
      maxFailures: clampAutoReconnectMaxAttempts(device.autoReconnectMaxAttempts),
      replayNotifications: device.replayMissedNotificationsOnReconnect ?? true,
      notificationsEnabled: device.notificationsEnabled,
    })),
    profiles: catalog.profiles.map((p) => ({ id: p.id, featureIds: p.featureIds })),
    nameRules: catalog.nameRules,
  };
  const key = JSON.stringify(policies);
  nativePolicyQueue = nativePolicyQueue.catch(() => {}).then(async () => {
    if (key === lastNativePolicies) return;
    await invoke("ble_connection_configure", { policies });
    lastNativePolicies = key;
  });
  return nativePolicyQueue;
}

function consumeNativeConnection(state: NativeConnectionSnapshot): void {
  if (state.revision <= latestNativeRevision) return;
  latestNativeRevision = state.revision;
  const wasConnected = get(connected);
  const previousAddress = get(selectedAddress);
  const previous = get(nativeConnection);
  const newSession = state.connected && previous?.sessionId !== state.sessionId;
  if (!state.connected || previousAddress !== state.address || newSession) nativeSessionToken++;
  if (newSession && wasConnected) {
    // A suspended WebView may have missed the intermediate disconnect snapshot.
    connected.set(false);
    for (const listener of connectionListeners) listener(false);
  }
  nativeConnection.set(state);
  selectedAddress.set(state.address);
  const pending = ["connecting", "reconnecting", "waiting_bluetooth", "disconnecting"].includes(state.status);
  connectingAddress.set(pending ? state.address : null);
  activeProfileId.set(state.profileId || ProfileId.unknown);
  if (JSON.stringify(get(activeFeatureIds)) !== JSON.stringify(state.featureIds)) activeFeatureIds.set(state.featureIds);
  connected.set(state.connected);
  if (state.status === "error" && state.address) connectError.set({ address: state.address, message: state.detail });
  else if (state.connected) connectError.set(null);
  if (state.connected && (newSession || !wasConnected || previousAddress !== state.address)) {
    const token = nativeSessionToken;
    void finalizeConnectSession(state.address!, state.name, token).catch((error) => pushLog(`session configuration: ${String(error)}`));
  }
  if (wasConnected !== state.connected || newSession) for (const listener of connectionListeners) listener(state.connected);
  if (previous?.status !== state.status || previous.detail !== state.detail) pushLog(`BLE: ${state.status}: ${state.detail}`);
  // Native history keeps the real timestamps while the WebView is suspended.
  nativeHistoryQueue = nativeHistoryQueue.catch(() => {}).then(async () => {
    await mergeNativeConnectionHistory(state.events.flatMap((event) => {
      const device = getRememberedByAddress(event.address);
      return device ? [{ deviceId: device.id, at: event.at, connected: event.connected, detail: event.detail, nativeId: event.id }] : [];
    }));
  }).catch((error) => pushLog(`BLE: connection history save failed: ${String(error)}`));
}

async function finalizeConnectSession(
  connectAddress: string,
  advertisementName: string | undefined,
  token: number,
): Promise<void> {
  const current = () => token === nativeSessionToken && get(connected) && bleAddressesEqual(get(selectedAddress) ?? "", connectAddress);
  if (!current()) return;
  selectedAddress.set(connectAddress);
  connectError.set(null);
  const remembered = getRememberedByAddress(connectAddress);
  if (remembered) {
    // Seed migrated entries from the previously saved BLE name before replacing it.
    if (remembered.detectedProfileId === undefined) {
      await recordDetectedProfile(connectAddress,
        resolveProfileIdFromDeviceName(remembered.name, defaultNameRules()));
    }
    await touchRememberedDevice(connectAddress, advertisementName);
  } else {
    await bindRememberedDevice({
      address: connectAddress,
      name: advertisementName || "Unknown device",
    } as BleDevice);
  }
  if (!current()) return;
  await applySessionProfileAfterConnect(connectAddress, advertisementName);
  if (!current()) return;
  await syncNativeNotificationForwardingGates();
  pushLog(`connect: session ready for ${connectAddress}`);
}

async function applySessionProfileAfterConnect(
  connectAddress: string,
  advertisementName: string | undefined,
): Promise<void> {
  // Firmware observations must not change merely because a user edits auto rules.
  const detected = resolveProfileIdFromDeviceName(advertisementName, defaultNameRules());
  await recordDetectedProfile(connectAddress, detected);
  if (!get(connected) || !bleAddressesEqual(get(selectedAddress) ?? "", connectAddress)) return;
  await reconcileSessionProfile();
}

/** Normal capability selection is owned by Rust alongside connection readiness. */
function reconcileSessionProfile(): Promise<void> {
  return syncNativeConnectionPolicies().catch((error) => pushLog(`BLE: profile configuration failed: ${String(error)}`));
}

function wireSessionProfileReconciliation(): void {
  const run = () => { void reconcileSessionProfile(); };
  connected.subscribe(run);
  selectedAddress.subscribe(run);
  rememberedDevices.subscribe(run);
  deviceProfileCatalog.subscribe(run);
  dfuInProgress.subscribe(run);
  bleOperationsReleased.subscribe(run);
}

function reconcileCtsSyncTimer(): void {
  const addr = get(connected) ? get(selectedAddress) : null;
  const remembered = addr ? getRememberedByAddress(addr) : null;
  const enabled = remembered?.currentTimeSyncEnabled && get(activeFeatureIds).includes(FeatureId.bleCurrentTime);
  const minutes = enabled ? clampCtsSyncIntervalMinutes(remembered?.currentTimeSyncIntervalMinutes) : 0;
  const key = addr && enabled ? `${addr.toLowerCase()}:${minutes}` : null;
  if (key === ctsSyncKey) return;
  ctsSyncKey = key;
  if (ctsSyncIntervalId !== null) {
    clearInterval(ctsSyncIntervalId);
    ctsSyncIntervalId = null;
  }
  if (key === null) return;
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
  batteryVoltageMv.set(null);
  batteryCharging.set(null);
  batteryUpdatedAt.set(null);
  batteryError.set(null);
}

type KongleBatteryCurrent = { voltageMv: number; percent: number; charging: boolean };

async function syncKongleBatteryHistory(address: string): Promise<void> {
  if (batteryHistoryReadInFlight ||
      (batteryHistorySyncedAddress === address && Date.now() - batteryHistorySyncedAt < BATTERY_HISTORY_SYNC_INTERVAL_MS)) return;
  batteryHistoryReadInFlight = true;
  const token = nativeSessionToken;
  try {
    const samples = await invoke<BatteryHistorySample[]>("ble_read_kongle_battery_history");
    if (token !== nativeSessionToken || !get(connected) || get(selectedAddress) !== address) return;
    const remembered = getRememberedByAddress(address);
    if (remembered) await mergeBatterySamples(remembered.id, samples);
    batteryHistorySyncedAddress = address;
    batteryHistorySyncedAt = Date.now();
    pushLog(`battery history: imported ${samples.length} watch samples`);
  } catch (error) {
    pushLog(`battery history read error: ${String(error)}`);
  } finally {
    batteryHistoryReadInFlight = false;
  }
}

function clearStepState(): void {
  stepCount.set(null);
  stepCountUpdatedAt.set(null);
  stepCountError.set(null);
}

function clearHrState(): void {
  heartRateBpm.set(null);
  heartRateUpdatedAt.set(null);
  heartRateError.set(null);
}

function clearDeviceInformationState(): void {
  deviceInformation.set(null);
  deviceInformationError.set(null);
  deviceInformationLoading.set(false);
}

function clearHrStaleTimer(): void {
  if (hrStaleTimerId !== null) {
    clearInterval(hrStaleTimerId);
    hrStaleTimerId = null;
  }
}

function startHrStaleTimer(): void {
  clearHrStaleTimer();
  hrStaleTimerId = setInterval(() => {
    const bpm = get(heartRateBpm);
    const at = get(heartRateUpdatedAt);
    if (bpm === null || at === null) return;
    if (Date.now() - at > HR_STALE_AFTER_MS) {
      heartRateBpm.set(null);
      heartRateUpdatedAt.set(null);
      pushLog("HR: cleared stale value (no recent valid updates)");
    }
  }, 30_000);
}

function applyHrPayload(data: number[]): void {
  const bpm = parseHeartRateMeasurement(data);
  heartRateBpm.set(bpm);
  if (bpm !== null) {
    heartRateUpdatedAt.set(Date.now());
    heartRateError.set(null);
  } else {
    heartRateUpdatedAt.set(null);
  }
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
  if (isDfuSessionActive()) {
    logBatteryGate("battery polling: skipped during DFU");
    return;
  }
  if (!get(selectedAddress)) {
    logBatteryGate("battery polling: skipped (no selected address)");
    return;
  }
  const features = get(activeFeatureIds);
  const hasBatteryService = features.includes(FeatureId.bleBattery);
  const hasKongleHistory = features.includes(FeatureId.kongleBatteryHistory);
  if (!hasBatteryService && !hasKongleHistory) {
    logBatteryGate("battery polling: skipped (profile has no battery capability)");
    return;
  }
  lastBatteryGateLog = null;
  batteryReadInFlight = true;
  const token = nativeSessionToken;
  const connectedAddress = get(selectedAddress);
  const isCurrent = () => token === nativeSessionToken && get(connected) && get(selectedAddress) === connectedAddress;
  try {
    if (hasBatteryService) {
      try {
        pushLog("battery read: requesting BAS battery level");
        const level = await invoke<number>("ble_read_battery_percentage");
        if (!isCurrent()) return;
        batteryPercent.set(level);
        batteryUpdatedAt.set(Date.now());
        batteryError.set(null);
        if (connectedAddress) {
          const remembered = getRememberedByAddress(connectedAddress);
          if (remembered) await appendBatterySample(remembered.id, level);
          else pushLog(`battery read: sample skipped (unknown remembered device ${connectedAddress})`);
        }
        pushLog(`battery read: ${level}%`);
      } catch (error) {
        if (!isCurrent()) return;
        batteryError.set(`Battery read failed: ${String(error)}`);
        pushLog(`battery read error: ${String(error)}`);
      }
    }
    if (!isCurrent()) return;
    if (hasKongleHistory) {
      try {
        const current = await invoke<KongleBatteryCurrent>("ble_read_kongle_battery_current");
        if (isCurrent()) {
          batteryVoltageMv.set(current.voltageMv);
          batteryCharging.set(current.charging);
          if (connectedAddress) {
            const remembered = getRememberedByAddress(connectedAddress);
            if (remembered) await mergeBatterySamples(remembered.id, [{
              at: new Date().toISOString(), percent: current.percent,
              voltageMv: current.voltageMv, charging: current.charging,
            }]);
          }
        }
      } catch (error) {
        pushLog(`Kongle battery telemetry read error: ${String(error)}`);
      }
      if (!isCurrent()) return;
      if (connectedAddress) void syncKongleBatteryHistory(connectedAddress);
    }
  } finally {
    batteryReadInFlight = false;
    if (token !== nativeSessionToken && get(connected)) queueMicrotask(() => { void refreshBatteryLevel(); });
  }
}

function reconcileBatteryPolling(): void {
  if (batteryPollIntervalId !== null) {
    clearInterval(batteryPollIntervalId);
    batteryPollIntervalId = null;
  }
  if (!get(connected) || !get(selectedAddress)) {
    batteryHistorySyncedAddress = null;
    batteryHistorySyncedAt = 0;
    logBatteryGate("battery polling: disabled (missing connection context)");
    clearBatteryState();
    return;
  }
  const features = get(activeFeatureIds);
  if (!features.includes(FeatureId.bleBattery) && !features.includes(FeatureId.kongleBatteryHistory)) {
    logBatteryGate("battery polling: disabled (no battery capability)");
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

function logStepGate(message: string): void {
  if (lastStepGateLog === message) return;
  lastStepGateLog = message;
  pushLog(message);
}

async function refreshStepCount(): Promise<void> {
  if (stepReadInFlight) {
    logStepGate("step polling: read already in flight");
    return;
  }
  if (!get(connected)) {
    logStepGate("step polling: skipped (not connected)");
    return;
  }
  if (!get(selectedAddress)) {
    logStepGate("step polling: skipped (no selected address)");
    return;
  }
  if (!get(activeFeatureIds).includes(FeatureId.bleDisSteps)) {
    logStepGate("step polling: skipped (active profile lacks ble.dis_steps)");
    return;
  }
  lastStepGateLog = null;
  stepReadInFlight = true;
  const token = nativeSessionToken;
  const address = get(selectedAddress);
  const current = () => token === nativeSessionToken && get(connected) && get(selectedAddress) === address;
  try {
    pushLog("step count read: requesting Motion Service");
    const steps = await invoke<number>("ble_read_step_count");
    if (!current()) return;
    stepCount.set(steps);
    stepCountUpdatedAt.set(Date.now());
    stepCountError.set(null);
    pushLog(`step count read: ${steps}`);
  } catch (error) {
    if (!current()) return;
    stepCountError.set(`Step count read failed: ${String(error)}`);
    pushLog(`step count read error: ${String(error)}`);
  } finally {
    stepReadInFlight = false;
    if (token !== nativeSessionToken && get(connected)) queueMicrotask(() => { void refreshStepCount(); });
  }
}

function reconcileStepPolling(): void {
  if (stepPollIntervalId !== null) {
    clearInterval(stepPollIntervalId);
    stepPollIntervalId = null;
  }
  if (!get(connected) || !get(selectedAddress)) {
    logStepGate("step polling: disabled (missing connection context)");
    clearStepState();
    return;
  }
  if (!get(activeFeatureIds).includes(FeatureId.bleDisSteps)) {
    logStepGate("step polling: disabled (feature gate ble.dis_steps missing)");
    clearStepState();
    return;
  }
  logStepGate("step polling: enabled");
  void refreshStepCount();
  stepPollIntervalId = setInterval(() => {
    void refreshStepCount();
  }, STEP_POLL_INTERVAL_MS);
}

function wireStepPollingReconciliation(): void {
  const run = () => {
    reconcileStepPolling();
  };
  connected.subscribe(run);
  selectedAddress.subscribe(run);
  activeFeatureIds.subscribe(run);
  run();
}

async function reconcileHeartRateSubscriptionAsync(): Promise<void> {
  const token = ++hrReconcileToken;
  clearHrStaleTimer();
  try {
    await unsubscribe(HEART_RATE_MEASUREMENT_CHAR_UUID).catch(() => {
      /* not subscribed */
    });
  } catch {
    /* ignore */
  }
  if (token !== hrReconcileToken) return;

  clearHrState();
  if (!get(connected) || !get(selectedAddress)) {
    pushLog("HR: subscription disabled (not connected)");
    return;
  }
  if (!get(activeFeatureIds).includes(FeatureId.bleHr)) {
    pushLog("HR: subscription disabled (feature gate ble.hr missing)");
    return;
  }

  try {
    await subscribe(HEART_RATE_MEASUREMENT_CHAR_UUID, (data) => {
      if (token !== hrReconcileToken) return;
      applyHrPayload(data);
    });
    if (token !== hrReconcileToken) {
      void unsubscribe(HEART_RATE_MEASUREMENT_CHAR_UUID).catch(() => {});
      return;
    }
    heartRateError.set(null);
    startHrStaleTimer();
    pushLog("HR: notifications enabled (0x2A37)");
    try {
      const initial = await read(HEART_RATE_MEASUREMENT_CHAR_UUID, HEART_RATE_SERVICE_UUID);
      if (token !== hrReconcileToken) return;
      applyHrPayload(initial);
    } catch {
      /* initial read is best-effort; streaming notifies are primary */
    }
  } catch (error) {
    if (token !== hrReconcileToken) return;
    clearHrState();
    heartRateError.set(`Heart rate subscribe failed: ${String(error)}`);
    pushLog(`HR subscribe error: ${String(error)}`);
  }
}

function reconcileHeartRateSubscription(): void {
  void reconcileHeartRateSubscriptionAsync();
}

function wireHeartRateSubscriptionReconciliation(): void {
  const run = () => {
    reconcileHeartRateSubscription();
  };
  connected.subscribe(run);
  selectedAddress.subscribe(run);
  activeFeatureIds.subscribe(run);
  run();
}

async function refreshDeviceInformation(): Promise<boolean> {
  if (deviceInformationReadInFlight || !get(connected) || !get(selectedAddress)) return false;
  if (!get(activeFeatureIds).includes(FeatureId.bleDeviceInformation)) return false;
  const token = nativeSessionToken;
  const address = get(selectedAddress);
  const current = () => token === nativeSessionToken && get(connected) && get(selectedAddress) === address;
  deviceInformationReadInFlight = true;
  deviceInformationLoading.set(true);
  deviceInformationError.set(null);
  deviceInformation.set(null);
  try {
    const data = await invoke<DeviceInformation>("ble_read_device_information");
    if (!current()) return false;
    deviceInformation.set(data);
    pushLog("DIS: device information read");
    return true;
  } catch (error) {
    if (current()) {
      deviceInformationError.set(String(error));
      deviceInformation.set(null);
      pushLog(`DIS read error: ${String(error)}`);
    }
    return false;
  } finally {
    deviceInformationReadInFlight = false;
    deviceInformationLoading.set(false);
    if (token !== nativeSessionToken && get(connected)) queueMicrotask(reconcileDeviceInformation);
  }
}

function reconcileDeviceInformation(): void {
  void (async () => {
    if (!get(connected) || !get(selectedAddress) || !get(activeFeatureIds).includes(FeatureId.bleDeviceInformation)) {
      disFetchCompletedForAddress = null;
      clearDeviceInformationState();
      return;
    }
    const addr = get(selectedAddress)!;
    const token = nativeSessionToken;
    if (disFetchCompletedForAddress === addr) return;
    if (await refreshDeviceInformation() && token === nativeSessionToken) disFetchCompletedForAddress = addr;
  })();
}

export async function refreshDeviceInformationNow(): Promise<void> {
  disFetchCompletedForAddress = null;
  const token = nativeSessionToken;
  if (await refreshDeviceInformation() && token === nativeSessionToken) disFetchCompletedForAddress = get(selectedAddress);
}

function wireDeviceInformationReconciliation(): void {
  const run = () => {
    reconcileDeviceInformation();
  };
  connected.subscribe(run);
  selectedAddress.subscribe(run);
  activeFeatureIds.subscribe(run);
  run();
}

async function syncNativeNotificationForwardingGates(): Promise<void> {
  await syncNativeConnectionPolicies();
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
  if (message.startsWith("BLE:") || message.startsWith("DFU")) console.info(`[Furu] ${line}`);
}

export function logBleDiagnostic(message: string): void {
  pushLog(message);
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

  await listen<NativeConnectionSnapshot>("ble-native-connection", (event) => consumeNativeConnection(event.payload));
  await listen<string>("ble-native-log", (event) => pushLog(`BLE: ${event.payload}`));
  consumeNativeConnection(await invoke<NativeConnectionSnapshot>("ble_connection_snapshot"));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void invoke<NativeConnectionSnapshot>("ble_connection_snapshot")
      .then(consumeNativeConnection).catch((error) => pushLog(`BLE: snapshot refresh failed: ${String(error)}`));
  });
  const configure = () => { void syncNativeConnectionPolicies().catch((e) => pushLog(`BLE: native configuration failed: ${String(e)}`)); };
  rememberedDevices.subscribe(configure);
  deviceProfileCatalog.subscribe(configure);
  devicesHydrated.subscribe(configure);
  appSettings.subscribe(configure);
  notificationFilters.subscribe(configure);

  await getScanningUpdates((state) => {
    scanning.set(state);
  });

  wireCtsSyncReconciliation();
  wireSessionProfileReconciliation();
  wireBatteryPollingReconciliation();
  wireStepPollingReconciliation();
  wireHeartRateSubscriptionReconciliation();
  wireDeviceInformationReconciliation();
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
  if (!beginCapabilityUpdate(false)) {
    pushLog("profile change blocked by another BLE/DFU operation");
    return;
  }
  const featureIds = getFeatureIdsForProfileId(profileId);
  try {
    await invoke("ble_set_active_capabilities", { profileId, featureIds });
    activeProfileId.set(profileId);
    await refreshProfileState();
    pushLog(`active profile: ${profileId}`);
  } catch (error) {
    pushLog(`ble_set_active_capabilities error: ${String(error)}`);
  } finally {
    endCapabilityUpdate();
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
    if (get(connectingAddress)) { pushLog("scan: wait for the native connection attempt"); return; }
    await invoke("ble_enable_adapter");
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

/** Request a native connection. The event stream owns readiness and retries. */
export async function connectTo(address: string, options?: ConnectOptions): Promise<void> {
  const requested = address.trim();
  if (!requested || !beginBleMutation()) return;
  connectingAddress.set(requested);
  connectError.set(null);
  let accepted = false;
  try {
    const ok = await checkPermissions(true);
    permissionsOk.set(ok);
    if (!ok) throw new Error("BLE permissions not granted.");
    // Wait for the actual Android dialog result before starting scan/connect.
    await invoke("ble_enable_adapter");
    await syncNativeConnectionPolicies();
    await invoke("ble_connection_connect", { address: requested, skipScan: options?.skipScan ?? false });
    accepted = true;
  } catch (error) {
    const message = String(error);
    connectError.set({ address: requested, message });
    pushLog(`connect error: ${message}`);
  } finally {
    if (!accepted || (get(connected) && bleAddressesEqual(get(selectedAddress) ?? "", requested))) connectingAddress.set(null);
    endBleMutation();
  }
}

export async function repairServiceCache(address: string): Promise<void> {
  if (!beginBleMutation()) throw new Error("Wait for the current Bluetooth operation to finish.");
  try {
    await invoke("ble_enable_adapter");
    await syncNativeConnectionPolicies();
    await invoke("ble_connection_connect", { address, repair: true });
  } finally { endBleMutation(); }
}

export async function disconnectDevice(): Promise<void> {
  if (!beginBleMutation()) return;
  try { await invoke("ble_connection_disconnect"); }
  catch (error) { pushLog(`disconnect error: ${String(error)}`); }
  finally { endBleMutation(); }
}

/** Native DFU's guard owns the reboot grace period, cleanup and reconnect. */
export async function disconnectAfterDfu(activationRequested = false): Promise<void> {
  pushLog(`DFU: native cleanup scheduled; activation=${activationRequested}`);
}

export async function sendCurrentTime(): Promise<void> {
  if (ctsWriteInFlight) return ctsWriteInFlight;
  const operation = Promise.resolve()
    .then(async () => {
      if (isDfuSessionActive()) return;
      try {
        await invoke("ble_poc_send_current_time");
        pushLog("current time (CTS 0x2A2B) write sent");
      } catch (error) {
        pushLog(`CTS time write error: ${String(error)}`);
      }
    })
    .finally(() => {
      if (ctsWriteInFlight === operation) ctsWriteInFlight = null;
    });
  ctsWriteInFlight = operation;
  return operation;
}

export async function sendNotification(title: string, message: string): Promise<void> {
  try {
    await invoke("ble_poc_send_notification", { title, message });
    pushLog("ANS New Alert (0x2A46) sent");
  } catch (error) {
    pushLog(`ANS notification error: ${String(error)}`);
  }
}
