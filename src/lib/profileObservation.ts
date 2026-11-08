/** Persisted independently of the advertised name and the user's profile choice. */
export type ProfileSuggestion = { detectedProfileId: string; overrideProfileId: string };
export type ProfileObservation = {
  detectedProfileId?: string;
  profileSuggestion?: ProfileSuggestion;
  dismissedProfileSuggestions?: string[];
};

export function profileSuggestionKey(suggestion: ProfileSuggestion): string {
  return JSON.stringify([suggestion.detectedProfileId, suggestion.overrideProfileId]);
}

/** Versions within the same detected profile do not produce another suggestion.
 * First observation establishes a baseline for existing installations. */
export function observeProfile(
  previous: ProfileObservation,
  preference: string,
  detectedProfileId: string,
): ProfileObservation {
  if (detectedProfileId === "unknown") return previous;
  if (previous.detectedProfileId === detectedProfileId) return previous;
  const suggestion = { detectedProfileId, overrideProfileId: preference };
  const shouldSuggest = previous.detectedProfileId !== undefined &&
    preference !== "auto" && preference !== detectedProfileId &&
    !previous.dismissedProfileSuggestions?.includes(profileSuggestionKey(suggestion));
  return {
    ...previous,
    detectedProfileId,
    profileSuggestion: shouldSuggest ? suggestion : undefined,
  };
}
