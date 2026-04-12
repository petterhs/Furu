/**
 * Stable BLE feature IDs — mirror of Rust `FeatureId` and `docs/features/catalog.md`.
 * Do not rename; add new constants for new capabilities.
 */
export const FeatureId = {
  devPluginTestEcho: "dev.plugin_test_echo",
  bleDeviceInformation: "ble.device_information",
  bleCurrentTime: "ble.current_time",
  bleHr: "ble.hr",
  bleAnss: "ble.anss",
  bleDisSteps: "ble.dis_steps",
  infinitimeDfu: "infinitime.dfu",
  infinitimeCompanionUart: "infinitime.companion_uart",
} as const;

export type FeatureIdValue = (typeof FeatureId)[keyof typeof FeatureId];

/** Same strings as Rust `ProfileId::as_str`. */
export const ProfileId = {
  unknown: "unknown",
  infinitimePlaceholder: "infinitime_placeholder",
} as const;

export type ProfileIdValue = (typeof ProfileId)[keyof typeof ProfileId];

export type ProfileInfo = {
  id: string;
  label: string;
  description: string;
};
