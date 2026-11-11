import { openStore } from "#lib/persistence/valueStore";
import type { WatchConfigByDevice } from "#lib/types/watchConfig";

const STORE_FILE = "watch-config.json";
const CONFIG_KEY = "byDevice";

async function getStore() {
  return openStore(STORE_FILE);
}

export async function readWatchConfig(): Promise<WatchConfigByDevice | null> {
  const store = await getStore();
  return (await store.get<WatchConfigByDevice>(CONFIG_KEY)) ?? null;
}

export async function writeWatchConfig(byDevice: WatchConfigByDevice): Promise<void> {
  const store = await getStore();
  await store.set(CONFIG_KEY, byDevice);
  await store.save();
}
