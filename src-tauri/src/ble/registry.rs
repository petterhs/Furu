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

/// InfiniTime Motion Service (`0003` in [InfiniTime custom UUID scheme](https://github.com/InfiniTimeOrg/InfiniTime/blob/main/doc/ble.md)).
pub const INFINITIME_MOTION_SERVICE_UUID: Uuid = uuid!("00030000-78fc-48fe-8e23-433b3a1942d0");

/// Step count characteristic on InfiniTime Motion Service (`uint32_t` little-endian). See `doc/MotionService.md` in InfiniTime.
pub const INFINITIME_MOTION_STEP_COUNT_CHAR_UUID: Uuid =
    uuid!("00030001-78fc-48fe-8e23-433b3a1942d0");
