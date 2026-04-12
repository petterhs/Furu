//! GATT constants only—no protocol logic.

use uuid::{uuid, Uuid};

/// Ephemeral PoC service UUID (string echo); see `dev.plugin_test_echo` in `docs/features/catalog.md`.
pub const POC_STRING_ECHO_SERVICE_UUID: Uuid = uuid!("A07498CA-AD5B-474E-940D-16F1FBE7E8CD");

/// Ephemeral PoC characteristic UUID on [`POC_STRING_ECHO_SERVICE_UUID`].
pub const POC_STRING_ECHO_CHAR_UUID: Uuid = uuid!("51FF12BB-3ED8-46E5-B4F9-D64E2FEC021B");

/// Bluetooth SIG Current Time Service (`0x1805`).
pub const CURRENT_TIME_SERVICE_UUID: Uuid = uuid!("00001805-0000-1000-8000-00805F9B34FB");

/// Bluetooth SIG Current Time characteristic (`0x2A2B`).
pub const CURRENT_TIME_CHAR_UUID: Uuid = uuid!("00002A2B-0000-1000-8000-00805F9B34FB");

/// Bluetooth SIG Alert Notification Service (`0x1811`).
pub const ALERT_NOTIFICATION_SERVICE_UUID: Uuid = uuid!("00001811-0000-1000-8000-00805F9B34FB");

/// Bluetooth SIG **New Alert** characteristic (`0x2A46`).
pub const NEW_ALERT_CHAR_UUID: Uuid = uuid!("00002A46-0000-1000-8000-00805F9B34FB");
