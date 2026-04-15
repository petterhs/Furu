import type { RememberedDevice } from "$lib/types/device";

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

/**
 * Resolves a remembered device from a `[deviceId]` route param.
 * Params may be decoded by the router (e.g. `AA:BB:…`) while persisted `RememberedDevice.id`
 * uses {@link deviceIdFromAddress} (`encodeURIComponent` of the address), so equality on `id` alone can fail.
 */
export function findRememberedByDeviceRouteParam(
  deviceIdParam: string | undefined,
  devices: RememberedDevice[],
): RememberedDevice | undefined {
  if (deviceIdParam === undefined || deviceIdParam === "") return undefined;
  const trimmed = deviceIdParam.trim();
  const byStoredId = devices.find((d) => d.id === trimmed);
  if (byStoredId) return byStoredId;

  let resolvedAddress: string;
  try {
    resolvedAddress = addressFromDeviceId(trimmed);
  } catch {
    resolvedAddress = trimmed;
  }
  return devices.find((d) => bleAddressesEqual(d.address, resolvedAddress));
}

