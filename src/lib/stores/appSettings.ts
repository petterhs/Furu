import { get, writable } from "svelte/store";
import {
  DEFAULT_APP_SETTINGS,
  isThemeMode,
  type AppSettings,
  type ThemeMode,
  readAppSettings,
  writeAppSettings,
} from "#lib/persistence/appSettingsStore";

export const appSettings = writable<AppSettings>(DEFAULT_APP_SETTINGS);
export const appSettingsHydrated = writable(false);

/** Mirrored into `localStorage` so `app.html` can resolve the mode before paint. */
const THEME_MODE_MIRROR_KEY = "furu:themeMode";

function normalizeAppSettings(input: Partial<AppSettings> | null | undefined): AppSettings {
  return {
    notificationForwardingEnabled: input?.notificationForwardingEnabled ?? true,
    firmwareDevelopmentChannel: input?.firmwareDevelopmentChannel ?? false,
    themeMode: isThemeMode(input?.themeMode) ? input.themeMode : DEFAULT_APP_SETTINGS.themeMode,
  };
}

function systemPrefersLight(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: light)").matches;
}

/** The concrete mode to apply now; `system` is resolved against the OS. */
export function resolveThemeMode(mode: ThemeMode): "dark" | "light" {
  if (mode === "system") return systemPrefersLight() ? "light" : "dark";
  return mode;
}

/** Applies the mode to `<html data-mode>` and keeps the pre-paint mirror in sync. */
export function applyThemeMode(mode: ThemeMode): void {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.mode = resolveThemeMode(mode);
  try {
    localStorage.setItem(THEME_MODE_MIRROR_KEY, mode);
  } catch {
    /* Private mode: the inline script keeps the Mocha default. */
  }
}

/** Re-resolves `system` when the OS appearance changes while the app is open. */
export function watchSystemTheme(): () => void {
  if (typeof window === "undefined") return () => {};
  const query = window.matchMedia("(prefers-color-scheme: light)");
  const onChange = () => {
    if (get(appSettings).themeMode === "system") applyThemeMode("system");
  };
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

export async function hydrateAppSettings(): Promise<void> {
  const raw = await readAppSettings();
  const next = normalizeAppSettings(raw);
  appSettings.set(next);
  appSettingsHydrated.set(true);
  applyThemeMode(next.themeMode);
  if (!raw || JSON.stringify(raw) !== JSON.stringify(next)) {
    await writeAppSettings(next);
  }
}

export async function persistAppSettings(next: AppSettings): Promise<void> {
  const normalized = normalizeAppSettings(next);
  appSettings.set(normalized);
  applyThemeMode(normalized.themeMode);
  await writeAppSettings(normalized);
}

export async function patchAppSettings(mutator: (draft: AppSettings) => void): Promise<void> {
  const draft = structuredClone(get(appSettings));
  mutator(draft);
  await persistAppSettings(draft);
}
