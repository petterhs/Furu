import { get, writable } from "svelte/store";
import { FeatureId } from "$lib/bleContract";
import type { ProfileInfo } from "$lib/bleContract";
import {
  defaultNameRules,
  migrateNameRulesFromLegacyStore,
  readDeviceProfileCatalog,
  seedBuiltinProfiles,
  writeDeviceProfileCatalog,
} from "$lib/persistence/deviceProfilesStore";
import type { DeviceProfileCatalog, DeviceProfileDefinition } from "$lib/types/deviceProfileCatalog";
import type { ProfileNameRule } from "$lib/types/profileNameRule";

export const deviceProfileCatalog = writable<DeviceProfileCatalog>({ profiles: [], nameRules: [] });
export const deviceProfilesHydrated = writable(false);

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

function sanitizeNameRules(rules: ProfileNameRule[], validProfileIds: Set<string>): ProfileNameRule[] {
  return rules.filter(
    (r) =>
      typeof r.id === "string" &&
      r.id.length > 0 &&
      typeof r.pattern === "string" &&
      (r.matchMode === "contains" || r.matchMode === "prefix" || r.matchMode === "equals") &&
      typeof r.profileId === "string" &&
      validProfileIds.has(r.profileId),
  );
}

function builtinProfileIds(): Set<string> {
  return new Set(seedBuiltinProfiles().map((s) => s.id));
}

function ensureBuiltinProfilesPresent(profiles: DeviceProfileDefinition[]): DeviceProfileDefinition[] {
  const map = new Map(profiles.map((p) => [p.id, p]));
  for (const seed of seedBuiltinProfiles()) {
    if (!map.has(seed.id)) {
      map.set(seed.id, seed);
    }
  }
  const builtinIdSet = builtinProfileIds();
  const orderedBuiltins = seedBuiltinProfiles().map((s) => map.get(s.id)!);
  const customs = profiles.filter((p) => !builtinIdSet.has(p.id));
  return [...orderedBuiltins, ...customs];
}

function normalizeCatalog(raw: DeviceProfileCatalog): DeviceProfileCatalog {
  const builtinIds = builtinProfileIds();
  const profiles = ensureBuiltinProfilesPresent(
    raw.profiles.map((p) => {
      const id = p.id.trim();
      return {
        id,
        label: (p.label ?? id).trim() || id,
        description: (p.description ?? "").trim(),
        isBuiltin: builtinIds.has(id),
        featureIds: sanitizeFeatureIds(Array.isArray(p.featureIds) ? p.featureIds : []),
      };
    }),
  );
  const validIds = new Set(profiles.map((p) => p.id));
  let nameRules = sanitizeNameRules(raw.nameRules ?? [], validIds);
  if (!nameRules.length) {
    nameRules = defaultNameRules();
  }
  return { profiles, nameRules };
}

export function catalogToProfileInfos(catalog: DeviceProfileCatalog): ProfileInfo[] {
  return catalog.profiles.map((p) => ({
    id: p.id,
    label: p.label,
    description: p.description,
  }));
}

export async function hydrateDeviceProfiles(): Promise<void> {
  const fromDisk = await readDeviceProfileCatalog();
  let catalog: DeviceProfileCatalog;
  let needsWrite = false;

  if (!fromDisk?.profiles?.length) {
    const migratedRules = await migrateNameRulesFromLegacyStore();
    catalog = {
      profiles: seedBuiltinProfiles(),
      nameRules: migratedRules ?? defaultNameRules(),
    };
    needsWrite = true;
  } else {
    catalog = normalizeCatalog(fromDisk);
    const normalized = JSON.stringify(catalog);
    const original = JSON.stringify(fromDisk);
    if (normalized !== original) needsWrite = true;
  }

  deviceProfileCatalog.set(catalog);
  deviceProfilesHydrated.set(true);
  if (needsWrite) {
    await writeDeviceProfileCatalog(catalog);
  }
}

export async function persistDeviceProfileCatalog(catalog: DeviceProfileCatalog): Promise<void> {
  const next = normalizeCatalog(catalog);
  deviceProfileCatalog.set(next);
  await writeDeviceProfileCatalog(next);
}

/** Clone, mutate, then persist a normalized catalog. */
export async function patchDeviceProfileCatalog(mutator: (draft: DeviceProfileCatalog) => void): Promise<void> {
  const draft = structuredClone(get(deviceProfileCatalog));
  mutator(draft);
  await persistDeviceProfileCatalog(draft);
}

export function getFeatureIdsForProfileId(profileId: string): string[] {
  return get(deviceProfileCatalog).profiles.find((p) => p.id === profileId)?.featureIds ?? [];
}
