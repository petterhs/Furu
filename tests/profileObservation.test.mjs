import assert from "node:assert/strict";
import test from "node:test";
import { observeProfile, profileSuggestionKey } from "../src/lib/profileObservation.ts";

test("first observation establishes a baseline; versions and reconnects do not prompt", () => {
  const baseline = observeProfile({}, "infinitime", "infinitime");
  assert.equal(baseline.detectedProfileId, "infinitime");
  assert.equal(baseline.profileSuggestion, undefined);
  assert.equal(observeProfile(baseline, "infinitime", "infinitime"), baseline);
  assert.equal(observeProfile(baseline, "infinitime", "unknown"), baseline);
});

test("a firmware change suggests a profile without replacing a manual override", () => {
  const next = observeProfile({ detectedProfileId: "infinitime" }, "my-custom-profile", "kongle");
  assert.deepEqual(next.profileSuggestion, {
    detectedProfileId: "kongle", overrideProfileId: "my-custom-profile",
  });
  assert.equal(observeProfile(next, "my-custom-profile", "kongle"), next);
});

test("decline survives serialization and even switching away and back", () => {
  const suggestion = { detectedProfileId: "kongle", overrideProfileId: "infinitime" };
  let saved = JSON.parse(JSON.stringify({
    detectedProfileId: "kongle", dismissedProfileSuggestions: [profileSuggestionKey(suggestion)],
  }));
  assert.equal(observeProfile(saved, "infinitime", "kongle").profileSuggestion, undefined);
  saved = observeProfile(saved, "infinitime", "infinitime");
  saved = observeProfile(saved, "infinitime", "kongle");
  assert.equal(saved.profileSuggestion, undefined);
  // A different manual override is a different decision.
  const changed = observeProfile({ ...saved, detectedProfileId: "infinitime" }, "custom", "kongle");
  assert.equal(changed.profileSuggestion.overrideProfileId, "custom");
});

test("auto mode or an already matching override never asks", () => {
  for (const preference of ["auto", "kongle"]) {
    const next = observeProfile({ detectedProfileId: "infinitime" }, preference, "kongle");
    assert.equal(next.profileSuggestion, undefined);
    assert.equal(next.detectedProfileId, "kongle");
  }
});
