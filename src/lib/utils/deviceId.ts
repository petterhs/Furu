/** Normalize BLE addresses for comparisons (MAC-like strings). */
export function normalizeBleAddress(address: string): string {
  const trimmed = address.trim();
  const looksMacLike = /[0-9a-fA-F]{2}[:-][0-9a-fA-F]{2}/.test(trimmed);
  if (!looksMacLike) {
    return trimmed;
  }
  const hex = trimmed.replace(/[^0-9a-fA-F]/g, "").toLowerCase();
  if (hex.length === 12) {
    return hex.match(/.{1,2}/g)!.join(":");
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

