import { get, writable } from "svelte/store";
import {
  DEFAULT_APP_SETTINGS,
  type AppSettings,
  readAppSettings,
  writeAppSettings,
} from "$lib/persistence/appSettingsStore";

export const appSettings = writable<AppSettings>(DEFAULT_APP_SETTINGS);
export const appSettingsHydrated = writable(false);

function normalizeAppSettings(input: Partial<AppSettings> | null | undefined): AppSettings {
  return {
    notificationForwardingEnabled: input?.notificationForwardingEnabled ?? true,
  };
}

export async function hydrateAppSettings(): Promise<void> {
  const raw = await readAppSettings();
  const next = normalizeAppSettings(raw);
  appSettings.set(next);
  appSettingsHydrated.set(true);
  if (!raw || JSON.stringify(raw) !== JSON.stringify(next)) {
    await writeAppSettings(next);
  }
}

export async function persistAppSettings(next: AppSettings): Promise<void> {
  const normalized = normalizeAppSettings(next);
  appSettings.set(normalized);
  await writeAppSettings(normalized);
}

export async function patchAppSettings(mutator: (draft: AppSettings) => void): Promise<void> {
  const draft = structuredClone(get(appSettings));
  mutator(draft);
  await persistAppSettings(draft);
}
