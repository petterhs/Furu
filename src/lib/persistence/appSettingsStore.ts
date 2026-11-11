import { openStore } from "#lib/persistence/valueStore";

/** `system` follows the phone's appearance; the app default is Mocha (dark). */
export type ThemeMode = "dark" | "light" | "system";

export type AppSettings = {
  notificationForwardingEnabled: boolean;
  firmwareDevelopmentChannel: boolean;
  themeMode: ThemeMode;
};

const STORE_FILE = "app-settings.json";
const SETTINGS_KEY = "settings";

async function getStore() {
  return openStore(STORE_FILE);
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  notificationForwardingEnabled: true,
  firmwareDevelopmentChannel: false,
  themeMode: "dark",
};

export function isThemeMode(value: unknown): value is ThemeMode {
  return value === "dark" || value === "light" || value === "system";
}

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
