import { openStore } from "#lib/persistence/valueStore";
import { FeatureId, ProfileId } from "#lib/bleContract";
import { readProfileNameRules } from "#lib/persistence/profileNameRulesStore";
import type { DeviceProfileCatalog, DeviceProfileDefinition } from "#lib/types/deviceProfileCatalog";
import type { ProfileNameRule } from "#lib/types/profileNameRule";

const STORE_FILE = "device-profiles.json";
const CATALOG_KEY = "catalog";

async function getStore() {
  return openStore(STORE_FILE);
}

const KNOWN_FEATURE_IDS = new Set<string>(Object.values(FeatureId));

function sanitizeFeatureIds(ids: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    if (!KNOWN_FEATURE_IDS.has(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

export function seedBuiltinProfiles(): DeviceProfileDefinition[] {
  return [
    {
      id: ProfileId.unknown,
      label: "Unknown",
      description: "No optional features assumed until you pick a profile.",
      isBuiltin: true,
      featureIds: [],
    },
    {
      id: ProfileId.infinitime,
      label: "InfiniTime",
      description: "InfiniTime-oriented GATT features (CTS, ANS, DFU, …); editable in Device Profiles.",
      isBuiltin: true,
      featureIds: sanitizeFeatureIds([
        FeatureId.bleDeviceInformation,
        FeatureId.bleCurrentTime,
        FeatureId.bleBattery,
        FeatureId.bleHr,
        FeatureId.bleAnss,
        FeatureId.bleMediaControl,
        FeatureId.bleDisSteps,
        FeatureId.infinitimeDfu,
        FeatureId.infinitimeCompanionUart,
      ]),
    },
    {
      id: ProfileId.kongle,
      label: "Kongle",
      description:
        "Kongle firmware; time, battery, history, notifications, media, steps and on-demand pulse.",
      isBuiltin: true,
      featureIds: sanitizeFeatureIds([
        FeatureId.bleDeviceInformation,
        FeatureId.bleCurrentTime,
        FeatureId.bleAnss,
        FeatureId.bleMediaControl,
        FeatureId.bleBattery,
        FeatureId.kongleBatteryHistory,
        FeatureId.bleDisSteps,
        FeatureId.bleHr,
        FeatureId.kongleWatchConfig,
      ]),
    },
  ];
}

export function defaultNameRules(): ProfileNameRule[] {
  return [
    {
      id: "builtin-infinitime-contains",
      pattern: "InfiniTime",
      matchMode: "contains",
      profileId: ProfileId.infinitime,
    },
    {
      id: "builtin-kongle-prefix",
      pattern: "Kongle",
      matchMode: "prefix",
      profileId: ProfileId.kongle,
    },
  ];
}

export async function readDeviceProfileCatalog(): Promise<DeviceProfileCatalog | null> {
  const store = await getStore();
  const raw = await store.get<DeviceProfileCatalog>(CATALOG_KEY);
  if (!raw || !Array.isArray(raw.profiles)) return null;
  return raw;
}

export async function writeDeviceProfileCatalog(catalog: DeviceProfileCatalog): Promise<void> {
  const store = await getStore();
  await store.set(CATALOG_KEY, catalog);
  await store.save();
}

export async function migrateNameRulesFromLegacyStore(): Promise<ProfileNameRule[] | null> {
  try {
    const legacy = await readProfileNameRules();
    return legacy?.length ? legacy : null;
  } catch {
    return null;
  }
}
