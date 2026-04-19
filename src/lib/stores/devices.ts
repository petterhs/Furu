import type { BleDevice } from "@mnlphlp/plugin-blec";
import { get, writable } from "svelte/store";
import { readRememberedDevices, writeRememberedDevices } from "$lib/persistence/deviceStore";
import type { RememberedDevice } from "$lib/types/device";
import { bleAddressesEqual, deviceIdFromAddress } from "$lib/utils/deviceId";

export const rememberedDevices = writable<RememberedDevice[]>([]);
export const devicesHydrated = writable(false);

export const CTS_SYNC_MIN_MINUTES = 5;
export const CTS_SYNC_MAX_MINUTES = 1440;
export const CTS_SYNC_DEFAULT_MINUTES = 60;

export function clampCtsSyncIntervalMinutes(n: number | undefined): number {
  const v = n === undefined || Number.isNaN(n) ? CTS_SYNC_DEFAULT_MINUTES : Math.round(n);
  return Math.min(CTS_SYNC_MAX_MINUTES, Math.max(CTS_SYNC_MIN_MINUTES, v));
}

function migrateRememberedDeviceShape(device: RememberedDevice): RememberedDevice {
  return {
    ...device,
    notificationsEnabled: device.notificationsEnabled ?? true,
    profilePreference: device.profilePreference ?? "auto",
    currentTimeSyncEnabled: device.currentTimeSyncEnabled ?? true,
    currentTimeSyncIntervalMinutes: clampCtsSyncIntervalMinutes(device.currentTimeSyncIntervalMinutes),
    heartRateLoggingEnabled: device.heartRateLoggingEnabled ?? false,
    autoReconnect: device.autoReconnect ?? true,
    replayMissedNotificationsOnReconnect: device.replayMissedNotificationsOnReconnect ?? true,
  };
}

export async function hydrateRememberedDevices(): Promise<void> {
  const devices = await readRememberedDevices();
  let changed = false;
  const migrated = devices.map((device) => {
    const address = device.address.trim();
    const id = deviceIdFromAddress(address);
    const raw = device as RememberedDevice & {
      currentTimeSyncEnabled?: boolean;
      currentTimeSyncIntervalMinutes?: number;
    };
    const needsAddr = address !== device.address || id !== device.id;
    const needsCts =
      raw.currentTimeSyncEnabled === undefined || raw.currentTimeSyncIntervalMinutes === undefined;
    const needsHr = raw.heartRateLoggingEnabled === undefined;
    const needsReconnect = raw.autoReconnect === undefined;
    const needsReplay = raw.replayMissedNotificationsOnReconnect === undefined;
    const needsClamp =
      raw.currentTimeSyncIntervalMinutes !== undefined &&
      clampCtsSyncIntervalMinutes(raw.currentTimeSyncIntervalMinutes) !==
        raw.currentTimeSyncIntervalMinutes;
    if (needsAddr || needsCts || needsClamp || needsHr || needsReconnect || needsReplay) changed = true;
    const base: RememberedDevice = { ...device, address, id } as RememberedDevice;
    return migrateRememberedDeviceShape(base);
  });
  rememberedDevices.set(migrated);
  devicesHydrated.set(true);
  if (changed) {
    await writeRememberedDevices(migrated);
  }
}

export function getRememberedByAddress(address: string): RememberedDevice | undefined {
  return get(rememberedDevices).find((device) => bleAddressesEqual(device.address, address));
}

export function getRememberedById(id: string): RememberedDevice | undefined {
  return get(rememberedDevices).find((device) => device.id === id);
}

export async function bindRememberedDevice(device: BleDevice): Promise<void> {
  const now = new Date().toISOString();
  const current = get(rememberedDevices);
  const address = device.address.trim();
  const nextDevice: RememberedDevice = {
    id: deviceIdFromAddress(address),
    address,
    name: device.name || "Unknown device",
    lastSeenAt: now,
    profilePreference: "auto",
    notificationsEnabled: true,
    currentTimeSyncEnabled: true,
    currentTimeSyncIntervalMinutes: CTS_SYNC_DEFAULT_MINUTES,
    heartRateLoggingEnabled: false,
    autoReconnect: true,
    replayMissedNotificationsOnReconnect: true,
  };
  const withoutCurrent = current.filter((d) => !bleAddressesEqual(d.address, address));
  const next = [nextDevice, ...withoutCurrent];
  rememberedDevices.set(next);
  await writeRememberedDevices(next);
}

export async function touchRememberedDevice(address: string, name?: string): Promise<void> {
  const current = get(rememberedDevices);
  const idx = current.findIndex((d) => bleAddressesEqual(d.address, address));
  if (idx === -1) return;
  const next = [...current];
  next[idx] = {
    ...next[idx],
    name: name || next[idx].name,
    lastSeenAt: new Date().toISOString(),
  };
  rememberedDevices.set(next);
  await writeRememberedDevices(next);
}

export async function updateRememberedDevice(
  id: string,
  patch: Partial<Omit<RememberedDevice, "id" | "address">>,
): Promise<void> {
  const current = get(rememberedDevices);
  const next = current.map((device) => {
    if (device.id !== id) return device;
    const merged: RememberedDevice = { ...device, ...patch };
    if (patch.currentTimeSyncIntervalMinutes !== undefined) {
      merged.currentTimeSyncIntervalMinutes = clampCtsSyncIntervalMinutes(
        patch.currentTimeSyncIntervalMinutes,
      );
    }
    return merged;
  });
  rememberedDevices.set(next);
  await writeRememberedDevices(next);
}

export async function forgetRememberedDevice(id: string): Promise<void> {
  const next = get(rememberedDevices).filter((device) => device.id !== id);
  rememberedDevices.set(next);
  await writeRememberedDevices(next);
}

