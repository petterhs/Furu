export type ProfilePreference = "auto" | string;

export type RememberedDevice = {
  id: string;
  address: string;
  name: string;
  /** Local display name; never used for firmware detection. */
  nickname?: string;
  detectedProfileId?: string;
  profileSuggestion?: import("#lib/profileObservation").ProfileSuggestion;
  dismissedProfileSuggestions?: string[];
  lastSeenAt: string;
  profilePreference: ProfilePreference;
  notificationsEnabled: boolean;
  /** Periodic CTS writes when connected and profile includes `ble.current_time`. */
  currentTimeSyncEnabled: boolean;
  /** Minutes between automatic CTS syncs (clamped 5–1440). */
  currentTimeSyncIntervalMinutes: number;
  /** When the device profile includes heart rate; UI may gate on this. */
  heartRateLoggingEnabled: boolean;
  /** When true, try to restore the BLE link after an unexpected disconnect. */
  autoReconnect: boolean;
  /** Minutes between automatic reconnect attempts (clamped). Default 5. */
  autoReconnectIntervalMinutes: number;
  /**
   * Stop auto-reconnect after this many failed attempts in a row. **0** = no limit (default). Otherwise clamped to a
   * sensible upper bound.
   */
  autoReconnectMaxAttempts: number;
};

