# Android service cache after a firmware change

InfiniTime and Kongle share the physical watch's MAC but have different GATT
tables. Android can return a cached table even after disconnect, Bluetooth
off/on and app restart. Symptoms include InfiniTime-only services such as heart
rate on Kongle, and ATT status 10 (Attribute Not Found) on reads/writes.

Furu's device Actions offers **Repair connection** on Android. It marks the
address's cache stale, retires the exact native session, rejects pending IPC,
reconciles the Rust session, and reconnects with a scan so firmware/profile
observation uses the current advertised name. Saved names, preferences and
history are retained. Repair cannot run alongside native DFU.

On the next discovery Android calls the hidden `BluetoothGatt.refresh()` method,
waits 600 ms and discovers services again. Failure is surfaced explicitly and
keeps the pending refresh; the app must not claim cached handles were refreshed
if Android rejects or hides the API. Ordinary reconnects do not force refresh.
The implementation logs the refresh result and discovered UUIDs/instance IDs.

Before native DFU starts, the refresh requirement is persisted per address in
Android preferences, without disconnecting the live transfer session. The next
connection refreshes once, even if the app was restarted during OTA. Failed DFU
also leaves this conservative refresh pending. A newer invalidation is not
cleared by an older discovery result. These preferences are separate for Furu
and Furu Dev.

Android's `onServiceChanged` callback invalidates the current session instead of
allowing reads/subscriptions to continue with old handles. Native cleanup rejects
pending operations before notifying Rust. Reconnect rebuilds the Rust and Kotlin
characteristic lists and the subscriptions. Kongle does not yet send the Service
Changed indication; Furu's OTA marker and repair action cover that case, including
an update performed by another companion app via explicit repair.

## Hardware verification

1. On the affected watch, use Repair connection, then read device information,
   send current time and send a notification. Capture `FuruBleGatt` logs: refresh
   accepted, fresh Kongle UUIDs (no stale InfiniTime-only heart-rate service), and
   successful operations. This remains required even if an APK builds.
2. OTA InfiniTime → Kongle from Furu using the same saved device. After reconnect,
   verify refresh happens once and profile detection sees the current name.
3. Force-stop Furu between OTA and reconnect. Pending refresh must survive.
4. Reconnect normally a second time: no forced refresh is needed.
5. Repeat after rollback and with a manual profile override; preserve the user's
   profile decision and local history. The selected profile can differ from the
   discovered firmware; repair must not silently overwrite a manual override.
6. Trigger a discovery failure/range loss during repair. It must settle with an
   error and permit another attempt. Attempting repair during DFU must be refused.

References:

- [Android Service Changed callback](https://developer.android.com/reference/android/bluetooth/BluetoothGattCallback#onServiceChanged(android.bluetooth.BluetoothGatt))
- [Nordic BLE library cache refresh API and limitations](https://github.com/NordicSemiconductor/Android-BLE-Library/blob/main/ble/src/main/java/no/nordicsemi/android/ble/BleManager.java)

The 600 ms settling period is an implementation delay, not proof of completion:
Android exposes no refresh completion callback. Validate behavior on actual phones.
