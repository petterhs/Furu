export type ProfilePreference = "auto" | string;

export type RememberedDevice = {
  id: string;
  address: string;
  name: string;
  lastSeenAt: string;
  profilePreference: ProfilePreference;
  notificationsEnabled: boolean;
};

