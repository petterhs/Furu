# Android media control

Furu owns the InfiniTime music BLE service in native Rust (`ble/media.rs`). The
notification-forwarder Android plugin bridges to MediaSessionManager and the
active MediaController. No foreground route or WebView timer is required.

Enable Android **notification access** for Furu/Furu Dev in Settings. It grants
access to media sessions too; global notification forwarding can stay off.
The built-in InfiniTime/Kongle profiles gain `ble.media_control`. Custom profiles
must explicitly include that feature. Older Kongle versions without the service
are ignored with a diagnostic subscription error and bounded retry delay.

The worker subscribes to `00000001-78fc-48fe-8e23-433b3a1942d0` on service
`00000000-78fc-48fe-8e23-433b3a1942d0`. Play/pause events are `0x00`/`0x01`,
next/previous are `0x03`/`0x04`, and `0xe0` requests an immediate state refresh.
Title/artist/album use the matching InfiniTime fields, bounded to 40 UTF-8 bytes.
Only changed metadata is sent; no continuous playback-position stream is used.

Previous/next dispatch Android standard media keys. Spotify may change tracks;
Absorb/other audiobook players decide whether to skip seconds, chapters or
another item. Furu does not hardcode app-specific ten-second seeking.

Commands are bounded, expire after three seconds, and are tied to the watch
connection generation/address and Android player session. Reconnect, a player
switch or a DFU pause must not replay old actions. Android revalidates the
selected token before dispatch. Metadata sampling currently checks the active
session every two seconds while connected/enabled, with a quick refresh after a
command; callbacks can replace that sampling in a later optimization.

## Hardware validation

- Start Spotify/Absorb, connect, and open Media from the clock (left swipe or
  double button press). Check title and play/pause icon.
- Test previous/next and play/pause with phone locked and Furu in background.
- Close/switch players, revoke access, disconnect/reconnect and start an OTA.
  Check for unavailable state and no stale command delivery.
- Older Android GATT caches may need Device → Repair connection after flashing
  new watch services through ST-Link; OTA cleanup handles its own cache refresh.
- Kotlin/Android and ARM Rust builds are automated checks, not proof of actual
  app playback behavior. Absorb playback behavior still needs the maintainer's hardware test.

Sources: [Android MediaSessionManager](https://developer.android.com/reference/android/media/session/MediaSessionManager),
[InfiniTime BLE protocol](https://github.com/InfiniTimeOrg/InfiniTime/blob/main/doc/ble.md#music-control).
