# BLE feature registry

This folder documents every **product-facing BLE capability** Furu may implement: stable **feature IDs**, GATT identifiers, classification, and—separately—which **firmware stacks** (InfiniTime, Kongle, Wasp-os, …) are expected to support each feature. See the **firmware capability matrix** in [catalog.md](catalog.md).

## Taxonomy

| Classification | Meaning |
|----------------|---------|
| **Standard (SIG)** | Adopted Bluetooth SIG services/characteristics (16-bit or assigned 128-bit UUIDs). Behaviour is defined by the Bluetooth Core Specification and supplement documents. |
| **Vendor (InfiniTime)** | Surfaces documented or implemented by [InfiniTime](https://github.com/InfiniTimeOrg/InfiniTime) for companion apps and watch integration. UUIDs and framing may be InfiniTime-specific even if they wrap standard concepts. |
| **Firmware-specific** | Reserved for firmwares that are not InfiniTime—e.g. [Kongle](https://github.com/petterhs/Kongle), [Wasp-os](https://github.com/wasp-os/wasp-os). IDs and GATT layout are defined by that project; Furu tracks them per profile. |

**App profiles** (`unknown`, `infinitime`, …) are **not** the same as hardware or firmware names. They are runtime hints inside Furu (e.g. which commands the UI exposes). The **firmware capability matrix** in the catalog ties feature IDs to InfiniTime / Kongle / Wasp-os support using ✓ / — markers.

## Feature IDs

Feature IDs are stable strings (e.g. `ble.hr`, `infinitime.dfu`). Use them in:

- [catalog.md](catalog.md) (human-readable source of truth)
- Rust (`FeatureId` in `src-tauri/src/ble/`)
- TypeScript ([`src/lib/bleContract.ts`](../../src/lib/bleContract.ts)) for UI and IPC

Do **not** rename IDs once published; add new IDs for new capabilities.

## Implementation status

In the catalog, **Status** uses:

| Status | Meaning |
|--------|---------|
| **not started** | No code path; documentation only. |
| **WIP** | Partially implemented or unstable. |
| **done** | Implemented for at least one profile; behaviour considered stable enough for daily use. |

## Notification forwarding model (Android)

Notification forwarding to the watch uses the `ble.anss` feature path and is gated by:

- a **global app setting** (`notificationForwardingEnabled`, default on)
- a **per-device setting** (`notificationsEnabled`, default on)
- active BLE session/profile support for `ble.anss`
- Android permissions (`POST_NOTIFICATIONS` + Notification Listener access)

At launch, Furu checks prompt-able permissions and requests them when needed. The app also provides **Settings -> Permissions** to inspect status, request prompt-able permissions again, and jump to Android's Notification Access settings for listener access.

## References

- [Bluetooth SIG specifications](https://www.bluetooth.com/specifications/specs/) (GATT services and characteristics).
- [InfiniTime repository](https://github.com/InfiniTimeOrg/InfiniTime) — source and docs for vendor behaviour.
- [Master feature catalog](catalog.md).
