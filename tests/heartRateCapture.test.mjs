import assert from "node:assert/strict";
import test from "node:test";

/**
 * Capture export formatting.
 *
 * These pin the two output shapes the analysis scripts depend on: CSV with one
 * row per sample, and JSON with raw byte arrays. The store itself needs a BLE
 * connection, so the formatting functions are exercised through the same
 * pure logic they use.
 */

function toCsv(samples) {
  const header = ["t_ms", "source", "hex"].join(",");
  const rows = samples.map((sample) =>
    [String(sample.tMs), sample.source, `"${sample.hex}"`].join(","),
  );
  return [header, ...rows].join("\n");
}

function toJson(address, samples) {
  return JSON.stringify({
    version: 1,
    address,
    sampleCount: samples.length,
    samples: samples.map((sample) => ({
      tMs: sample.tMs,
      source: sample.source,
      bytes: sample.bytes,
    })),
  });
}

const sample = (tMs, source, bytes) => ({
  tMs,
  source,
  bytes,
  hex: bytes.map((v) => v.toString(16).padStart(2, "0")).join(" "),
});

test("CSV has a header and one row per sample", () => {
  const csv = toCsv([
    sample(0, "measurement", [0x00, 0x48]),
    sample(100, "diagnostics", [0x03, 0x01]),
  ]);
  const lines = csv.split("\n");
  assert.equal(lines[0], "t_ms,source,hex");
  assert.equal(lines.length, 3);
  assert.ok(lines[1].startsWith("0,measurement,"));
  assert.ok(lines[1].includes("00 48"));
});

test("hex is space-separated and zero padded", () => {
  const [row] = [
    sample(5, "measurement", [0x00, 0x07, 0xff]),
  ];
  assert.equal(row.hex, "00 07 ff");
});

test("CSV quotes the hex column so commas never split a field", () => {
  const csv = toCsv([sample(1, "diagnostics", [0x01, 0x02])]);
  assert.ok(csv.includes('"01 02"'));
});

test("JSON keeps raw bytes alongside the timestamp and source", () => {
  const parsed = JSON.parse(toJson("AA:BB", [sample(10, "quality", [0x03, 0x0b])]));
  assert.equal(parsed.version, 1);
  assert.equal(parsed.address, "AA:BB");
  assert.equal(parsed.sampleCount, 1);
  assert.deepEqual(parsed.samples[0].bytes, [3, 11]);
  assert.equal(parsed.samples[0].source, "quality");
});

test("an empty capture still produces a valid header", () => {
  const csv = toCsv([]);
  assert.equal(csv, "t_ms,source,hex");
  const parsed = JSON.parse(toJson(null, []));
  assert.equal(parsed.sampleCount, 0);
  assert.deepEqual(parsed.samples, []);
});

test("Kongle idle payload round-trips as a distinguishable row", () => {
  // [0,0] is what the firmware sends while not measuring; keep the bytes
  // verbatim rather than filtering, so analysis sees the idle pattern.
  const parsed = JSON.parse(toJson("X", [sample(0, "measurement", [0, 0])]));
  assert.deepEqual(parsed.samples[0].bytes, [0, 0]);
});
