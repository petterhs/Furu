# Android reconnect and disconnect cleanup

Connecting to a known stable MAC does not require a BLE name. Android can create
a remote device for the address directly. Firmware/profile detection is separate:
it needs fresh device metadata, while a direct reconnect can use the saved name.
When scanning, prefer the current advertisement name over Android's cached name.

The first unexpected-disconnect retry starts after five seconds. Later failures
alternate direct-MAC and scan-by-MAC attempts at the configured retry interval.
Cancelling or starting another cycle invalidates an in-flight attempt so its late
result cannot restart an old cycle. Busy work does not consume the failure limit.
Background attempts check permissions without opening a permission dialog.

The Android bridge keeps one Peripheral/GATT owner per known address across scan
results and scan restarts. It no longer needs a scan cache entry to connect.
Disconnect rejects outstanding read, write, descriptor, MTU and discovery calls
before emitting its event. Native connect attempts expire after five seconds;
GATT operations expire after ten seconds and retire the GATT client, so a missing
callback cannot permanently retain the Rust session lock. Old-client callbacks
are ignored. Android operation-start failures are rejected immediately.
Rust IPC waits allow fifteen seconds, outside the native ten-second deadline.
Connect and MTU each use this budget; Android has no shorter wrapper around
the combined operation. The frontend's final guard is 150 seconds, outside
three attempts plus discovery and cleanup; ordinary out-of-range connect
failures still expire at the native five-second deadline. Rust timeouts retire
their exact native session using a monotonic attempt ID. Late retirement cannot
close a newer client or resurrect an abandoned queued connect. Service snapshots
tolerate disconnection, and Android 26–32 reads/notifications use the same
completion path as newer Android callbacks. Permission checks without prompting
return before opening either a permission dialog or Settings.

The Rust handler acquires state/device locks in a consistent order, clears old
characteristic handles before discovery, and invokes disconnect callbacks after
releasing session locks. Mobile event delivery does not block on a full bounded
channel while cleanup is awaiting GATT completion.

After a firmware change, Android service-cache repair and OTA invalidation are
documented in [Android service cache](android-service-cache.md).

This still uses JS timers and the Android foreground keepalive service. Timing
while the WebView is suspended is not guaranteed. Reconnect after a process kill
and changing to a different firmware MAC are not implemented here. A future
native-owned reconnect loop must address those separately.

Hardware checks still required:

1. With auto-reconnect enabled, take a connected watch out of range, bring it
   back, and verify a retry connects without forgetting/re-adding it. Allow the
   configured interval after a failed first attempt.
2. Repeat with the phone locked/app backgrounded and Bluetooth off/on. Capture
   `scripts/capture-android-ble.sh` logs to check timer and GATT timeout behavior.
3. Break the link during a read or notification subscription. Confirm the UI
   shows disconnected and another connect works; `FuruBleGatt` logs the reason.
4. Scan while connected and verify time/battery reads continue working.
5. Cancel a reconnect cycle/manual disconnect and check it stays disconnected.
6. Test an OTA reboot and check that Furu no longer hangs on pending native IPC.
   Activation success must still be checked against the firmware after reconnect.

Use range loss/Bluetooth toggling for reconnect tests on trial firmware: resetting
an unconfirmed trial may boot another firmware with a different MAC address.
