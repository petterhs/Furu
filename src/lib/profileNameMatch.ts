import { ProfileId } from "$lib/bleContract";
import type { ProfileNameRule } from "$lib/types/profileNameRule";

/** First matching rule wins; matching is case-insensitive. Empty advertisement name → `unknown`. */
export function resolveProfileIdFromDeviceName(
  name: string | null | undefined,
  rules: ProfileNameRule[],
): string {
  const trimmed = (name ?? "").trim();
  if (!trimmed) return ProfileId.unknown;

  const haystack = trimmed.toLowerCase();

  for (const rule of rules) {
    const needle = rule.pattern.trim();
    if (!needle) continue;
    const n = needle.toLowerCase();
    const ok =
      rule.matchMode === "equals"
        ? haystack === n
        : rule.matchMode === "prefix"
          ? haystack.startsWith(n)
          : haystack.includes(n);
    if (ok) return rule.profileId;
  }

  return ProfileId.unknown;
}
