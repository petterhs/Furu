import { get, writable } from "svelte/store";
import { readBatteryHistory, writeBatteryHistory } from "$lib/persistence/batteryHistoryStore";
import type { BatteryHistoryByDevice, BatteryHistorySample } from "$lib/types/batteryHistory";

const HISTORY_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

export const batteryHistoryByDevice = writable<BatteryHistoryByDevice>({});
export const batteryHistoryHydrated = writable(false);

function pruneSamples(samples: BatteryHistorySample[], nowMs = Date.now()): BatteryHistorySample[] {
  const cutoff = nowMs - HISTORY_RETENTION_MS;
  return samples
    .filter((sample) => {
      if (!sample || typeof sample.at !== "string" || typeof sample.percent !== "number") return false;
      if (sample.percent < 0 || sample.percent > 100) return false;
      if (sample.voltageMv !== undefined && (!Number.isInteger(sample.voltageMv) || sample.voltageMv < 2000 || sample.voltageMv > 5000)) return false;
      if (sample.charging !== undefined && typeof sample.charging !== "boolean") return false;
      const ts = Date.parse(sample.at);
      return Number.isFinite(ts) && ts >= cutoff && ts <= nowMs + 60_000;
    })
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
    .reduce<BatteryHistorySample[]>((merged, sample) => {
      const previous = merged.at(-1);
      if (previous && Math.abs(Date.parse(sample.at) - Date.parse(previous.at)) <= 15_000 &&
          previous.percent === sample.percent &&
          (previous.charging === undefined || sample.charging === undefined || previous.charging === sample.charging)) {
        merged[merged.length - 1] = {
          ...previous,
          ...sample,
          voltageMv: sample.voltageMv ?? previous.voltageMv,
          charging: sample.charging ?? previous.charging,
        };
      } else {
        merged.push(sample);
      }
      return merged;
    }, []);
}

function normalizeHistory(raw: BatteryHistoryByDevice, nowMs = Date.now()): BatteryHistoryByDevice {
  const normalized: BatteryHistoryByDevice = {};
  for (const [deviceId, samples] of Object.entries(raw ?? {})) {
    if (!deviceId.trim() || !Array.isArray(samples)) continue;
    const pruned = pruneSamples(samples, nowMs);
    if (!pruned.length) continue;
    normalized[deviceId] = pruned;
  }
  return normalized;
}

export async function hydrateBatteryHistory(): Promise<void> {
  const raw = await readBatteryHistory();
  const normalized = normalizeHistory(raw);
  batteryHistoryByDevice.set(normalized);
  batteryHistoryHydrated.set(true);
  if (JSON.stringify(raw) !== JSON.stringify(normalized)) {
    await writeBatteryHistory(normalized);
  }
}

export function getBatterySamplesForDevice(deviceId: string): BatteryHistorySample[] {
  return get(batteryHistoryByDevice)[deviceId] ?? [];
}

export async function appendBatterySample(
  deviceId: string,
  percent: number,
  atIso = new Date().toISOString(),
): Promise<void> {
  await mergeBatterySamples(deviceId, [{ at: atIso, percent }]);
}

export async function mergeBatterySamples(deviceId: string, samples: BatteryHistorySample[]): Promise<void> {
  if (!deviceId.trim() || !samples.length) return;

  const current = get(batteryHistoryByDevice);
  const next: BatteryHistoryByDevice = { ...current };
  const existing = next[deviceId] ?? [];
  const appended = pruneSamples([...existing, ...samples]);
  if (!appended.length) {
    delete next[deviceId];
  } else {
    next[deviceId] = appended;
  }
  batteryHistoryByDevice.set(next);
  await writeBatteryHistory(next);
}
