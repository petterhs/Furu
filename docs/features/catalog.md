# BLE feature catalog

Master list of **feature definitions** (IDs, GATT, classification, Furu implementation status) plus a **firmware capability matrix** (✓ / —) for InfiniTime, Kongle, and Wasp-os. Rust (`FeatureId`) and TypeScript (`bleContract.ts`) mirror the feature IDs.

**Conventions**

- UUIDs are 128-bit unless noted as 16-bit shorthand (e.g. `0x180D`).
- **Profiles** in the app (`unknown`, `infinitime_placeholder`) are runtime selections for capability hints; **firmware columns** below describe real watch software (InfiniTime, Kongle, Wasp-os).
- Verify InfiniTime UUIDs against the [InfiniTime source tree](https://github.com/InfiniTimeOrg/InfiniTime) before relying on them in production.

## Profiles (app runtime)

These IDs match Rust/TS `ProfileId` for the companion app only—not the same as a firmware name.

| Profile ID | Purpose |
|------------|---------|
| `unknown` | Device not classified; no optional features assumed for gating. |
| `infinitime_placeholder` | Planned InfiniTime-oriented feature set; auto-detection not wired yet. |

## Feature definitions

| Feature ID | Classification | Primary service / characteristic | Protocol note | Furu status |
|------------|----------------|-----------------------------------|---------------|-------------|
| `dev.plugin_test_echo` | Firmware-specific (dev) | Service `A07498CA-AD5B-474E-940D-16F1FBE7E8CD`, char `51FF12BB-3ED8-46E5-B4F9-D64E2FEC021B` | String read/write for bring-up; a dedicated **furu test server** will replace this story later | WIP (Rust PoC only) |
| `ble.device_information` | Standard (SIG) | `0x180A` (Device Information) | Model, firmware revision, etc. | not started |
| `ble.current_time` | Standard (SIG) | `0x1805` (Current Time Service), `0x2A2B` (Current Time) | Time sync to the watch | not started |
| `ble.hr` | Standard (SIG) | `0x180D` (Heart Rate), `0x2A37` (Measurement) | HR notifications | not started |
| `ble.anss` | Standard (SIG) | `0x1811` (Alert Notification Service) | Forwarding notifications (profile-dependent) | not started |
| `ble.dis_steps` | Standard (SIG) | Depends on firmware exposure | Step count; exact characteristic varies | not started |
| `infinitime.dfu` | Vendor (InfiniTime) | Nordic DFU / InfiniTime OTA UUIDs in source | OTA firmware update state machine | not started |
| `infinitime.companion_uart` | Vendor (InfiniTime) | Nordic UART-style companion service (confirm in source) | Binary framing per InfiniTime | not started |
| `kongle.*` | Firmware-specific (Kongle) | TBD | TBD until Kongle publishes GATT documentation | not started |
| `wasp.*` | Firmware-specific (Wasp-os) | TBD | TBD per Wasp-os | not started |

**Furu status:** `not started` / `WIP` / `done` — implementation in this repository, independent of whether a firmware exposes the GATT surface.

## Firmware capability matrix

Which **firmware** is expected to support each **feature ID** when that stack is stable and documented. This is a planning matrix: update cells as you confirm behaviour in source or on hardware.

**Legend**

| Symbol | Meaning |
|--------|---------|
| ✓ | Supported or expected for that firmware (documented / typical). |
| — | Not applicable, unknown, or not targeted yet. |

| Feature ID | InfiniTime | Kongle | Wasp-os |
|------------|:----------:|:------:|:-------:|
| `dev.plugin_test_echo` | — | — | — |
| `ble.device_information` | ✓ | — | — |
| `ble.current_time` | ✓ | — | — |
| `ble.hr` | ✓ | — | — |
| `ble.anss` | ✓ | — | — |
| `ble.dis_steps` | ✓ | — | — |
| `infinitime.dfu` | ✓ | — | — |
| `infinitime.companion_uart` | ✓ | — | — |
| `kongle.*` | — | — | — |
| `wasp.*` | — | — | — |

InfiniTime column uses ✓ where the capability is in scope for a typical InfiniTime-on-PineTime setup (still verify UUIDs and versions). Kongle and Wasp-os stay — until you define concrete feature rows and GATT.

## Notes

- **InfiniTime** companion and DFU UUIDs change over time; treat the InfiniTime GitHub tree as authoritative and update this document when you pin versions.
- **`ble.dis_steps`**: Many watches expose activity via custom services; narrow this row when you pick a concrete endpoint per firmware.
- **PoC read/write:** The app may call `ble_poc_send_string` / `ble_poc_read_string` against the GATT pair listed for `dev.plugin_test_echo` whenever a suitable peer is connected; that does not imply any firmware column above until a **furu test server** (or another stack) is documented here.
