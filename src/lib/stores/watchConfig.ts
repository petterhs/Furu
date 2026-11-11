import { get, writable } from "svelte/store";
import {
  defaultWatchConfig,
  sanitizeWatchConfig,
  type WatchConfig,
  type WatchConfigByDevice,
} from "#lib/types/watchConfig";
import { readWatchConfig, writeWatchConfig } from "#lib/persistence/watchConfigStore";

export const watchConfigByDevice = writable<WatchConfigByDevice>({});
export const watchConfigHydrated = writable(false);

function sanitizeAll(raw: WatchConfigByDevice | null | undefined): WatchConfigByDevice {
  const out: WatchConfigByDevice = {};
  for (const [deviceId, config] of Object.entries(raw ?? {})) {
    if (!deviceId.trim()) continue;
    out[deviceId] = sanitizeWatchConfig(config);
  }
  return out;
}

export async function hydrateWatchConfig(): Promise<void> {
  const raw = await readWatchConfig();
  const normalized = sanitizeAll(raw);
  watchConfigByDevice.set(normalized);
  watchConfigHydrated.set(true);
  if (JSON.stringify(raw) !== JSON.stringify(normalized)) {
    await writeWatchConfig(normalized);
  }
}

/**
 * Preferences for one device. Devices without a saved entry get the firmware
 * defaults rather than an empty config, so the card never shows a blank state.
 */
export function getWatchConfig(deviceId: string): WatchConfig {
  const saved = get(watchConfigByDevice)[deviceId];
  return saved ? sanitizeWatchConfig(saved) : defaultWatchConfig();
}

export function hasSavedWatchConfig(deviceId: string): boolean {
  return Boolean(get(watchConfigByDevice)[deviceId]);
}

export async function saveWatchConfig(deviceId: string, config: WatchConfig): Promise<void> {
  if (!deviceId.trim()) return;
  const next = { ...get(watchConfigByDevice), [deviceId]: sanitizeWatchConfig(config) };
  watchConfigByDevice.set(next);
  await writeWatchConfig(next);
}

/** Called when a device is forgotten so stale preferences do not linger. */
export async function forgetWatchConfig(deviceId: string): Promise<void> {
  const current = get(watchConfigByDevice);
  if (!(deviceId in current)) return;
  const next = { ...current };
  delete next[deviceId];
  watchConfigByDevice.set(next);
  await writeWatchConfig(next);
}
