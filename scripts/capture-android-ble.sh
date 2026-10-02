#!/usr/bin/env bash
set -euo pipefail

# Capture timestamps and BLE/app diagnostics without dumping unrelated phone logs.
# Keep this running while the watch is connected; Ctrl-C stops the capture.
out_file="${1:-/tmp/furu-ble-$(date +%Y%m%d-%H%M%S).log}"
printf 'Writing BLE diagnostics to %s\n' "$out_file"
adb logcat -v threadtime \
  -s 'FuruBle:V' 'FuruBleGatt:V' 'BluetoothGatt:V' 'BtGatt.GattService:V' \
  'bt_stack:V' 'RustStdoutStderr:V' 'chromium:I' '*:S' \
  | tee "$out_file"
