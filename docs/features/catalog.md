# BLE feature catalog

Master list of **feature definitions** (IDs, GATT, classification, Furu implementation status) plus a **firmware capability matrix** (✓ / —) for InfiniTime, Kongle, and Wasp-os. Rust (`FeatureId`) and TypeScript (`bleContract.ts`) mirror the feature IDs.

**Conventions**

- UUIDs are 128-bit unless noted as 16-bit shorthand (e.g. `0x180D`).
- **Profiles** in the app (`unknown`, `infinitime`, `kongle`) are runtime selections for capability hints; **firmware columns** below describe real watch software (InfiniTime, Kongle, Wasp-os).
- Verify InfiniTime UUIDs against the [InfiniTime source tree](https://github.com/InfiniTimeOrg/InfiniTime) before relying on them in production.

## Profiles (app runtime)

These IDs match Rust/TS `ProfileId` for the companion app only—not the same as a firmware name.

| Profile ID | Purpose |
|------------|---------|
| `unknown` | Device not classified; no optional features assumed for gating. |
| `infinitime` | InfiniTime-oriented GATT features (CTS, ANS, DFU, …); selectable manually or via name rules. |
| `kongle` | Kongle-oriented profile; currently only `ble.current_time` (CTS) is enabled in-app. |

In the Furu app, built-in rows above correspond to **default** device profiles; users can duplicate feature sets into **custom** profiles and adjust which catalog features are enabled per profile (see Settings → Device Profiles) without changing these stable profile **IDs**.

## Feature definitions

| Feature ID | Classification | Primary service / characteristic | Protocol note | Furu status |
|------------|----------------|-----------------------------------|---------------|-------------|
| `ble.device_information` | Standard (SIG) | `0x180A` (Device Information) | Model, firmware revision, etc. | not started |
| `ble.current_time` | Standard (SIG) | `0x1805` (Current Time Service), `0x2A2B` (Current Time) | Time sync to the watch | WIP (manual + optional periodic sync from UI; `ble_poc_send_current_time`) |
| `ble.battery` | Standard (SIG) | `0x180F` (Battery Service), `0x2A19` (Battery Level) | Battery percentage (0-100) | WIP (connected-only read + periodic polling from UI) |
| `ble.hr` | Standard (SIG) | `0x180D` (Heart Rate), `0x2A37` (Measurement) | **Notify** on `0x2A37` (Heart Rate Measurement); optional read for first value | done (JS `subscribe` + SIG parser; invalid/off readings hidden; stale value cleared after ~120s without a valid sample) |
| `ble.anss` | Standard (SIG) | `0x1811` / **New Alert** `0x2A46` | InfiniTime: `title\0message` after 3-byte ANS header (see `ble::ans`) | done (manual send + Android system-notification forwarding with app/device gates and permissions page) |
| `ble.dis_steps` | Vendor path (InfiniTime) | InfiniTime Motion Service `00030000-78fc-48fe-8e23-433b3a1942d0`, step count `00030001-78fc-48fe-8e23-433b3a1942d0` ([MotionService.md](https://github.com/InfiniTimeOrg/InfiniTime/blob/main/doc/MotionService.md)) | `uint32` little-endian; read + notify in firmware | done |
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
| `ble.device_information` | ✓ | — | — |
| `ble.current_time` | ✓ | ✓ | — |
| `ble.battery` | ✓ | — | — |
| `ble.hr` | ✓ | — | — |
| `ble.anss` | ✓ | — | — |
| `ble.dis_steps` | ✓ | — | — |
| `infinitime.dfu` | ✓ | — | — |
| `infinitime.companion_uart` | ✓ | — | — |
| `kongle.*` | — | — | — |
| `wasp.*` | — | — | — |

InfiniTime column uses ✓ where the capability is in scope for a typical InfiniTime-on-PineTime setup (still verify UUIDs and versions). Kongle `ble.current_time` is marked ✓ for the in-app `kongle` profile CTS path; other Kongle rows stay — until concrete GATT is pinned. Wasp-os stays — until you define concrete feature rows and GATT.

## Notes

- **InfiniTime** companion and DFU UUIDs change over time; treat the InfiniTime GitHub tree as authoritative and update this document when you pin versions.
- **`ble.dis_steps`**: Furu reads InfiniTime’s Motion Service step characteristic (since InfiniTime 1.7). Other firmwares would need separate GATT targets or profile-specific commands later.
- **`ble.hr`**: Uses **notifications** on Heart Rate Measurement (`0x2A37`), not periodic polling—this matches how the SIG service is meant to be used and avoids useless reads while the watch HR app is off. Payloads are decoded per the GATT Heart Rate Measurement format; values outside a plausible BPM band are ignored; when the device reports “sensor contact” and the wearer is not in contact, the UI hides HR until contact returns. If there is no valid sample for ~120 seconds, the displayed value is cleared so a stale number is not shown.
