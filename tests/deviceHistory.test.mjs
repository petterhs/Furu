import assert from "node:assert/strict";
import test from "node:test";
import {
  GAP_THRESHOLD_MS,
  RANGE_MS,
  chargingSegments,
  countGaps,
  splitAtGaps,
  timelineTickLabelStep,
  timelineTicksFor,
} from "../src/lib/deviceHistory.ts";

const at = (minutes) => new Date(Date.UTC(2026, 0, 1, 12, minutes)).toISOString();

test("range windows are ordered and distinct", () => {
  const values = Object.values(RANGE_MS);
  assert.equal(new Set(values).size, values.length);
  assert.ok(RANGE_MS["3h"] < RANGE_MS["1d"]);
  assert.ok(RANGE_MS["1d"] < RANGE_MS["3d"]);
  assert.ok(RANGE_MS["3d"] < RANGE_MS["7d"]);
});

test("splitAtGaps keeps close samples and breaks at a long silence", () => {
  const points = [
    { time: new Date(0) },
    { time: new Date(GAP_THRESHOLD_MS) },
    { time: new Date(GAP_THRESHOLD_MS * 2 + 1) },
  ];
  const segments = splitAtGaps(points);
  assert.equal(segments.length, 2);
  assert.equal(segments[0].length, 2);
  assert.equal(segments[1].length, 1);
});

test("splitAtGaps returns no segments for an empty series", () => {
  assert.deepEqual(splitAtGaps([]), []);
});

test("countGaps ignores consecutive samples but counts wide jumps", () => {
  const samples = [
    { at: at(0) },
    { at: at(5) },
    { at: at(60) },
    { at: at(65) },
  ];
  assert.equal(countGaps(samples), 1);
  assert.equal(countGaps(samples.slice(0, 1)), 0);
});

test("chargingSegments clamps to the window and skips non-charging samples", () => {
  const start = Date.parse(at(0));
  const end = start + 30 * 60_000;
  const samples = [
    { at: new Date(start).toISOString(), charging: false },
    { at: new Date(start + 5 * 60_000).toISOString(), charging: true },
    { at: new Date(start + 10 * 60_000).toISOString(), charging: false },
  ];
  const segments = chargingSegments(samples, start, end);
  assert.equal(segments.length, 1);
  // A charging sample lasts until the next sample (5 min of a 30 min window).
  assert.ok(Math.abs(segments[0].width - (5 / 30) * 100) < 0.001);
  assert.ok(Math.abs(segments[0].left - (5 / 30) * 100) < 0.001);
});

test("chargingSegments never extends past the range end", () => {
  const start = Date.parse(at(0));
  const end = start + 5 * 60_000;
  const samples = [{ at: new Date(start + 4 * 60_000).toISOString(), charging: true }];
  const segments = chargingSegments(samples, start, end);
  assert.equal(segments.length, 1);
  assert.ok(segments[0].left + segments[0].width <= 100.0001);
});

test("timeline tick density thins labels before they collide", () => {
  assert.equal(timelineTickLabelStep(4), 1);
  assert.equal(timelineTickLabelStep(24), 2);
  assert.equal(timelineTickLabelStep(40), 3);
});

test("hour grid ticks are evenly spaced inside the window", () => {
  const start = Date.UTC(2026, 0, 1, 6, 0);
  const end = start + RANGE_MS["3h"];
  const ticks = timelineTicksFor("3h", start, end);
  assert.ok(ticks.length >= 3);
  const step = ticks[1] - ticks[0];
  for (let index = 1; index < ticks.length; index += 1) {
    assert.equal(ticks[index] - ticks[index - 1], step);
  }
  assert.ok(ticks.every((tick) => tick >= start && tick <= end));
});
