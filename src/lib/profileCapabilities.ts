import { profilePreferenceIncludesCurrentTime, profilePreferenceIncludesHeartRate } from "$lib/deviceProfileEffective";
import type { DeviceProfileCatalog } from "$lib/types/deviceProfileCatalog";

/** CTS block: always show for `auto` so users can preconfigure; otherwise if the profile includes CTS. */
export function showCurrentTimeSyncSettings(
  profilePreference: string,
  catalog: DeviceProfileCatalog,
): boolean {
  if (profilePreference === "auto") return true;
  return profilePreferenceIncludesCurrentTime(profilePreference, catalog);
}

export function showHeartRateLoggingSettings(
  profilePreference: string,
  catalog: DeviceProfileCatalog,
): boolean {
  return profilePreferenceIncludesHeartRate(profilePreference, catalog);
}
