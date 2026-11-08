# Native connection ownership

`src-tauri/src/ble/connection.rs` owns the selected connection intent, connect
workers, retries, disconnect cleanup, firmware-update pause and foreground-service
state. JavaScript submits commands and observes `ble-native-connection` snapshots;
there is no second JavaScript reconnect timer.

## Normal operation

A manual Connect first checks permissions and waits for Android's Bluetooth enable
dialog to finish. The system dialog has no connection timeout. Only after a
positive result does Furu ask the native owner to scan/connect. Background retries
never open a permission dialog or ask to enable Bluetooth. They wait for Bluetooth
to become available without consuming the failure budget; missing permissions
stop retries until the user grants them and connects again.

Unexpected link loss schedules a native retry after five seconds. Subsequent
failures use the configured retry interval with exponential backoff capped at
five minutes (or the configured interval when it is longer). Retries alternate
direct MAC and scan-by-MAC; zero maximum failures means unlimited. A fresh GAP
Device Name read after discovery allows firmware/profile detection even when the
connection used only the saved MAC. Custom name rules and manual profile overrides
are mirrored to Rust and are respected while the WebView is suspended.

Only one connect/cleanup worker runs at a time. Cancellation invalidates its
generation and tells the BLE handler not to retry. An old result cannot publish a
connection or restart retries; the owner finishes cleanup before starting another
worker. GATT connect/operation deadlines, session-specific retirement, retained
Android owners and stale-callback rejection remain in the local BLE plugin.
Cancelling an in-flight native operation is cooperative and can take its remaining
operation timeout; the UI does not claim an abandoned attempt is connected.

## OTA and service cache

Native DFU reserves the link before subscribing/writing, suppressing other connects
and notification forwarding. A drop guard ends the pause on success, error or
cancellation. Successful activation gets a reboot grace period before cleanup;
then auto-reconnect, when enabled, begins with a scan. Activation requested is not
proof of installation and never confirms an MCUBoot trial.

The OTA cache invalidation and Repair connection from
[Android service cache](android-service-cache.md) now run under this same owner.
Native reconnect rebuilds characteristics and reapplies the selected capabilities.
Frontend feature consumers resubscribe when the connection snapshot becomes ready.

## Persistence and Android lifecycle

`connection-manager.json` in app data stores policies, reconnect intent and up to
512 timestamped connection transitions. Writes replace a temporary file. On process
launch, Furu resumes intent only for a remembered device with auto-reconnect
enabled. Manual Disconnect clears intent, Forget removes the target, and disabling
auto-reconnect cancels scheduled background attempts. Retry limits reset on a new
process launch or explicit Connect.

The connected-device foreground service and disconnect notifications are driven
from Rust. WebView suspension therefore does not stop the retry scheduler, capability
gates or disconnect notifications. A native session ID forces metadata/subscription refresh even if the WebView
missed the intermediate disconnect event. Native event replay fills the timeline with
original timestamps when the UI resumes; event IDs prevent duplicate imports.
Global/per-device notification settings and blocked packages are persisted alongside
the native policies so reconnect cannot enable forwarding that the user disabled.

This is not a promise of unattended resurrection after Android kills/force-stops
the whole app. Saved intent resumes when the app process is launched normally.
The existing service alone cannot initialize Tauri's activity-bound BLE plugin
in a newly created process; it stops on a null restart intent. Automatic presence
wake-up/process restoration would require a separate CompanionDeviceService or
similar Android lifecycle design. Doze may also delay execution. No permanent
wake lock is added.

References: [Android background BLE](https://developer.android.com/develop/connectivity/bluetooth/ble/background),
[Bluetooth enable dialog](https://developer.android.com/reference/android/bluetooth/BluetoothAdapter#ACTION_REQUEST_ENABLE).

## Required hardware checks

1. Start with Bluetooth off. Tap Connect, wait in the dialog, accept, and verify
   connection continues without another tap. Repeat and cancel the dialog.
2. With auto-reconnect enabled, take the watch out of range and back. Repeat with
   the phone locked/app backgrounded and Bluetooth off/on. Check foreground and
   disconnect notifications and the 3H timeline against native/logcat timestamps.
3. Tap Disconnect/Cancel during a retry, and switch to another watch. A late result
   must not revive the old connection. Test Forget and disabling auto-reconnect.
4. OTA InfiniTime → Kongle at the same MAC. Verify automatic cache refresh,
   reconnection, new firmware identity, profile suggestion and restored features
   without Forget. Repeat error/cancel paths and a trial rollback. Do not equate
   a successful transfer with installation or firmware confirmation.
5. Restart Furu and verify saved intent resumes; explicitly disconnect, restart,
   and verify it stays disconnected. Android force-stop requires reopening Furu.
6. For an overnight run, record phone/OS, Furu/Kongle commits, native logcat and
   available watch RTT. Firmware changes and radio-range changes affect the result.

Host tests cover retry policy/backoff/generations, profile matching, persistence
restoration, DFU guard cleanup and idempotent timestamped history import. Real radio,
Android dialog and background lifecycle checks remain hardware work.
