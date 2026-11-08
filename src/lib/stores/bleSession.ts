import { Channel, invoke } from "@tauri-apps/api/core";
import {
  type BleDevice,
  checkPermissions,
  connect,
  disconnect,
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
import { ReconnectCycle } from "$lib/reconnect";
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
  recordDetectedProfile,
  touchRememberedDevice,
} from "$lib/stores/devices";
import {
  catalogToProfileInfos,
  deviceProfileCatalog,
  getFeatureIdsForProfileId,
  hydrateDeviceProfiles,
} from "$lib/stores/deviceProfiles";
import { appendConnectionEvent } from "$lib/stores/connectionHistory";
import {
  HEART_RATE_MEASUREMENT_CHAR_UUID,
  HEART_RATE_SERVICE_UUID,
  parseHeartRateMeasurement,
} from "$lib/ble/hrMeasurement";
import type { DeviceInformation } from "$lib/types/deviceInformation";
import { bleAddressesEqual } from "$lib/utils/deviceId";
import { beginBleMutation, endBleMutation, isDfuSessionActive, dfuInProgress,
  beginCapabilityUpdate, endCapabilityUpdate, bleOperationsReleased } from "$lib/stores/dfuSession";

export type ConnectOptions = {
  /** When true, this connection attempt is from the auto-reconnect loop (not the user tapping Connect). */
  isAutoReconnect?: boolean;
  /**
   * If true, skip scanning and connect by address only (low battery cost; may fail if the OS has no cached
   * peripheral). Auto-reconnect uses this path.
   */
  skipScan?: boolean;
};

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

let userRequestedDisconnect = false;
/** Cleared when the native connection channel reports `connected`, or when a connect attempt fails. */
let pendingConnectSource: "user" | "auto" | null = null;
const reconnectCycle = new ReconnectCycle({
  settings: (address) => {
    const device = getRememberedByAddress(address);
    return device ? {
      enabled: device.autoReconnect,
      retryDelayMs: clampAutoReconnectIntervalMinutes(device.autoReconnectIntervalMinutes) * 60_000,
      maxFailures: clampAutoReconnectMaxAttempts(device.autoReconnectMaxAttempts),
    } : undefined;
  },
  state: (address) => {
    const selected = get(selectedAddress);
    if (!selected || !bleAddressesEqual(selected, address)) return "stop";
    if (get(connected)) return "connected";
    if (get(connectingAddress) || isDfuSessionActive()) return "busy";
    return "ready";
  },
  connect: async (address, direct) => {
    await connectTo(address, { isAutoReconnect: true, skipScan: direct });
    return get(connected) && bleAddressesEqual(get(selectedAddress) ?? "", address);
  },
  stopped: () => { void syncAndroidBleKeepalive(get(connected)); },
  log: pushLog,
});

function cancelAutoReconnectCycle(): void { reconnectCycle.cancel(); }
function scheduleAutoReconnect(address: string): boolean { return reconnectCycle.start(address.trim()); }

function recordConnectionHistoryConnected(detail: string): void {
  queueMicrotask(() => {
    const addr = get(selectedAddress);
    if (!addr) return;
    const dev = getRememberedByAddress(addr);
    if (!dev) return;
    void appendConnectionEvent(dev.id, true, detail);
  });
}

function recordConnectionHistoryDisconnected(detail: string, addressAtEvent: string | null): void {
  if (!addressAtEvent?.trim()) return;
  const dev = getRememberedByAddress(addressAtEvent);
  if (!dev) return;
  void appendConnectionEvent(dev.id, false, detail);
}

async function maybeAbsorbNotificationBacklog(
  connectAddress: string,
  isAutoReconnect: boolean,
): Promise<void> {
  const remembered = getRememberedByAddress(connectAddress);
  const replayMissed = remembered?.replayMissedNotificationsOnReconnect ?? true;
  const shouldAbsorb = !isAutoReconnect || !replayMissed;
  if (!shouldAbsorb) return;
  try {
    await invoke("ble_absorb_notification_backlog_watermark");
    pushLog("notifications: absorbed phone backlog (watch will not receive old notifications)");
  } catch (error) {
    pushLog(`notifications: backlog absorb failed: ${String(error)}`);
  }
}

