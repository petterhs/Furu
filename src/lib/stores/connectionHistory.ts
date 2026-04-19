import { get, writable } from "svelte/store";
import {
  readConnectionHistory,
  writeConnectionHistory,
} from "$lib/persistence/connectionHistoryStore";
import type {
  ConnectionHistoryByDevice,
  ConnectionHistoryEvent,
  ConnectionHistorySegment,
} from "$lib/types/connectionHistory";

const RETENTION_MS = 14 * 24 * 60 * 60 * 1000;
const MAX_EVENTS_PER_DEVICE = 2000;

export const connectionHistoryByDevice = writable<ConnectionHistoryByDevice>({});
export const connectionHistoryHydrated = writable(false);

function pruneEvents(events: ConnectionHistoryEvent[], nowMs: number): ConnectionHistoryEvent[] {
  const cutoff = nowMs - RETENTION_MS;
  return events
    .filter((e) => {
      if (!e || typeof e.at !== "string") return false;
      const ts = Date.parse(e.at);
      return Number.isFinite(ts) && ts >= cutoff && ts <= nowMs + 60_000;
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

/** State just before `timeMs` (inclusive of events at or before). */
function connectedStateAtOrBefore(sorted: ConnectionHistoryEvent[], timeMs: number): boolean {
  let connected = false;
  for (const e of sorted) {
    const t = Date.parse(e.at);
    if (t > timeMs) break;
    connected = e.connected;
  }
  return connected;
}

/** Horizontal segments for a “strip chart” of connection over time. */
export function connectionSegmentsForRange(
  events: ConnectionHistoryEvent[],
  rangeStartMs: number,
  rangeEndMs: number,
): ConnectionHistorySegment[] {
  const sorted = [...events].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  if (rangeEndMs <= rangeStartMs) return [];

  const inRange = sorted.filter((e) => {
    const t = Date.parse(e.at);
    return t >= rangeStartMs && t <= rangeEndMs;
  });

  const segments: ConnectionHistorySegment[] = [];
  let cursor = rangeStartMs;
  let state = connectedStateAtOrBefore(sorted, rangeStartMs);

  const points: { t: number; connected: boolean }[] = [];
  for (const e of inRange) {
    points.push({ t: Date.parse(e.at), connected: e.connected });
  }
  if (!points.length) {
    segments.push({ startMs: rangeStartMs, endMs: rangeEndMs, connected: state });
    return segments;
  }

  for (const p of points) {
    if (p.t > cursor) {
      segments.push({ startMs: cursor, endMs: p.t, connected: state });
      cursor = p.t;
    }
    state = p.connected;
  }
  if (cursor < rangeEndMs) {
    segments.push({ startMs: cursor, endMs: rangeEndMs, connected: state });
  }
  return segments;
}

export async function appendConnectionEvent(
  deviceId: string,
  connected: boolean,
  detail?: string,
  atIso = new Date().toISOString(),
): Promise<void> {
  if (!deviceId.trim()) return;
  const nowMs = Date.now();
  const current = get(connectionHistoryByDevice);
  const next: ConnectionHistoryByDevice = { ...current };
  const existing = next[deviceId] ?? [];
  const last = existing[existing.length - 1];
  const tNew = Date.parse(atIso);
  if (
    last &&
    last.connected === connected &&
    Number.isFinite(tNew) &&
    Number.isFinite(Date.parse(last.at)) &&
    tNew - Date.parse(last.at) < 750
  ) {
    return;
  }
  const evt: ConnectionHistoryEvent = { at: atIso, connected, detail };
  const appended = pruneEvents([...existing, evt], nowMs);
  if (!appended.length) {
    delete next[deviceId];
  } else {
    next[deviceId] = appended;
  }
  connectionHistoryByDevice.set(next);
  await writeConnectionHistory(next);
}
