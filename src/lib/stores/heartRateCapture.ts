import { get, writable } from "svelte/store";
import { read, subscribe, unsubscribe } from "@mnlphlp/plugin-blec";
import { localIsoWithOffset } from "#lib/utils/timestamp";

/**
 * Raw capture of a Kongle heart-rate session.
 *
 * The firmware's HR estimator is still being validated on hardware, so the
 * useful artefact is the *unparsed* data: every SIG measurement notification
 * and every read of the vendor diagnostics characteristic, with timestamps.
 * Parsing happens later, offline, against these bytes.
 *
 * Capture is opt-in per session and memory-bounded. Nothing is uploaded.
 */

/** Vendor diagnostics characteristic under the HR service (read + notify). */
export const KONGLE_HR_DIAGNOSTICS_UUID = "6b6f180d-1886-4b40-ae7d-00a11ce50001";
/** Quality/confidence characteristic (read only). */
export const KONGLE_HR_QUALITY_UUID = "6b6f180d-1886-4b40-ae7d-00a11ce50002";
const HEART_RATE_SERVICE_UUID = "0000180d-0000-1000-8000-00805f9b34fb";
const HEART_RATE_MEASUREMENT_UUID = "00002a37-0000-1000-8000-00805f9b34fb";

export type CaptureSource = "measurement" | "diagnostics" | "quality";

export type CaptureSample = {
  /** Milliseconds since capture start. */
  tMs: number;
  source: CaptureSource;
  /** Raw bytes as received, hex without separators (for CSV) plus spaced form. */
  hex: string;
  bytes: number[];
};

/** A bounded ring buffer: 10 Hz for several minutes fits comfortably. */
export const MAX_SAMPLES = 20_000;

export const captureSamples = writable<CaptureSample[]>([]);
export const captureActive = writable(false);
export const captureError = writable<string | null>(null);
/** Address the current capture belongs to, so a stale capture is obvious. */
export const captureAddress = writable<string | null>(null);

let startedAt = 0;
let subscribed = false;

function append(source: CaptureSource, data: number[]): void {
  captureSamples.update((samples) => {
    const next = samples.concat({
      tMs: Date.now() - startedAt,
      source,
      hex: data.map((value) => value.toString(16).padStart(2, "0")).join(" "),
      bytes: [...data],
    });
    // Drop the oldest half when full rather than growing without bound.
    return next.length > MAX_SAMPLES ? next.slice(next.length - MAX_SAMPLES) : next;
  });
}

export function resetCapture(): void {
  captureSamples.set([]);
  captureError.set(null);
}

/**
 * Begins recording. Subscribes to the diagnostics stream in addition to the
 * measurement characteristic Furu already watches, so a session captures both
 * the reported BPM and the raw optical counters behind it.
 */
export async function startCapture(address: string): Promise<void> {
  if (get(captureActive)) return;
  resetCapture();
  startedAt = Date.now();
  captureAddress.set(address);
  captureError.set(null);
  captureActive.set(true);

  try {
    await subscribe(HEART_RATE_MEASUREMENT_UUID, (data) => append("measurement", data));
    await subscribe(KONGLE_HR_DIAGNOSTICS_UUID, (data) => append("diagnostics", data));
    subscribed = true;
  } catch (error) {
    // A missing vendor characteristic is expected on non-Kongle firmware; the
    // measurement stream alone is still worth keeping.
    captureError.set(
      `Diagnostics stream unavailable (${String(error)}). Recording measurement only.`,
    );
  }

  // One snapshot of each read-only characteristic at start, for scale context.
  for (const [source, uuid] of [
    ["quality", KONGLE_HR_QUALITY_UUID],
    ["diagnostics", KONGLE_HR_DIAGNOSTICS_UUID],
  ] as const) {
    try {
      append(source, await read(uuid, HEART_RATE_SERVICE_UUID));
    } catch {
      /* optional */
    }
  }
}

export async function stopCapture(): Promise<void> {
  if (!get(captureActive)) return;
  captureActive.set(false);
  if (subscribed) {
    subscribed = false;
    await unsubscribe(HEART_RATE_MEASUREMENT_UUID).catch(() => {});
    await unsubscribe(KONGLE_HR_DIAGNOSTICS_UUID).catch(() => {});
  }
}

/**
 * Captures as CSV. One row per sample, so a spreadsheet or a small script can
 * replay the firmware estimator offline.
 */
export function captureToCsv(): string {
  const header = ["t_ms", "source", "hex"].join(",");
  const rows = get(captureSamples).map((sample) =>
    [String(sample.tMs), sample.source, `"${sample.hex}"`].join(","),
  );
  return [header, ...rows].join("\n");
}

/** Raw byte layout, for tooling that prefers numbers to hex. */
export function captureToJson(): string {
  const started = new Date(startedAt);
  return JSON.stringify(
    {
      version: 1,
      address: get(captureAddress),
      // Local time with an explicit offset, so the file is unambiguous wherever
      // it is read. `startedAtUtc` is kept for tooling that expects Z time.
      startedAt: localIsoWithOffset(started),
      startedAtUtc: started.toISOString(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      sampleCount: get(captureSamples).length,
      samples: get(captureSamples).map((sample) => ({
        tMs: sample.tMs,
        source: sample.source,
        bytes: sample.bytes,
      })),
    },
    null,
    2,
  );
}
