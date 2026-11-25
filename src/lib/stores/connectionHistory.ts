import { mergeNativeEvents, type NativeHistoryEvent } from "#lib/connectionEventMerge";
import { get, writable } from "svelte/store";
import {
  readConnectionHistory,
  writeConnectionHistory,
} from "#lib/persistence/connectionHistoryStore";
import type {
  ConnectionHistoryByDevice,
  ConnectionHistoryEvent,
} from "#lib/types/connectionHistory";

const RETENTION_MS = 14 * 24 * 60 * 60 * 1000;
const MAX_EVENTS_PER_DEVICE = 2000;

export const connectionHistoryByDevice = writable<ConnectionHistoryByDevice>({});
export const connectionHistoryHydrated = writable(false);

function pruneEvents(events: ConnectionHistoryEvent[], nowMs: number): ConnectionHistoryEvent[] {
  const cutoff = nowMs - RETENTION_MS;
  return events
    .filter((e) => {
      if (!e || typeof e.at !== "string" || typeof e.connected !== "boolean") return false;
      const ts = Date.parse(e.at);
      return Number.isFinite(ts) && ts >= cutoff && ts <= nowMs + 60_000;
    })
    .map((event) => {
      if (!event.observedUntil) return event;
      const observed = Date.parse(event.observedUntil);
      if (Number.isFinite(observed) && observed >= Date.parse(event.at) && observed <= nowMs + 60_000) return event;
      const { observedUntil: _invalid, ...rest } = event;
      return rest;
    })
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
    .slice(-MAX_EVENTS_PER_DEVICE);
}

function normalizeHistory(raw: ConnectionHistoryByDevice, nowMs: number): ConnectionHistoryByDevice {
  const normalized: ConnectionHistoryByDevice = {};
  for (const [deviceId, events] of Object.entries(raw ?? {})) {
    if (!deviceId.trim() || !Array.isArray(events)) continue;
    const pruned = pruneEvents(events, nowMs);
    if (pruned.length) normalized[deviceId] = pruned;
  }
  return normalized;
}

export async function hydrateConnectionHistory(): Promise<void> {
  const raw = await readConnectionHistory();
  const normalized = normalizeHistory(raw, Date.now());
  connectionHistoryByDevice.set(normalized);
  connectionHistoryHydrated.set(true);
  if (JSON.stringify(raw) !== JSON.stringify(normalized)) {
    await writeConnectionHistory(normalized);
  }
}

export { connectionSegmentsForRange } from "#lib/connectionTimeline";

export async function appendConnectionEvent(
  deviceId: string,
  connected: boolean,
  detail?: string,
  atIso = new Date().toISOString(),
  nativeId?: number,
): Promise<void> {
  if (!deviceId.trim()) return;
  const nowMs = Date.now();
  const current = get(connectionHistoryByDevice);
  const next: ConnectionHistoryByDevice = { ...current };
  const existing = next[deviceId] ?? [];
  if (nativeId !== undefined && existing.some((event) => event.nativeId === nativeId)) return;
  const last = existing[existing.length - 1];
  const tNew = Date.parse(atIso);
  if (
    nativeId === undefined && last &&
    last.connected === connected &&
    Number.isFinite(tNew) &&
    Number.isFinite(Date.parse(last.at)) &&
    tNew >= Date.parse(last.at) && tNew - Date.parse(last.at) < 750
  ) {
    return;
  }
  const evt: ConnectionHistoryEvent = { at: atIso, connected, detail, nativeId };
  const appended = pruneEvents([...existing, evt], nowMs);
  if (!appended.length) {
    delete next[deviceId];
  } else {
    next[deviceId] = appended;
  }
  connectionHistoryByDevice.set(next);
  await writeConnectionHistory(next);
}

/** Import a native event batch with one persistence write, retaining real timestamps. */
export async function mergeNativeConnectionHistory(events: NativeHistoryEvent[]): Promise<void> {
  const current = get(connectionHistoryByDevice);
  const next = mergeNativeEvents(current, events);
  if (next === current) return;
  const normalized = normalizeHistory(next, Date.now());
  await writeConnectionHistory(normalized);
  connectionHistoryByDevice.set(normalized);
}
