//! Bluetooth SIG Device Information Service (`0x180A`) — best-effort string reads.

use serde::Serialize;
use uuid::Uuid;

use super::registry;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceInformation {
    pub manufacturer_name: Option<String>,
    pub model_number: Option<String>,
    pub serial_number: Option<String>,
    pub firmware_revision: Option<String>,
    pub hardware_revision: Option<String>,
    pub software_revision: Option<String>,
}

fn trim_utf8(bytes: Vec<u8>) -> Option<String> {
    let s = String::from_utf8_lossy(&bytes);
    let t = s.trim();
    if t.is_empty() {
        None
    } else {
        Some(t.to_string())
    }
}

/// Reads common DIS string characteristics; omits entries the peer does not expose or read fails for.
pub async fn read_device_information() -> Result<DeviceInformation, String> {
    let handler = tauri_plugin_blec::get_handler().map_err(|e| e.to_string())?;
    let svc = Some(registry::DEVICE_INFORMATION_SERVICE_UUID);

    async fn read_one(
        handler: &tauri_plugin_blec::Handler,
        characteristic: Uuid,
        svc: Option<Uuid>,
    ) -> Option<String> {
        let bytes = handler.recv_data(characteristic, svc).await.ok()?;
        trim_utf8(bytes)
    }

    let manufacturer_name = read_one(&handler, registry::DIS_MANUFACTURER_NAME_CHAR_UUID, svc).await;
    let model_number = read_one(&handler, registry::DIS_MODEL_NUMBER_CHAR_UUID, svc).await;
    let serial_number = read_one(&handler, registry::DIS_SERIAL_NUMBER_CHAR_UUID, svc).await;
    let firmware_revision = read_one(&handler, registry::DIS_FIRMWARE_REVISION_CHAR_UUID, svc).await;
    let hardware_revision = read_one(&handler, registry::DIS_HARDWARE_REVISION_CHAR_UUID, svc).await;
    let software_revision = read_one(&handler, registry::DIS_SOFTWARE_REVISION_CHAR_UUID, svc).await;

    Ok(DeviceInformation {
        manufacturer_name,
        model_number,
        serial_number,
        firmware_revision,
        hardware_revision,
        software_revision,
    })
}
