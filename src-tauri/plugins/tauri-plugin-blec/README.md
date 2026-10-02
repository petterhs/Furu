# Local tauri-plugin-blec 0.8.1 patch

This is the Rust and Android source from [tauri-plugin-blec 0.8.1](https://github.com/MnlPhlp/tauri-plugin-blec), copied from Cargo's registry cache. It retains the upstream dual MIT/Apache-2.0 licenses. Furu uses this local path to log `BluetoothGattCallback` status, close old GATT clients and ignore their late callbacks, bound and reconcile Rust connection waits, and keep its BLE event stream alive after a transient handler error. Keep changes to this copy small and compare them against a future upstream release before upgrading.
