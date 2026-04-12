//! GATT constants only—no protocol logic.

use uuid::{uuid, Uuid};

/// Ephemeral PoC service UUID (string echo); see `dev.plugin_test_echo` in `docs/features/catalog.md`.
pub const POC_STRING_ECHO_SERVICE_UUID: Uuid = uuid!("A07498CA-AD5B-474E-940D-16F1FBE7E8CD");

/// Ephemeral PoC characteristic UUID on [`POC_STRING_ECHO_SERVICE_UUID`].
pub const POC_STRING_ECHO_CHAR_UUID: Uuid = uuid!("51FF12BB-3ED8-46E5-B4F9-D64E2FEC021B");
