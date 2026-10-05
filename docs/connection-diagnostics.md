# Diagnosing PineTime disconnects

Furu records a connection timeline per device. Its Logs view and Android logcat now record whether a disconnect came through the BLE plugin's peripheral callback or connection-state channel. A phone alert is posted for an unexpected link loss when Android notification permission is granted. The app keeps the device selected and its Android foreground service running while **Auto-reconnect** is enabled in device settings; consecutive attempts alternate direct connection and scanning. The default retry interval is five minutes and the default failure limit is unlimited.

For an overnight phone trace, connect the watch in Furu Dev, then run from a host with ADB access:

```bash
bash scripts/capture-android-ble.sh /tmp/furu-ble-overnight.log
```

The script filters logcat to Furu, the Android BLE stack, and WebView messages. Leave the terminal running and stop it with Ctrl-C. Note the approximate time of any watch-side change. The log can include device addresses and notification text, so review it before sharing. If using a development watch with ST-Link, capture Kongle's RTT output in another terminal at the same time:

```bash
nc localhost 6969 | defmt-print -e target/mcuboot/thumbv7em-none-eabihf/release/kongle > /tmp/kongle-rtt-overnight.log
```

RTT is unavailable on a closed daily watch. The small **B** in Kongle's top-right corner shows that the GATT link is active. After an unexpected loss, correlate Furu's alert and connection history with Android's GATT status and Kongle's `[gatt] disconnected` reason. A new `Kongle started` line in RTT around the same time indicates a watch reset. If the file picker stalls, compare the `DFU: opening Android ... picker`, `picker returned`, `read`, and `staged` timestamps in Furu's Logs view to find which step consumed the time.

Furu includes a local patch to `tauri-plugin-blec` 0.8.1 that logs the Android `BluetoothGattCallback` status under `FuruBleGatt` and closes the GATT client after a disconnect. The phone alert depends on Furu receiving the disconnect callback; Android may not deliver one after the app process is killed.
