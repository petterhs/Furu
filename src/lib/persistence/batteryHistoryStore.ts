import { load } from "@tauri-apps/plugin-store";
import type { BatteryHistoryByDevice } from "$lib/types/batteryHistory";

const STORE_FILE = "battery-history.json";
const HISTORY_KEY = "historyByDevice";

async function getStore() {
  return load(STORE_FILE, { autoSave: false, defaults: {} });
}

export async function readBatteryHistory(): Promise<BatteryHistoryByDevice> {
  const store = await getStore();
  const raw = await store.get<BatteryHistoryByDevice>(HISTORY_KEY);
  if (!raw || typeof raw !== "object") return {};
  return raw;
}

export async function writeBatteryHistory(historyByDevice: BatteryHistoryByDevice): Promise<void> {
  const store = await getStore();
  await store.set(HISTORY_KEY, historyByDevice);
  await store.save();
}
