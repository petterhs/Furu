# BLE features

Furu tracks **BLE capabilities** as stable string IDs (`ble.battery`, `infinitime.dfu`, …). Those IDs are shared by the Rust `FeatureId` enum, [`src/lib/bleContract.ts`](../../src/lib/bleContract.ts), and the device profile editor.

**Source of truth:** [**Feature catalog (catalog.md)**](catalog.md) — names, IDs, implementation status, GATT details, and the firmware planning matrix.
