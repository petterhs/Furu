use serde::Deserialize;
use tauri::AppHandle;
use tauri_plugin_blec::models::WriteType;

use super::ans;
use super::cts;
use super::dis;
use super::feature_id::FeatureId;
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
    Ok(session.active_profile_id.clone())
}

/// Sets built-in profile only and derives features from static [`profiles::features_for_profile`].
#[tauri::command]
pub fn ble_set_active_profile(profile_id: String) -> Result<(), String> {
    let id = profiles::ProfileId::parse(&profile_id)?;
    let feature_strings: Vec<String> = profiles::features_for_profile(id)
        .iter()
        .map(|f| f.as_str().to_string())
        .collect();
    let mut session = session::global().lock().map_err(|e| e.to_string())?;
    session.active_profile_id = id.as_str().to_string();
    session.active_feature_ids = feature_strings;
    Ok(())
}

/// Sets arbitrary profile id (including custom ids) with a validated feature ID list.
#[tauri::command]
pub fn ble_set_active_capabilities(profile_id: String, feature_ids: Vec<String>) -> Result<(), String> {
    let mut validated = Vec::with_capacity(feature_ids.len());
    for s in feature_ids {
        let _ = FeatureId::parse(&s)?;
        validated.push(s);
    }
    let mut session = session::global().lock().map_err(|e| e.to_string())?;
    session.active_profile_id = profile_id;
    session.active_feature_ids = validated;
    Ok(())
}

#[tauri::command]
pub fn ble_list_features_for_active_profile() -> Result<Vec<String>, String> {
    let session = session::global().lock().map_err(|e| e.to_string())?;
    Ok(session.active_feature_ids.clone())
}

#[tauri::command]
pub fn ble_set_notification_forwarding_enabled(enabled: bool) -> Result<(), String> {
    let mut s = session::global().lock().map_err(|e| e.to_string())?;
    s.notification_forwarding_enabled = enabled;
    Ok(())
}

#[tauri::command]
pub fn ble_set_active_device_notifications_enabled(enabled: bool) -> Result<(), String> {
    let mut s = session::global().lock().map_err(|e| e.to_string())?;
    s.active_device_notifications_enabled = enabled;
    Ok(())
}

#[tauri::command]
pub fn ble_set_connection_state(connected: bool) -> Result<(), String> {
    let mut s = session::global().lock().map_err(|e| e.to_string())?;
    s.connection_active = connected;
    Ok(())
}

/// See [`super::notification_forwarding::absorb_notification_backlog_watermark`].
#[tauri::command]
pub async fn ble_absorb_notification_backlog_watermark(app: tauri::AppHandle) -> Result<(), String> {
    super::notification_forwarding::absorb_notification_backlog_watermark(app).await
}

#[tauri::command]
pub fn ble_set_blocked_notification_packages(packages: Vec<String>) -> Result<(), String> {
    let mut seen = std::collections::HashSet::new();
    let mut normalized: Vec<String> = Vec::new();
    for raw in packages {
        let package_name = raw.trim().to_string();
        if package_name.is_empty() {
            continue;
        }
        if seen.insert(package_name.clone()) {
            normalized.push(package_name);
        }
    }
    normalized.sort();
    let mut s = session::global().lock().map_err(|e| e.to_string())?;
    s.blocked_notification_packages = normalized;
    Ok(())
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

/// Reads step count from InfiniTime Motion Service (step characteristic `00030001-…` on `00030000-…`).
/// Returns cumulative steps as `uint32` little-endian per InfiniTime `doc/MotionService.md`.
#[tauri::command]
pub async fn ble_read_step_count() -> Result<u32, String> {
    let handler = tauri_plugin_blec::get_handler().map_err(|e| e.to_string())?;
    let bytes = handler
        .recv_data(
            registry::INFINITIME_MOTION_STEP_COUNT_CHAR_UUID,
            Some(registry::INFINITIME_MOTION_SERVICE_UUID),
        )
        .await
        .map_err(|e| e.to_string())?;

    if bytes.len() < 4 {
        return Err(format!("step count read: expected 4 bytes (uint32 LE), got {}", bytes.len()));
    }
    let arr: [u8; 4] = bytes[..4].try_into().expect("length checked");
    Ok(u32::from_le_bytes(arr))
}

/// Reads standard Device Information (`0x180A`) string characteristics (best-effort per field).
#[tauri::command]
pub async fn ble_read_device_information() -> Result<dis::DeviceInformation, String> {
    dis::read_device_information().await
}

/// Reads the SIG Battery Level (`0x2A19` on `0x180F`) and returns percentage (0-100).
#[tauri::command]
pub async fn ble_read_battery_percentage() -> Result<u8, String> {
    let handler = tauri_plugin_blec::get_handler().map_err(|e| e.to_string())?;
    let bytes = handler
        .recv_data(
            registry::BATTERY_LEVEL_CHAR_UUID,
            Some(registry::BATTERY_SERVICE_UUID),
        )
        .await
        .map_err(|e| e.to_string())?;

    let Some(level) = bytes.first().copied() else {
        return Err("battery level read returned empty payload".to_string());
    };
    if level > 100 {
        return Err(format!("battery level out of range: {level}"));
    }
    Ok(level)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DfuFlashInput {
    pub zip_path: Option<String>,
    pub firmware_bin_path: Option<String>,
    pub init_dat_path: Option<String>,
}

/// Nordic legacy application DFU: flash from a ZIP (containing `.bin` / `.dat`) or explicit `firmware_bin` + `init_dat` paths.
#[tauri::command]
pub async fn ble_dfu_flash_package(app: AppHandle, input: DfuFlashInput) -> Result<(), String> {
    {
        let session = session::global().lock().map_err(|e| e.to_string())?;
        if !session
            .active_feature_ids
            .iter()
            .any(|s| s.as_str() == FeatureId::InfiniTimeDfu.as_str())
        {
            return Err("DFU: active profile does not include infinitime.dfu".to_string());
        }
    }
    let _session = super::nordic_dfu::start_session()?;
    let handler = tauri_plugin_blec::get_handler().map_err(|e| e.to_string())?;
    let image = super::nordic_dfu::load_dfu_image(
        input.zip_path.as_deref().map(std::path::Path::new),
        input.firmware_bin_path.as_deref().map(std::path::Path::new),
        input.init_dat_path.as_deref().map(std::path::Path::new),
    )?;
    super::nordic_dfu::run_dfu(&app, handler, image).await
}

/// Best-effort: sets a flag the DFU loop checks between writes and while waiting for notifications. Does not abort mid–ATT write.
#[tauri::command]
pub fn ble_dfu_cancel() {
    super::nordic_dfu::request_dfu_cancel();
}
