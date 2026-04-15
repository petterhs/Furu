import { get, writable } from "svelte/store";
import {
  defaultNotificationFilters,
  type NotificationFilters,
  readNotificationFilters,
  writeNotificationFilters,
} from "$lib/persistence/notificationFiltersStore";
import { listRecentNotifications } from "$lib/stores/notificationForwarder";

export const notificationFilters = writable<NotificationFilters>(defaultNotificationFilters());
export const notificationFiltersHydrated = writable(false);

function normalizePackages(values: string[] | undefined): string[] {
  if (!values) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const value = raw.trim();
    if (!value) continue;
    if (seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  out.sort((a, b) => a.localeCompare(b));
  return out;
}

function normalizeFilters(input: Partial<NotificationFilters> | null | undefined): NotificationFilters {
  return {
    blockedPackages: normalizePackages(input?.blockedPackages),
    seenPackages: normalizePackages(input?.seenPackages),
  };
}

export async function hydrateNotificationFilters(): Promise<void> {
  const raw = await readNotificationFilters();
  const next = normalizeFilters(raw);
  notificationFilters.set(next);
  notificationFiltersHydrated.set(true);
  if (!raw || JSON.stringify(raw) !== JSON.stringify(next)) {
    await writeNotificationFilters(next);
  }
}

export async function persistNotificationFilters(next: NotificationFilters): Promise<void> {
  const normalized = normalizeFilters(next);
  notificationFilters.set(normalized);
  await writeNotificationFilters(normalized);
}

export async function patchNotificationFilters(mutator: (draft: NotificationFilters) => void): Promise<void> {
  const draft = structuredClone(get(notificationFilters));
  mutator(draft);
  await persistNotificationFilters(draft);
}

export async function toggleBlockedPackage(packageName: string, blocked: boolean): Promise<void> {
  await patchNotificationFilters((draft) => {
    const set = new Set(draft.blockedPackages);
    if (blocked) set.add(packageName);
    else set.delete(packageName);
    draft.blockedPackages = Array.from(set);
  });
}

export async function refreshSeenPackagesFromRecent(): Promise<void> {
  const recent = await listRecentNotifications();
  const recentPackages = recent.map((n) => n.packageName).filter(Boolean);
  if (!recentPackages.length) return;
  await patchNotificationFilters((draft) => {
    const set = new Set(draft.seenPackages);
    for (const pkg of recentPackages) set.add(pkg);
    draft.seenPackages = Array.from(set);
  });
}