async function finalizeConnectSession(
  connectAddress: string,
  advertisementName: string | undefined,
  isAutoReconnect: boolean,
): Promise<void> {
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
  await applySessionProfileAfterConnect(connectAddress, advertisementName);
  await syncNativeNotificationForwardingGates();
  await maybeAbsorbNotificationBacklog(connectAddress, isAutoReconnect);
  pushLog(`connect: session ready for ${connectAddress}`);
}

async function applySessionProfileAfterConnect(
  connectAddress: string,
  advertisementName: string | undefined,
): Promise<void> {
  // Firmware observations must not change merely because a user edits auto rules.
  const detected = resolveProfileIdFromDeviceName(advertisementName, defaultNameRules());
  await recordDetectedProfile(connectAddress, detected);
  // This scope owns the connection mutation lock. Allow capability writes to
  // finish under that lock, including edits queued during finalization.
  connectionProfileFinalization = true;
  try {
    let pending = reconcileSessionProfile();
    for (;;) {
      await pending;
      if (pending === profileConfigurationQueue) break;
      pending = profileConfigurationQueue;
    }
  } finally {
    connectionProfileFinalization = false;
  }
}

let connectionProfileFinalization = false;
let profileConfigurationKey = "";
let profileConfigurationRevision = 0;
let profileConfigurationQueue: Promise<void> = Promise.resolve();

