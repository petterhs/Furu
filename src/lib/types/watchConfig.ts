import { sanitizeClockFields, MAX_CLOCK_FIELDS } from "#lib/integrations/clockFields";

/**
 * Kongle watch preferences owned by Furu until the firmware exposes a
 * configuration characteristic (`kongle.watch_config`). Saved per device.
 */
export type WatchAppId = "media" | "home" | "activity" | "notifications";

export type WatchConfig = {
  /** Ordered clock fields, at most `MAX_CLOCK_FIELDS`. */
  clockFields: string[];
  enabledApps: WatchAppId[];
};

export type WatchConfigByDevice = Record<string, WatchConfig>;

export const WATCH_APP_DEFINITIONS: { id: WatchAppId; label: string; description: string }[] = [
  { id: "media", label: "Media", description: "Player controls and now-playing metadata." },
  { id: "notifications", label: "Notifications", description: "Phone alerts forwarded to the watch." },
  { id: "home", label: "Home", description: "Home Assistant actions, once configured here." },
  { id: "activity", label: "Activity", description: "Step count and movement detail." },
];

const KNOWN_APPS = new Set<string>(WATCH_APP_DEFINITIONS.map((app) => app.id));

/**
 * Defaults mirror what Kongle 0.4 firmware actually shows: steps on the clock,
 * and the media and notification pages enabled.
 */
export function defaultWatchConfig(): WatchConfig {
  return {
    clockFields: sanitizeClockFields(["field.steps"]),
    enabledApps: ["media", "notifications"],
  };
}

export function sanitizeEnabledApps(ids: readonly string[]): WatchAppId[] {
  const seen = new Set<string>();
  const out: WatchAppId[] = [];
  for (const id of ids) {
    if (!KNOWN_APPS.has(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id as WatchAppId);
  }
  return out;
}

/**
 * Sanitizes a stored list, falling back only when the stored value was present
 * but entirely invalid. An intentionally empty list stays empty.
 */
function sanitizeOrFallback<T>(
  raw: readonly string[] | undefined,
  sanitize: (ids: readonly string[]) => T[],
  fallback: T[],
): T[] {
  if (!Array.isArray(raw)) return fallback;
  const cleaned = sanitize(raw);
  if (!cleaned.length && raw.length > 0) return fallback;
  return cleaned;
}

export function sanitizeWatchConfig(raw: Partial<WatchConfig> | null | undefined): WatchConfig {
  const fallback = defaultWatchConfig();
  return {
    clockFields: sanitizeOrFallback(raw?.clockFields, sanitizeClockFields, fallback.clockFields),
    enabledApps: sanitizeOrFallback(raw?.enabledApps, sanitizeEnabledApps, fallback.enabledApps),
  };
}

/** Moves a field within the slot order, clamped to the valid range. */
export function moveClockField(fields: readonly string[], index: number, delta: number): string[] {
  const next = [...fields];
  const target = index + delta;
  if (target < 0 || target >= next.length) return next;
  [next[index], next[target]] = [next[target], next[index]];
  return next.slice(0, MAX_CLOCK_FIELDS);
}

export function toggleClockField(fields: readonly string[], id: string): string[] {
  const next = fields.includes(id) ? fields.filter((field) => field !== id) : [...fields, id];
  return sanitizeClockFields(next);
}

export function toggleWatchApp(apps: readonly WatchAppId[], id: WatchAppId): WatchAppId[] {
  return apps.includes(id) ? apps.filter((app) => app !== id) : sanitizeEnabledApps([...apps, id]);
}
