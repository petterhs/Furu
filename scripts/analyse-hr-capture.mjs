// Analyses a Furu heart-rate capture (JSON or CSV) and reports whether the
// limitation is the estimator or the optical signal itself.
//
//   node scripts/analyse-hr-capture.mjs docs/furu-hr-capture-*.csv
//
// The distinction that matters: a "flat" second (1 s PPG window span < 2 counts)
// means the sensor produced no usable waveform, so no algorithm could find a
// pulse. Seconds with a real waveform that still produce no rate are an estimator
// or threshold problem.

import { readFileSync } from "node:fs";

const path = process.argv[2];
if (!path) {
  console.error(`usage: node scripts/analyse-hr-capture.mjs <capture.json|capture.csv>

Analyses a Heart-rate capture from Settings -> Diagnostics -> Heart-rate capture.

Reports the reading timeline, then decides whether the limit is the optical
signal (flat waveform) or the estimator's thresholds (real waveform, no rate).`);
  process.exit(1);
}

/** Normalises both export formats into { t, source, bytes }. */
function load(file) {
  const text = readFileSync(file, "utf8");
  if (file.endsWith(".json")) {
    const doc = JSON.parse(text);
    return doc.samples.map((sample) => ({
      t: sample.tMs,
      source: sample.source,
      bytes: sample.bytes,
    }));
  }
  // CSV: t_ms,source,"hex"
  return text
    .trim()
    .split("\n")
    .slice(1)
    .map((line) => {
      const match = line.match(/^(\d+),([a-z]+),"([^"]*)"$/);
      if (!match) return null;
      return {
        t: Number(match[1]),
        source: match[2],
        bytes: match[3].split(" ").map((hex) => parseInt(hex, 16)),
      };
    })
    .filter(Boolean);
}

/** Kongle diagnostics v3, 20 bytes. */
function decodeDiagnostics(bytes) {
  const countAndGain = bytes[4] | (bytes[5] << 8);
  const u32 = (offset) =>
    (bytes[offset] |
      (bytes[offset + 1] << 8) |
      (bytes[offset + 2] << 16) |
      (bytes[offset + 3] << 24)) >>>
    0;
  return {
    phase: ["Idle", "Measuring", "NoSignal", "Missing", "Fault"][bytes[1]] ?? `?${bytes[1]}`,
    bpm: bytes[2],
    error: bytes[3],
    samples: countAndGain & 0x0fff,
    gain: (countAndGain >> 12) & 0xf,
    ppg: u32(6),
    ambient: u32(10),
    min: bytes[14] | (bytes[15] << 8),
    max: bytes[16] | (bytes[17] << 8),
    elapsedMs: bytes[18] | (bytes[19] << 8),
  };
}

const rows = load(path);
const measurements = rows.filter((row) => row.source === "measurement");
const diagnostics = rows
  .filter((row) => row.source === "diagnostics")
  .map((row) => ({ t: row.t, ...decodeDiagnostics(row.bytes) }));

const durationMs = rows.length ? rows[rows.length - 1].t : 0;

// --- Reading availability -------------------------------------------------
let withRate = 0;
let firstRateAt = null;
let segments = [];
let current = null;
for (const sample of measurements) {
  const showing = sample.bytes[1] > 0;
  if (showing) {
    withRate += 1;
    if (firstRateAt === null) firstRateAt = sample.t;
  }
  if (!current || current.showing !== showing) {
    current = { showing, from: sample.t, to: sample.t };
    segments.push(current);
  } else {
    current.to = sample.t;
  }
}
const rateSegments = segments.filter((segment) => segment.showing);
const displayedMs = rateSegments.reduce((sum, s) => sum + (s.to - s.from), 0);
const bpmValues = measurements.filter((s) => s.bytes[1] > 0).map((s) => s.bytes[1]);

// --- Signal quality -------------------------------------------------------
const windowed = diagnostics.filter((d) => d.samples > 0);
const amplitudes = windowed.map((d) => d.max - d.min).sort((a, b) => a - b);
const percentile = (values, p) => values[Math.floor((values.length - 1) * p)] ?? 0;
const flat = amplitudes.filter((value) => value < 2).length;

// --- Report ---------------------------------------------------------------
const secs = (ms) => `${(ms / 1000).toFixed(1)}s`;
console.log(`\n${path}`);
console.log(`  ${rows.length} rows, ${measurements.length} measurements, ${diagnostics.length} diagnostics`);
console.log(`  duration ${secs(durationMs)}`);
console.log(`\n  first reading      ${firstRateAt === null ? "never" : secs(firstRateAt)}`);
console.log(`  time with a rate   ${secs(displayedMs)} of ${secs(durationMs)} (${Math.round((displayedMs / durationMs) * 100)}%)`);
console.log(`  readings           ${withRate} notifies`);
if (bpmValues.length) {
  const sorted = [...bpmValues].sort((a, b) => a - b);
  console.log(`  bpm range          ${sorted[0]}-${sorted[sorted.length - 1]} (median ${percentile(sorted, 0.5)})`);
}
console.log(`\n  1s PPG amplitude   p25 ${percentile(amplitudes, 0.25)}  p50 ${percentile(amplitudes, 0.5)}  p75 ${percentile(amplitudes, 0.75)}  max ${percentile(amplitudes, 1)} counts`);
if (windowed.length) {
  console.log(`  ambient            ${Math.min(...windowed.map((d) => d.ambient))}-${Math.max(...windowed.map((d) => d.ambient))}`);
  console.log(`  flat seconds       ${flat} of ${amplitudes.length} (${Math.round((flat / amplitudes.length) * 100)}%)`);
}

// --- Verdict --------------------------------------------------------------
console.log("\n  Verdict:");
const flatShare = amplitudes.length ? flat / amplitudes.length : 0;
const coverage = durationMs ? displayedMs / durationMs : 0;
if (flatShare > 0.3) {
  console.log(`    The waveform was flat for ${Math.round(flatShare * 100)}% of the session.`);
  console.log("    No algorithm can find a pulse in a flat optical signal: this is contact,");
  console.log("    skin perfusion, LED current or gain, not the estimator.");
} else if (coverage < 0.5) {
  console.log(`    Signal was present but a rate showed only ${Math.round(coverage * 100)}% of the time.`);
  console.log("    This points at the estimator's thresholds, not the sensor.");
} else {
  console.log(`    Signal and reporting both reasonable (${Math.round(coverage * 100)}% coverage).`);
}
console.log();

for (const segment of segments) {
  const label = segment.showing ? "rate" : "  - ";
  console.log(`    ${secs(segment.from).padStart(7)} - ${secs(segment.to).padStart(7)}  ${label}  (${secs(segment.to - segment.from)})`);
}
console.log();
