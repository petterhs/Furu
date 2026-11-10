import test from "node:test";
import assert from "node:assert/strict";
import { parseHeartRateMeasurement } from "../src/lib/ble/hrMeasurement.ts";

test("SIG contact bits distinguish unsupported, detected and lost contact", () => {
  assert.equal(parseHeartRateMeasurement([0x00, 72]), 72);
  assert.equal(parseHeartRateMeasurement([0x02, 72]), 72); // Unsupported: ignore status bit.
  assert.equal(parseHeartRateMeasurement([0x04, 72]), null); // Supported, contact absent.
  assert.equal(parseHeartRateMeasurement([0x06, 72]), 72);
});

test("Kongle inactive/invalid data stays hidden, including truncated uint16 values", () => {
  assert.equal(parseHeartRateMeasurement([0, 0]), null);
  assert.equal(parseHeartRateMeasurement([0, 29]), null);
  assert.equal(parseHeartRateMeasurement([0, 221]), null);
  assert.equal(parseHeartRateMeasurement([1, 72]), null);
  assert.equal(parseHeartRateMeasurement([1, 72, 0]), 72);
  assert.equal(parseHeartRateMeasurement([]), null);
});
