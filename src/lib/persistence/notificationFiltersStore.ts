import { openStore } from "#lib/persistence/valueStore";

export type NotificationFilters = {
  blockedPackages: string[];
  seenPackages: string[];
};

const STORE_FILE = "notification-filters.json";
const FILTERS_KEY = "filters";

const DEFAULT_FILTERS: NotificationFilters = {
  blockedPackages: [],
  seenPackages: [],
};

async function getStore() {
  return openStore(STORE_FILE);
}

export function defaultNotificationFilters(): NotificationFilters {
  return { ...DEFAULT_FILTERS, blockedPackages: [], seenPackages: [] };
}

export async function readNotificationFilters(): Promise<NotificationFilters | null> {
  const store = await getStore();
  const filters = await store.get<NotificationFilters>(FILTERS_KEY);
  if (!filters) return null;
  return filters;
}

export async function writeNotificationFilters(filters: NotificationFilters): Promise<void> {
  const store = await getStore();
  await store.set(FILTERS_KEY, filters);
  await store.save();
}
