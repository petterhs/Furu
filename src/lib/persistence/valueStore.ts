import { load } from "@tauri-apps/plugin-store";

/**
 * Minimal surface the persistence modules need. Keeping it narrow means the
 * in-memory fallback below is a faithful stand-in.
 */
export type ValueStore = {
  get<T>(key: string): Promise<T | null | undefined>;
  set(key: string, value: unknown): Promise<void>;
  save(): Promise<void>;
};

/** Used when the Tauri store plugin is unavailable (a plain browser, or a failed plugin init). */
function memoryStore(): ValueStore {
  const values = new Map<string, unknown>();
  return {
    async get<T>(key: string): Promise<T | null | undefined> {
      return (values.get(key) as T | undefined) ?? null;
    },
    async set(key: string, value: unknown): Promise<void> {
      values.set(key, value);
    },
    async save(): Promise<void> {},
  };
}

const fallbacks = new Map<string, ValueStore>();

/**
 * Opens a JSON store file.
 *
 * The app normally persists through `tauri-plugin-store`. When that plugin is
 * not present — running the frontend in a browser for UI work, or a failed
 * plugin initialisation — reads and writes fall back to memory for the session
 * instead of throwing. Without the fallback a store failure left every screen
 * stuck on its loading state.
 */
export async function openStore(fileName: string): Promise<ValueStore> {
  try {
    return await load(fileName, { autoSave: false, defaults: {} });
  } catch {
    const existing = fallbacks.get(fileName);
    if (existing) return existing;
    const created = memoryStore();
    fallbacks.set(fileName, created);
    return created;
  }
}
