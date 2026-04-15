import { load } from "@tauri-apps/plugin-store";
import { ProfileId } from "$lib/bleContract";
import type { ProfileNameRule } from "$lib/types/profileNameRule";

const STORE_FILE = "profile-name-rules.json";
const RULES_KEY = "rules";

async function getStore() {
  return load(STORE_FILE, { autoSave: false, defaults: {} });
}

export function defaultProfileNameRules(): ProfileNameRule[] {
  return [
    {
      id: "builtin-infinitime-contains",
      pattern: "InfiniTime",
      matchMode: "contains",
      profileId: ProfileId.infinitimePlaceholder,
    },
    {
      id: "builtin-kongle-prefix",
      pattern: "Kongle",
      matchMode: "prefix",
      profileId: ProfileId.kongle,
    },
  ];
}

export async function readProfileNameRules(): Promise<ProfileNameRule[] | null> {
  const store = await getStore();
  const rules = await store.get<ProfileNameRule[]>(RULES_KEY);
  return Array.isArray(rules) ? rules : null;
}

export async function writeProfileNameRules(rules: ProfileNameRule[]): Promise<void> {
  const store = await getStore();
  await store.set(RULES_KEY, rules);
  await store.save();
}
