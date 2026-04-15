export type ProfilePreference = "auto" | string;

export type RememberedDevice = {
  id: string;
  address: string;
  name: string;
  lastSeenAt: string;
  profilePreference: ProfilePreference;
  notificationsEnabled: boolean;
  /** Periodic CTS writes when connected and profile includes `ble.current_time`. */
  currentTimeSyncEnabled: boolean;
  /** Minutes between automatic CTS syncs (clamped 5–1440). */
  currentTimeSyncIntervalMinutes: number;
  /** When the device profile includes heart rate; UI may gate on this. */
  heartRateLoggingEnabled: boolean;
};

