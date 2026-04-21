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
