/**
 * Heart Rate Measurement (`0x2A37`) — Bluetooth Core Specification Supplement (GATT).
 * https://www.bluetooth.com/specifications/specs/heart-rate-service-1-0/
 */

/** SIG Heart Rate Service and Heart Rate Measurement (128-bit form). */
export const HEART_RATE_SERVICE_UUID = "0000180d-0000-1000-8000-00805f9b34fb";
export const HEART_RATE_MEASUREMENT_CHAR_UUID = "00002a37-0000-1000-8000-00805f9b34fb";

const BPM_MIN = 30;
const BPM_MAX = 220;

/**
 * Decodes a **Heart Rate Measurement** notification or read payload.
 * Returns `null` when the value must not be shown (sensor off, out of range, truncated PDU, etc.).
 */
export function parseHeartRateMeasurement(data: number[]): number | null {
  if (data.length < 2) return null;
  const flags = data[0]!;
  const heartRateIsUint16 = (flags & 0x01) !== 0;
  let offset = 1;
  let bpm: number;
  if (heartRateIsUint16) {
    if (data.length < offset + 2) return null;
    bpm = data[offset]! | (data[offset + 1]! << 8);
    offset += 2;
  } else {
    if (data.length < offset + 1) return null;
    bpm = data[offset]!;
    offset += 1;
  }

  const sensorContactSupported = (flags & 0x02) !== 0;
  if (sensorContactSupported) {
    const sensorContactDetected = (flags & 0x04) !== 0;
    if (!sensorContactDetected) return null;
  }

  if (bpm < BPM_MIN || bpm > BPM_MAX) return null;
  return bpm;
}