/** Serialize native changes, skip superseded edits, and update live feature consumers. */
function reconcileSessionProfile(): Promise<void> {
  const connectAddress = get(selectedAddress);
  if (!get(connected) || !connectAddress) {
    if (profileConfigurationKey) {
      profileConfigurationKey = "";
      profileConfigurationRevision++;
    }
    return profileConfigurationQueue;
  }
  if (isDfuSessionActive()) return profileConfigurationQueue;
  const remembered = getRememberedByAddress(connectAddress);
  if (!remembered) return profileConfigurationQueue;
  let profileId: string = ProfileId.unknown;
  if (remembered?.profilePreference && remembered.profilePreference !== "auto") {
    profileId = remembered.profilePreference;
  } else if (remembered?.profilePreference === "auto") {
    profileId = resolveProfileIdFromDeviceName(remembered.name, get(deviceProfileCatalog).nameRules);
  }
  const featureIds = getFeatureIdsForProfileId(profileId);
  const key = JSON.stringify([connectAddress.toLowerCase(), profileId, [...featureIds].sort()]);
  if (key === profileConfigurationKey) return profileConfigurationQueue;
  profileConfigurationKey = key;
  const revision = ++profileConfigurationRevision;
  const current = () => revision === profileConfigurationRevision && get(connected) &&
    bleAddressesEqual(get(selectedAddress) ?? "", connectAddress);
  profileConfigurationQueue = profileConfigurationQueue.then(async () => {
    if (!current()) return;
    if (!beginCapabilityUpdate(connectionProfileFinalization)) {
      profileConfigurationKey = "";
      return;
    }
    try {
      await invoke("ble_set_active_capabilities", { profileId, featureIds });
      if (!current()) return;
      activeProfileId.set(profileId);
      activeFeatureIds.set([...featureIds]);
      pushLog(`session profile: ${profileId} (${featureIds.length} features)`);
    } catch (error) {
      pushLog(`ble_set_active_capabilities failed (${profileId}): ${String(error)}`);
      if (current()) {
        // Do not retry a failed write on its own release notification.
        // A changed preference, feature list or connection will retry it.
        try {
          await invoke("ble_set_active_capabilities", { profileId: ProfileId.unknown, featureIds: [] });
          if (current()) {
            activeProfileId.set(ProfileId.unknown);
            activeFeatureIds.set([]);
          }
        } catch (fallbackError) {
          pushLog(`profile fallback failed: ${String(fallbackError)}`);
        }
      }
    } finally {
      // Retain exclusion through both the native write and feature publication.
      endCapabilityUpdate();
    }
  });
  return profileConfigurationQueue;
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
  try {
    const samples = await invoke<BatteryHistorySample[]>("ble_read_kongle_battery_history");
    if (!get(connected) || get(selectedAddress) !== address) return;
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
  try {
    const connectedAddress = get(selectedAddress);
    if (hasBatteryService) {
      try {
        pushLog("battery read: requesting BAS battery level");
        const level = await invoke<number>("ble_read_battery_percentage");
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
        batteryError.set(`Battery read failed: ${String(error)}`);
        pushLog(`battery read error: ${String(error)}`);
      }
    }
    if (hasKongleHistory) {
      try {
        const current = await invoke<KongleBatteryCurrent>("ble_read_kongle_battery_current");
        if (get(connected) && get(selectedAddress) === connectedAddress) {
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
      if (connectedAddress) void syncKongleBatteryHistory(connectedAddress);
    }
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
  try {
    pushLog("step count read: requesting Motion Service");
    const steps = await invoke<number>("ble_read_step_count");
    stepCount.set(steps);
    stepCountUpdatedAt.set(Date.now());
    stepCountError.set(null);
    pushLog(`step count read: ${steps}`);
  } catch (error) {
    stepCountError.set(`Step count read failed: ${String(error)}`);
    pushLog(`step count read error: ${String(error)}`);
  } finally {
    stepReadInFlight = false;
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

async function refreshDeviceInformation(): Promise<void> {
  if (deviceInformationReadInFlight) return;
  if (!get(connected) || !get(selectedAddress)) return;
  if (!get(activeFeatureIds).includes(FeatureId.bleDeviceInformation)) return;
  deviceInformationReadInFlight = true;
  deviceInformationLoading.set(true);
  deviceInformationError.set(null);
  deviceInformation.set(null);
  try {
    const data = await invoke<DeviceInformation>("ble_read_device_information");
    deviceInformation.set(data);
    pushLog("DIS: device information read");
  } catch (error) {
    deviceInformationError.set(String(error));
    deviceInformation.set(null);
    pushLog(`DIS read error: ${String(error)}`);
  } finally {
    deviceInformationReadInFlight = false;
    deviceInformationLoading.set(false);
  }
}

function reconcileDeviceInformation(): void {
  void (async () => {
    if (!get(connected) || !get(selectedAddress)) {
      disFetchCompletedForAddress = null;
      clearDeviceInformationState();
      return;
    }
    if (!get(activeFeatureIds).includes(FeatureId.bleDeviceInformation)) {
      disFetchCompletedForAddress = null;
      clearDeviceInformationState();
      return;
    }
    const addr = get(selectedAddress)!;
    if (disFetchCompletedForAddress === addr) return;
    await refreshDeviceInformation();
    disFetchCompletedForAddress = addr;
  })();
}

/** Clears the one-shot fetch guard so the next reconcile (or caller) reads DIS again. */
export async function refreshDeviceInformationNow(): Promise<void> {
  disFetchCompletedForAddress = null;
  await refreshDeviceInformation();
  const addr = get(selectedAddress);
  if (addr && get(connected) && get(activeFeatureIds).includes(FeatureId.bleDeviceInformation)) {
    disFetchCompletedForAddress = addr;
  }
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
  if (message.startsWith("BLE:") || message.startsWith("DFU")) console.info(`[Furu] ${line}`);
}

export function logBleDiagnostic(message: string): void {
  pushLog(message);
}

function reportLinkClosed(source: string, callbackAddress?: string): void {
  // The plugin sends both a disconnect callback and a connection-state update.
  // Only the first transition should alert, update history and schedule reconnect.
  if (!get(connected)) {
    if (get(selectedAddress)) pushLog(`BLE: duplicate disconnect signal (${source})`);
    return;
  }
  const address = get(selectedAddress) ?? get(connectingAddress);
  if (callbackAddress && address && !bleAddressesEqual(callbackAddress, address)) {
    pushLog(`BLE: ignoring late disconnect callback for ${callbackAddress}; active=${address}`);
    return;
  }
  const requested = userRequestedDisconnect;
  const updating = isDfuSessionActive();
  userRequestedDisconnect = false;
  connected.set(false);
  const detail = requested ? "disconnected (app requested)" : updating
    ? "disconnected (firmware update)" : "disconnected (unexpected link loss)";
  pushLog(`BLE: ${detail}; source=${source}; address=${address ?? "unknown"}`);
  recordConnectionHistoryDisconnected(detail, address);
  void syncNativeNotificationForwardingGates();
  if (!requested && !updating && address) {
    const name = getRememberedByAddress(address)?.name ?? "PineTime";
    void invoke("plugin:ble-keepalive|notify_disconnect", { name }).catch((error) =>
      pushLog(`BLE: disconnect notification failed: ${String(error)}`));
    cancelAutoReconnectCycle();
    void syncAndroidBleKeepalive(scheduleAutoReconnect(address), true);
  } else {
    cancelAutoReconnectCycle();
    void syncAndroidBleKeepalive(false);
  }
  for (const listener of connectionListeners) listener(false);
}

let keepaliveQueue: Promise<void> = Promise.resolve();

function syncAndroidBleKeepalive(keepRunning: boolean, reconnecting = false): Promise<void> {
  keepaliveQueue = keepaliveQueue.then(async () => {
    try {
      if (keepRunning) {
        await invoke("plugin:ble-keepalive|start_service", { reconnecting });
      } else {
        await invoke("plugin:ble-keepalive|stop_service");
      }
    } catch (error) {
      pushLog(`BLE keepalive (${keepRunning ? "start" : "stop"}): ${String(error)}`);
    }
  });
  return keepaliveQueue;
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
    if (!state) {
      reportLinkClosed("native connection-state channel");
      return;
    }
    if (get(connected)) return;
    connected.set(true);
    void syncNativeNotificationForwardingGates();
    if (state) {
      const src = pendingConnectSource;
      pendingConnectSource = null;
      const detail =
        src === "auto"
          ? "connected (auto-reconnect)"
          : src === "user"
            ? "connected (user)"
            : "connected (native)";
      pushLog(`BLE: ${detail}`);
      recordConnectionHistoryConnected(detail);
    }
    void syncAndroidBleKeepalive(true);
    for (const listener of connectionListeners) {
      listener(state);
    }
  };
  await invoke("plugin:blec|connection_state", { update: connectionChannel });

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
// Android bounds connect and MTU IPC separately (15 s each, plus targeted
// retirement), up to three attempts, then service discovery. Keep the UI guard
// outside that budget so it cannot abandon a still-owned native attempt.
const CONNECT_ATTEMPT_TIMEOUT_MS = 150_000;
const DFU_DISCONNECT_TIMEOUT_MS = 8_000;
// Android can finish a write-without-response before the watch processes the
// activation command. Give the watch a chance to reboot before closing GATT.
const DFU_ACTIVATION_GRACE_MS = 2_000;

async function connectWithTimeout(address: string, timeoutMs: number): Promise<void> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  try {
    await Promise.race([
      connect(address, () => reportLinkClosed("native peripheral callback", address), false),
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error(`connect timeout after ${Math.round(timeoutMs / 1000)}s`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId !== null) clearTimeout(timeoutId);
  }
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

export async function connectTo(address: string, options?: ConnectOptions): Promise<void> {
  let stopScanAfterConnect = false;
  const requested = address.trim();
  if (!requested) return;
  if (get(connectingAddress)) {
    pushLog(`connect: already connecting to ${get(connectingAddress)}`);
    return;
  }
  if (!beginBleMutation()) {
    pushLog("connect: blocked while another BLE or DFU operation is in progress");
    return;
  }
  const isAutoReconnect = options?.isAutoReconnect ?? false;
  const skipScan = options?.skipScan ?? false;
  if (!isAutoReconnect) {
    cancelAutoReconnectCycle();
    pendingConnectSource = "user";
  } else {
    pendingConnectSource = "auto";
  }
  connectingAddress.set(requested);
  connectError.set(null);
  try {
    const ok = await checkPermissions(!isAutoReconnect);
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

    if (skipScan) {
      pushLog(`connect: direct (no scan) to ${requested}…`);
      const remembered = getRememberedByAddress(requested);
      const advName = remembered?.name;
      await connectWithTimeout(requested, CONNECT_ATTEMPT_TIMEOUT_MS);
      await finalizeConnectSession(requested, advName, isAutoReconnect);
    } else {
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
        await finalizeConnectSession(connectAddress, fromScan.name, isAutoReconnect);
      } finally {
        if (stopScanAfterConnect) {
          try {
            await stopScan();
          } catch {
            /* ignore */
          }
        }
      }
    }
  } catch (error) {
    connectError.set({ address: requested, message: "Could not connect to the device. Please try again." });
    pushLog(`connect error: ${String(error)}`);
  } finally {
    connectingAddress.set(null);
    if (!get(connected)) {
      pendingConnectSource = null;
    }
    endBleMutation();
  }
}

/** Repair Android's cached service handles, preserving the remembered device. */
export async function repairServiceCache(address: string): Promise<void> {
  if (!beginBleMutation()) throw new Error("Wait for the current Bluetooth operation to finish.");
  if (get(selectedAddress) && !bleAddressesEqual(get(selectedAddress)!, address)) {
    endBleMutation();
    throw new Error("Disconnect the other device before repairing this connection.");
  }
  userRequestedDisconnect = true;
  cancelAutoReconnectCycle();
  try {
    await invoke("ble_repair_service_cache", { address });
    connected.set(false);
    selectedAddress.set(null);
    pendingConnectSource = null;
    await syncAndroidBleKeepalive(false);
    pushLog(`BLE: retired stale services for ${address}; reconnecting with fresh discovery`);
  } finally {
    userRequestedDisconnect = false;
    endBleMutation();
  }
  await connectTo(address);
}

export async function disconnectDevice(): Promise<void> {
  if (!beginBleMutation()) {
    pushLog("disconnect: blocked while another BLE or DFU operation is in progress");
    return;
  }
  userRequestedDisconnect = true;
  cancelAutoReconnectCycle();
  try {
    await disconnect();
    selectedAddress.set(null);
    pushLog("BLE: disconnect finished (app requested)");
  } catch (error) {
    const message = String(error);
    if (/no device connected/i.test(message)) {
      // A PineTime can reboot before the BLE plugin processes its disconnect
      // event. In that case the plugin reports that its peripheral is already
      // disconnected, while the app's connection-state channel remains stale.
      connected.set(false);
      selectedAddress.set(null);
      void syncAndroidBleKeepalive(false);
      userRequestedDisconnect = false;
      pendingConnectSource = null;
      cancelAutoReconnectCycle();
      pushLog("BLE: cleared stale connection state (device already disconnected)");
    } else {
      userRequestedDisconnect = false;
      pushLog(`disconnect error: ${message}`);
    }
  } finally {
    endBleMutation();
  }
}

/** Reconcile the BLE link after DFU, allowing a successful activation to reach the watch. */
export async function disconnectAfterDfu(activationRequested = false): Promise<void> {
  if (!beginBleMutation()) {
    pushLog("DFU disconnect: another BLE operation is in progress; clearing rebooted device state");
    connected.set(false);
    selectedAddress.set(null);
    cancelAutoReconnectCycle();
    void syncAndroidBleKeepalive(false);
    return;
  }

  userRequestedDisconnect = true;
  cancelAutoReconnectCycle();
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  try {
    if (activationRequested) {
      pushLog("DFU activation: waiting for the watch to reboot");
      await new Promise<void>((resolve) => setTimeout(resolve, DFU_ACTIVATION_GRACE_MS));
    }
    if (get(connected)) {
      await Promise.race([
        disconnect(),
        new Promise<never>((_, reject) => {
          timeoutId = setTimeout(() => reject(new Error("disconnect timed out")), DFU_DISCONNECT_TIMEOUT_MS);
        }),
      ]);
      pushLog("DFU disconnect: BLE link closed");
    } else {
      pushLog("DFU disconnect: watch already disconnected");
    }
  } catch (error) {
    pushLog(`DFU disconnect: ${String(error)}; clearing stale connection state`);
  } finally {
    if (timeoutId !== null) clearTimeout(timeoutId);
    // Activation requests a reboot. Keep Furu usable even when Android misses
    // the peripheral-disconnected callback or the native plugin's wait hangs.
    connected.set(false);
    selectedAddress.set(null);
    void syncAndroidBleKeepalive(false);
    pendingConnectSource = null;
    userRequestedDisconnect = false;
    cancelAutoReconnectCycle();
    endBleMutation();
  }
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
