use tauri_plugin_blec::models::WriteType;

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
