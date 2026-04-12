use tauri_plugin_blec::models::WriteType;

use super::ans;
use super::cts;
use super::profiles;
use super::registry;
use super::session;

#[tauri::command]
pub fn ble_list_profiles() -> Vec<profiles::ProfileInfo> {
    profiles::profile_infos()
}

#[tauri::command]
pub fn ble_get_active_profile() -> Result<String, String> {
    let session = session::global().lock().map_err(|e| e.to_string())?;
    Ok(session.active_profile.as_str().to_string())
}

#[tauri::command]
pub fn ble_set_active_profile(profile_id: String) -> Result<(), String> {
    let id = profiles::ProfileId::parse(&profile_id)?;
    let mut session = session::global().lock().map_err(|e| e.to_string())?;
    session.active_profile = id;
    Ok(())
}

#[tauri::command]
pub fn ble_list_features_for_active_profile() -> Result<Vec<String>, String> {
    let profile = session::global()
        .lock()
        .map_err(|e| e.to_string())?
        .active_profile;
    Ok(profiles::features_for_profile(profile)
        .iter()
        .map(|f| f.as_str().to_string())
        .collect())
}

/// Ephemeral PoC: read/write string on [`registry::POC_STRING_ECHO_*`] when a peer is connected (same connection as the JS BLE plugin).
#[tauri::command]
pub async fn ble_poc_send_string(payload: String) -> Result<(), String> {
    let handler = tauri_plugin_blec::get_handler().map_err(|e| e.to_string())?;
    handler
        .send_data(
            registry::POC_STRING_ECHO_CHAR_UUID,
            Some(registry::POC_STRING_ECHO_SERVICE_UUID),
            payload.as_bytes(),
            WriteType::WithResponse,
        )
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn ble_poc_read_string() -> Result<String, String> {
    let handler = tauri_plugin_blec::get_handler().map_err(|e| e.to_string())?;
    let bytes = handler
        .recv_data(
            registry::POC_STRING_ECHO_CHAR_UUID,
            Some(registry::POC_STRING_ECHO_SERVICE_UUID),
        )
        .await
        .map_err(|e| e.to_string())?;
    String::from_utf8(bytes).map_err(|e| e.to_string())
}

/// Writes **local** time to the SIG Current Time characteristic (`0x2A2B` on `0x1805`).
/// The peer must implement CTS and allow writes; many watches only accept this from a bonded companion.
#[tauri::command]
pub async fn ble_poc_send_current_time() -> Result<(), String> {
    let pdu = cts::encode_current_time_local();
    let handler = tauri_plugin_blec::get_handler().map_err(|e| e.to_string())?;
    handler
        .send_data(
            registry::CURRENT_TIME_CHAR_UUID,
            Some(registry::CURRENT_TIME_SERVICE_UUID),
            &pdu,
            WriteType::WithResponse,
        )
        .await
        .map_err(|e| e.to_string())
}

/// **New Alert** (`0x2A46` on `0x1811`): InfiniTime-style `title\0message` after a 3-byte header (see `ble::ans`).
#[tauri::command]
pub async fn ble_poc_send_notification(
    title: String,
    message: String,
    category: Option<u8>,
) -> Result<(), String> {
    let cat = category.unwrap_or(ans::CATEGORY_SIMPLE_ALERT);
    let pdu = ans::encode_new_alert_infinitime(&title, &message, cat)?;
    let handler = tauri_plugin_blec::get_handler().map_err(|e| e.to_string())?;
    handler
        .send_data(
            registry::NEW_ALERT_CHAR_UUID,
            Some(registry::ALERT_NOTIFICATION_SERVICE_UUID),
            &pdu,
            WriteType::WithResponse,
        )
        .await
        .map_err(|e| e.to_string())
}
