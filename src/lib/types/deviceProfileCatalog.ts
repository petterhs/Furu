import type { ProfileNameRule } from "$lib/types/profileNameRule";

export type DeviceProfileDefinition = {
  id: string;
  label: string;
  description: string;
  isBuiltin: boolean;
  featureIds: string[];
};

export type DeviceProfileCatalog = {
  profiles: DeviceProfileDefinition[];
  nameRules: ProfileNameRule[];
};
