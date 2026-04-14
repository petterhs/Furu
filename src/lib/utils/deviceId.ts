/**
 * Normalize BLE addresses for comparisons (48-bit public / random static MAC).
 * Handles `AA:BB:…`, `aa-bb-…`, and compact `AABBCCDDEEFF`; case-insensitive.
 */
export function normalizeBleAddress(address: string): string {
  const trimmed = address.trim();
  const hexOnly = trimmed.replace(/[^0-9a-fA-F]/g, "");
  if (hexOnly.length === 12) {
    return hexOnly
      .toLowerCase()
      .match(/.{1,2}/g)!
      .join(":");
  }
  return trimmed.toLowerCase();
}

export function bleAddressesEqual(a: string, b: string): boolean {
  return normalizeBleAddress(a) === normalizeBleAddress(b);
}

export function deviceIdFromAddress(address: string): string {
  return encodeURIComponent(address.trim());
}

export function addressFromDeviceId(deviceId: string): string {
  return decodeURIComponent(deviceId).trim();
}

