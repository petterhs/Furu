# BLE feature catalog

Stable **feature IDs**, human-readable **names**, **implementation status** in this repo, and **GATT-oriented** notes. Rust (`FeatureId`) and TypeScript ([`bleContract.ts`](../../src/lib/bleContract.ts)) mirror the IDs — do **not** rename published IDs; add new rows for new capabilities.

**UUIDs** are 128-bit unless noted as 16-bit shorthand (e.g. `0x180D`). InfiniTime-specific GATT is still “standard Bluetooth” at the wire level; the **Protocol / GATT** column says which services or vendor docs apply — there is no separate “vendor taxonomy” to learn.

## Status (this repository)

Implementation status is **only** about code in Furu, not whether your watch exposes a given service.

| Icon | Meaning |
|:----:|---------|
| ✅ | **Done** — implemented for intended scope; reasonable to use day to day |
| ⚠️ | **Partial** — works but incomplete, rough, or missing polish |
| ❌ | **Not implemented** — no usable code path yet |

## Profiles (app runtime)

In-app profile IDs (`unknown`, `infinitime`, `kongle`, …) choose which **catalog features** are enabled. They are **not** firmware names. Built-in profiles seed the catalog; users can duplicate into **custom** profiles (Settings → Device Profiles).

| Profile ID | Role |
|------------|------|
| `unknown` | No optional features assumed until you pick a profile. |
| `infinitime` | InfiniTime-oriented defaults (CTS, ANS, DIS, …); overridable per device. |
| `kongle` | Kongle-oriented; extra features appear here as GATT is documented. |

## Feature definitions

| Name | Feature ID | Status | Protocol / GATT | Notes |
|------|------------|:------:|-----------------|-------|
| Device Info | `ble.device_information` | ✅ | SIG Device Information `0x180A`; strings `0x2A24`–`0x2A29` | Reads via `ble_read_device_information`; device page table |
| Current Time | `ble.current_time` | ✅ | SIG Current Time `0x1805` / `0x2A2B` | Manual + optional interval sync; `ble_poc_send_current_time` |
| Battery | `ble.battery` | ✅ | SIG Battery `0x180F` / `0x2A19` | Connected read + UI polling |
| Heart Rate | `ble.hr` | ✅ | SIG Heart Rate `0x180D` / Measurement `0x2A37` | JS notify + SIG parser; stale / invalid hidden |
| Notifications | `ble.anss` | ✅ | SIG Alert Notification `0x1811` / New Alert `0x2A46` | Watch alerts + Android forward; `ble::ans` framing |
| Steps | `ble.dis_steps` | ✅ | [InfiniTime Motion Service](https://github.com/InfiniTimeOrg/InfiniTime/blob/main/doc/MotionService.md) `00030000-…`, step `00030001-…` | `uint32` LE; `ble_read_step_count` |
| DFU / OTA | `infinitime.dfu` | ❌ | Nordic/InfiniTime DFU UUIDs (see InfiniTime source) | Planned |
| Companion UART | `infinitime.companion_uart` | ❌ | InfiniTime Nordic UART–style service | Planned |
| Kongle (placeholder) | `kongle.*` | ❌ | TBD when Kongle publishes GATT | Reserved prefix |
| Wasp-os (placeholder) | `wasp.*` | ❌ | TBD per [Wasp-os](https://github.com/wasp-os/wasp-os) | Reserved prefix |

## Firmware capability matrix

Planning only: which **watch firmware** stacks are expected to support each **feature ID** once documented. Update when you verify hardware or source.

| Symbol | Meaning |
|:------:|---------|
| ✓ | Expected / documented for that firmware |
| — | Not targeted, unknown, or N/A |

| Name | Feature ID | InfiniTime | Kongle | Wasp-os |
|------|------------|:----------:|:------:|:-------:|
| Device Info | `ble.device_information` | ✓ | — | — |
| Current Time | `ble.current_time` | ✓ | ✓ | — |
| Battery | `ble.battery` | ✓ | — | — |
| Heart Rate | `ble.hr` | ✓ | — | — |
| Notifications | `ble.anss` | ✓ | — | — |
| Steps | `ble.dis_steps` | ✓ | — | — |
| DFU / OTA | `infinitime.dfu` | ✓ | — | — |
| Companion UART | `infinitime.companion_uart` | ✓ | — | — |
| Kongle (placeholder) | `kongle.*` | — | — | — |
| Wasp-os (placeholder) | `wasp.*` | — | — | — |

## Notes

- **Android notification forwarding** (global toggle, per-device toggle, `POST_NOTIFICATIONS`, notification listener): see app Settings → Permissions; feature ID `ble.anss`.
- **InfiniTime** UUIDs and behaviour: treat the [InfiniTime repo](https://github.com/InfiniTimeOrg/InfiniTime) as authoritative when pinning versions.
- **`ble.dis_steps` on other firmwares** would need different GATT targets or commands later; the ID stays stable.
