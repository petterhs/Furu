import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_CLOCK_FIELDS,
  clockFieldIsReady,
  getClockFieldDefinition,
  sanitizeClockFields,
} from "../src/lib/integrations/clockFields.ts";
import { INTEGRATION_DEFINITIONS, missingRequiredFields } from "../src/lib/integrations/registry.ts";

test("clock field ids are stable and unique", () => {
  const ids = sanitizeClockFields([
    "field.steps",
    "field.heart_rate",
    "field.battery",
    "field.weather.temperature",
  ]);
  assert.deepEqual(ids, [
    "field.steps",
    "field.heart_rate",
    "field.battery",
    "field.weather.temperature",
  ]);
  assert.equal(new Set(ids).size, ids.length);
});

test("clock fields drop unknown ids and duplicates, then cap the list", () => {
  const ids = sanitizeClockFields([
    "field.steps",
    "field.steps",
    "not.a.field",
    "field.battery",
    "field.heart_rate",
    "field.weather.temperature",
    "field.sleep.score",
  ]);
  assert.equal(ids.length, MAX_CLOCK_FIELDS);
  assert.ok(!ids.includes("not.a.field"));
  assert.equal(new Set(ids).size, ids.length);
});

test("integration-gated clock fields report readiness from configured providers", () => {
  const weather = getClockFieldDefinition("field.weather.temperature");
  assert.ok(weather);
  assert.equal(clockFieldIsReady(weather, []), false);
  assert.equal(clockFieldIsReady(weather, ["weather"]), true);

  const steps = getClockFieldDefinition("field.steps");
  assert.ok(steps);
  assert.equal(clockFieldIsReady(steps, []), true);
});

test("every integration definition has a unique id and non-empty fields", () => {
  const ids = INTEGRATION_DEFINITIONS.map((definition) => definition.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const definition of INTEGRATION_DEFINITIONS) {
    assert.ok(definition.name.length > 0);
    assert.ok(definition.configFields.length > 0, `${definition.id} has no fields`);
    const keys = definition.configFields.map((field) => field.key);
    assert.equal(new Set(keys).size, keys.length, `${definition.id} repeats a field key`);
  }
});

test("missingRequiredFields lists only blank required fields", () => {
  const weather = INTEGRATION_DEFINITIONS.find((definition) => definition.id === "weather");
  assert.ok(weather);
  const missing = missingRequiredFields(weather, {});
  assert.ok(missing.length >= 2);
  const satisfied = missingRequiredFields(weather, { provider: "met_no", location: "Oslo", units: "metric" });
  assert.deepEqual(satisfied, []);
});

test("no integration claims to be available while it has no backend", () => {
  // Guards against a definition being flipped to `available` without a provider.
  for (const definition of INTEGRATION_DEFINITIONS) {
    assert.equal(definition.status, "planned", `${definition.id} claims availability`);
  }
});
