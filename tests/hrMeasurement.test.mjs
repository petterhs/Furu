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

test("uint16 values use both bytes little-endian", () => {
  // Flags bit 0 set means a 16-bit rate. 200 bpm = 0x00C8.
  assert.equal(parseHeartRateMeasurement([0x01, 0xc8, 0x00]), 200);
  assert.equal(parseHeartRateMeasurement([0x01, 100, 0]), 100);
  // 300 bpm is representable but outside the plausible range, so it is hidden.
  assert.equal(parseHeartRateMeasurement([0x01, 0x2c, 0x01]), null);
});

test("Kongle's idle payload is exactly flags 0x00 with a zero rate", () => {
  // Kongle's heart_rate.rs writes [0, 0] while not measuring; the 0 rate must
  // fall outside BPM_MIN and surface as "no reading" rather than 0 bpm.
  assert.equal(parseHeartRateMeasurement([0x00, 0x00]), null);
});
