#!/usr/bin/env bash
set -euo pipefail

# Keep the dev WebView and Vite HMR on USB. Hostnames may resolve to a stale
# Tailscale address on Android even while the computer's LAN is reachable.
adb reverse tcp:1420 tcp:1420
adb reverse tcp:1421 tcp:1421

echo "Furu Dev: forwarding phone localhost:1420 and :1421 to this computer over USB"
TAURI_DEV_HOST=127.0.0.1 pnpm tauri android dev --config src-tauri/tauri.usb.conf.json
