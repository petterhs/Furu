export type ProfileNameMatchMode = "contains" | "prefix" | "equals";

export type ProfileNameRule = {
  id: string;
  pattern: string;
  matchMode: ProfileNameMatchMode;
  profileId: string;
};
