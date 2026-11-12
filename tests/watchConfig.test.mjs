import assert from "node:assert/strict";
import test from "node:test";
import {
  WATCH_APP_DEFINITIONS,
  defaultWatchConfig,
  moveClockField,
  sanitizeWatchConfig,
  toggleClockField,
  toggleWatchApp,
} from "../src/lib/types/watchConfig.ts";

test("defaults match what Kongle 0.4 actually shows", () => {
  const config = defaultWatchConfig();
  assert.deepEqual(config.clockFields, ["field.steps"]);
  assert.deepEqual([...config.enabledApps].sort(), ["media", "notifications"]);
});

test("sanitizeWatchConfig replaces junk with the defaults", () => {
  assert.deepEqual(sanitizeWatchConfig({ clockFields: ["bogus"], enabledApps: ["nope"] }), defaultWatchConfig());
  assert.deepEqual(sanitizeWatchConfig(null), defaultWatchConfig());
});

test("sanitizeWatchConfig keeps valid apps and drops unknown ones", () => {
  const config = sanitizeWatchConfig({ clockFields: ["field.battery"], enabledApps: ["media", "bogus"] });
  assert.deepEqual(config.clockFields, ["field.battery"]);
  assert.deepEqual(config.enabledApps, ["media"]);
});

test("sanitizeWatchConfig keeps an intentionally empty app list", () => {
  const config = sanitizeWatchConfig({ clockFields: ["field.steps"], enabledApps: [] });
  assert.deepEqual(config.enabledApps, []);
});

test("toggleClockField adds and removes without exceeding the slot cap", () => {
  let fields = toggleClockField([], "field.steps");
  assert.deepEqual(fields, ["field.steps"]);
  fields = toggleClockField(fields, "field.steps");
  assert.deepEqual(fields, []);

  let many = [];
  for (const id of [
    "field.steps",
    "field.heart_rate",
    "field.battery",
    "field.weather.temperature",
    "field.sleep.score",
  ]) {
    many = toggleClockField(many, id);
  }
  assert.equal(many.length, 4);
});

test("moveClockField reorders within bounds and ignores invalid moves", () => {
  const fields = ["a", "b", "c"];
  assert.deepEqual(moveClockField(fields, 0, 1), ["b", "a", "c"]);
  assert.deepEqual(moveClockField(fields, 0, -1), ["a", "b", "c"]);
  assert.deepEqual(moveClockField(fields, 2, 1), ["a", "b", "c"]);
  // The source array is not mutated.
  assert.deepEqual(fields, ["a", "b", "c"]);
});

test("toggleWatchApp follows the definition list", () => {
  const first = WATCH_APP_DEFINITIONS[0].id;
  const enabled = toggleWatchApp([], first);
  assert.deepEqual(enabled, [first]);
  assert.deepEqual(toggleWatchApp(enabled, first), []);
});
