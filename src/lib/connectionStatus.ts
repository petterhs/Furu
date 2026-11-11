import type { NativeConnectionSnapshot } from "#lib/stores/bleSession";
import type { RememberedDevice } from "#lib/types/device";

export type ConnectionTone = "success" | "warning" | "error" | "neutral" | "primary";

export type ConnectionView = {
  label: string;
  tone: ConnectionTone;
  busy: boolean;
};

/**
 * Maps the native connection snapshot plus the remembered-device list onto one
 * status label. The Rust connection manager owns the real state machine, so the
 * UI only translates; it never infers a state of its own.
 */
export function describeConnection(
  snapshot: NativeConnectionSnapshot | null,
  address: string | null | undefined,
  sameAddress: (a: string, b: string) => boolean,
): ConnectionView {
  if (!address) return { label: "Not connected", tone: "neutral", busy: false };
  const isTarget = Boolean(snapshot?.address && sameAddress(snapshot.address, address));

  if (isTarget && snapshot) {
    switch (snapshot.status) {
      case "connected":
        return { label: "Connected", tone: "success", busy: false };
      case "connecting":
        return { label: "Connecting", tone: "primary", busy: true };
      case "reconnecting":
        return { label: "Reconnecting", tone: "warning", busy: true };
      case "waiting_bluetooth":
        return { label: "Waiting for Bluetooth", tone: "warning", busy: true };
      case "disconnecting":
        return { label: "Disconnecting", tone: "warning", busy: true };
      case "paused":
        return { label: "Paused", tone: "neutral", busy: false };
      case "error":
        return { label: "Connection problem", tone: "error", busy: false };
      default:
        return { label: "Disconnected", tone: "neutral", busy: false };
    }
  }
  return { label: "Disconnected", tone: "neutral", busy: false };
}

/** Human "last seen" text: relative for recent, absolute for old. */
export function describeLastSeen(lastSeenAt: string, nowMs = Date.now()): string {
  const then = Date.parse(lastSeenAt);
  if (!Number.isFinite(then)) return "Never seen";
  const diffMs = Math.max(0, nowMs - then);
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} d ago`;
  return new Date(then).toLocaleDateString();
}

/**
 * The device whose dashboard Home should show: the connected one, else the most
 * recently seen, else the first remembered.
 */
export function pickPrimaryDevice(
  devices: readonly RememberedDevice[],
  connectedAddress: string | null | undefined,
  sameAddress: (a: string, b: string) => boolean,
): RememberedDevice | undefined {
  if (connectedAddress) {
    const live = devices.find((device) => sameAddress(device.address, connectedAddress));
    if (live) return live;
  }
  return [...devices].sort(
    (a, b) => Date.parse(b.lastSeenAt) - Date.parse(a.lastSeenAt),
  )[0];
}

/** Feature check used to decide which stat tiles exist for a profile. */
export function hasFeature(featureIds: readonly string[], id: string): boolean {
  return featureIds.includes(id);
}
