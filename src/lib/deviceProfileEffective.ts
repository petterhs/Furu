import { FeatureId } from "$lib/bleContract";
import type { DeviceProfileCatalog } from "$lib/types/deviceProfileCatalog";

export function getFeatureIdsForProfile(catalog: DeviceProfileCatalog, profileId: string): string[] {
  return catalog.profiles.find((p) => p.id === profileId)?.featureIds ?? [];
}

/** Union of features from every profile targeted by name rules (for `auto` gating in UI). */
export function unionFeaturesForAutoPreference(catalog: DeviceProfileCatalog): Set<string> {
  const ids = new Set<string>();
  for (const rule of catalog.nameRules) {
    for (const fid of getFeatureIdsForProfile(catalog, rule.profileId)) {
      ids.add(fid);
    }
  }
  return ids;
}

export function effectiveFeatureUnionForPreference(
  profilePreference: string,
  catalog: DeviceProfileCatalog,
): Set<string> {
  if (profilePreference === "auto") return unionFeaturesForAutoPreference(catalog);
  return new Set(getFeatureIdsForProfile(catalog, profilePreference));
}

export function profilePreferenceIncludesCurrentTime(
  profilePreference: string,
  catalog: DeviceProfileCatalog,
): boolean {
  return effectiveFeatureUnionForPreference(profilePreference, catalog).has(FeatureId.bleCurrentTime);
}

export function profilePreferenceIncludesHeartRate(
  profilePreference: string,
  catalog: DeviceProfileCatalog,
): boolean {
  return effectiveFeatureUnionForPreference(profilePreference, catalog).has(FeatureId.bleHr);
}

export function profilePreferenceIncludesDeviceInformation(
  profilePreference: string,
  catalog: DeviceProfileCatalog,
): boolean {
  return effectiveFeatureUnionForPreference(profilePreference, catalog).has(FeatureId.bleDeviceInformation);
}
