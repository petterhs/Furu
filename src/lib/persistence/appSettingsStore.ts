import { load } from "@tauri-apps/plugin-store";

export type AppSettings = {
  notificationForwardingEnabled: boolean;
};

const STORE_FILE = "app-settings.json";
const SETTINGS_KEY = "settings";

async function getStore() {
  return load(STORE_FILE, { autoSave: false, defaults: {} });
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  notificationForwardingEnabled: true,
};

export async function readAppSettings(): Promise<AppSettings | null> {
  const store = await getStore();
  const settings = await store.get<AppSettings>(SETTINGS_KEY);
  if (!settings) return null;
  return settings;
}

export async function writeAppSettings(settings: AppSettings): Promise<void> {
  const store = await getStore();
  await store.set(SETTINGS_KEY, settings);
  await store.save();
}
