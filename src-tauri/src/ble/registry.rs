//! GATT constants only—no protocol logic.

use uuid::{uuid, Uuid};

/// Bluetooth SIG Current Time Service (`0x1805`).
pub const CURRENT_TIME_SERVICE_UUID: Uuid = uuid!("00001805-0000-1000-8000-00805F9B34FB");

/// Bluetooth SIG Current Time characteristic (`0x2A2B`).
pub const CURRENT_TIME_CHAR_UUID: Uuid = uuid!("00002A2B-0000-1000-8000-00805F9B34FB");

/// Bluetooth SIG Alert Notification Service (`0x1811`).
pub const ALERT_NOTIFICATION_SERVICE_UUID: Uuid = uuid!("00001811-0000-1000-8000-00805F9B34FB");

/// Bluetooth SIG **New Alert** characteristic (`0x2A46`).
pub const NEW_ALERT_CHAR_UUID: Uuid = uuid!("00002A46-0000-1000-8000-00805F9B34FB");

/// Bluetooth SIG Battery Service (`0x180F`).
pub const BATTERY_SERVICE_UUID: Uuid = uuid!("0000180F-0000-1000-8000-00805F9B34FB");

/// Bluetooth SIG Battery Level characteristic (`0x2A19`).
pub const BATTERY_LEVEL_CHAR_UUID: Uuid = uuid!("00002A19-0000-1000-8000-00805F9B34FB");

/// Kongle voltage/charging telemetry and paged battery history.
pub const KONGLE_BATTERY_SERVICE_UUID: Uuid = uuid!("6b6f0000-1886-4b40-ae7d-00a11ce50001");
pub const KONGLE_BATTERY_CURRENT_CHAR_UUID: Uuid = uuid!("6b6f0001-1886-4b40-ae7d-00a11ce50001");
pub const KONGLE_BATTERY_PAGE_CHAR_UUID: Uuid = uuid!("6b6f0002-1886-4b40-ae7d-00a11ce50001");
pub const KONGLE_BATTERY_CURSOR_CHAR_UUID: Uuid = uuid!("6b6f0003-1886-4b40-ae7d-00a11ce50001");
pub const KONGLE_BATTERY_EPOCH_CHAR_UUID: Uuid = uuid!("6b6f0004-1886-4b40-ae7d-00a11ce50001");

/// Bluetooth SIG Device Information Service (`0x180A`).
pub const DEVICE_INFORMATION_SERVICE_UUID: Uuid = uuid!("0000180A-0000-1000-8000-00805F9B34FB");

/// SIG Device Information — Model Number String (`0x2A24`).
pub const DIS_MODEL_NUMBER_CHAR_UUID: Uuid = uuid!("00002A24-0000-1000-8000-00805F9B34FB");
/// Serial Number String (`0x2A25`).
pub const DIS_SERIAL_NUMBER_CHAR_UUID: Uuid = uuid!("00002A25-0000-1000-8000-00805F9B34FB");
/// Firmware Revision String (`0x2A26`) — InfiniTime exposes version here (see InfiniTime `doc/ble.md`).
pub const DIS_FIRMWARE_REVISION_CHAR_UUID: Uuid = uuid!("00002A26-0000-1000-8000-00805F9B34FB");
/// Hardware Revision String (`0x2A27`).
pub const DIS_HARDWARE_REVISION_CHAR_UUID: Uuid = uuid!("00002A27-0000-1000-8000-00805F9B34FB");
/// Software Revision String (`0x2A28`).
pub const DIS_SOFTWARE_REVISION_CHAR_UUID: Uuid = uuid!("00002A28-0000-1000-8000-00805F9B34FB");
/// Manufacturer Name String (`0x2A29`).
pub const DIS_MANUFACTURER_NAME_CHAR_UUID: Uuid = uuid!("00002A29-0000-1000-8000-00805F9B34FB");

/// InfiniTime Motion Service (`0003` in [InfiniTime custom UUID scheme](https://github.com/InfiniTimeOrg/InfiniTime/blob/main/doc/ble.md)).
pub const INFINITIME_MOTION_SERVICE_UUID: Uuid = uuid!("00030000-78fc-48fe-8e23-433b3a1942d0");

/// Step count characteristic on InfiniTime Motion Service (`uint32_t` little-endian). See `doc/MotionService.md` in InfiniTime.
pub const INFINITIME_MOTION_STEP_COUNT_CHAR_UUID: Uuid =
    uuid!("00030001-78fc-48fe-8e23-433b3a1942d0");

/// Nordic legacy DFU service (legacy UUID from Nordic SDK / InfiniTime `doc/ble.md`).
pub const NORDIC_DFU_SERVICE_UUID: Uuid = uuid!("00001530-1212-efde-1523-785feabcd123");
/// DFU Control Point (`0x1531`).
pub const NORDIC_DFU_CONTROL_POINT_CHAR_UUID: Uuid = uuid!("00001531-1212-efde-1523-785feabcd123");
/// DFU Packet (`0x1532`).
pub const NORDIC_DFU_PACKET_CHAR_UUID: Uuid = uuid!("00001532-1212-efde-1523-785feabcd123");

/// InfiniTime-compatible music service and event notifications.
#[cfg(target_os = "android")]
pub const MEDIA_SERVICE_UUID: Uuid = uuid!("00000000-78fc-48fe-8e23-433b3a1942d0");
#[cfg(target_os = "android")]
pub const MEDIA_EVENT_UUID: Uuid = uuid!("00000001-78fc-48fe-8e23-433b3a1942d0");
#[cfg(any(target_os = "android", test))]
pub const MEDIA_STATUS_UUID: Uuid = uuid!("00000002-78fc-48fe-8e23-433b3a1942d0");
#[cfg(any(target_os = "android", test))]
pub const MEDIA_ARTIST_UUID: Uuid = uuid!("00000003-78fc-48fe-8e23-433b3a1942d0");
#[cfg(any(target_os = "android", test))]
pub const MEDIA_TITLE_UUID: Uuid = uuid!("00000004-78fc-48fe-8e23-433b3a1942d0");
#[cfg(any(target_os = "android", test))]
pub const MEDIA_ALBUM_UUID: Uuid = uuid!("00000005-78fc-48fe-8e23-433b3a1942d0");
