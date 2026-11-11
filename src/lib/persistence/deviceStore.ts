import { openStore } from "#lib/persistence/valueStore";
import type { RememberedDevice } from "#lib/types/device";

const STORE_FILE = "devices.json";
const DEVICES_KEY = "rememberedDevices";

async function getStore() {
  return openStore(STORE_FILE);
}

export async function readRememberedDevices(): Promise<RememberedDevice[]> {
  const store = await getStore();
  const devices = await store.get<RememberedDevice[]>(DEVICES_KEY);
  return Array.isArray(devices) ? devices : [];
}

export async function writeRememberedDevices(devices: RememberedDevice[]): Promise<void> {
  const store = await getStore();
  await store.set(DEVICES_KEY, devices);
  await store.save();
}

