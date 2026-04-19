import { load } from "@tauri-apps/plugin-store";
import type { ConnectionHistoryByDevice } from "$lib/types/connectionHistory";

const STORE_FILE = "connection-history.json";
const HISTORY_KEY = "eventsByDevice";

async function getStore() {
  return load(STORE_FILE, { autoSave: false, defaults: {} });
}

export async function readConnectionHistory(): Promise<ConnectionHistoryByDevice> {
  const store = await getStore();
  const raw = await store.get<ConnectionHistoryByDevice>(HISTORY_KEY);
  if (!raw || typeof raw !== "object") return {};
  return raw;
}

export async function writeConnectionHistory(byDevice: ConnectionHistoryByDevice): Promise<void> {
  const store = await getStore();
  await store.set(HISTORY_KEY, byDevice);
  await store.save();
}
