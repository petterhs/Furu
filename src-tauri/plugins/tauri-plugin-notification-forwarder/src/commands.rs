use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Runtime};
#[cfg(target_os = "android")]
use tauri::Manager;
#[cfg(target_os = "android")]
use crate::NotificationForwarderHandle;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PermissionStatus {
    pub post_notifications: bool,
    pub notification_listener: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NotificationPayload {
    pub package_name: String,
    pub title: String,
    pub message: String,
    pub posted_at_ms: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(not(target_os = "android"), allow(dead_code))]
struct NotificationDrainResponse {
    notifications: Vec<NotificationPayload>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WaitForNotificationsResponse {
    pub version: i64,
    pub changed: bool,
}

#[tauri::command]
pub fn check_permissions<R: Runtime>(
    #[allow(unused_variables)] app: AppHandle<R>,
    ask: bool,
) -> Result<PermissionStatus, String> {
    #[cfg(target_os = "android")]
    {
        if let Some(handle) = app.try_state::<NotificationForwarderHandle<R>>() {
            return handle
                .0
                .run_mobile_plugin("checkPermissions", serde_json::json!({ "ask": ask }))
                .map_err(|e| e.to_string());
        }
    }
    #[cfg(not(target_os = "android"))]
    let _ = ask;
    Ok(PermissionStatus {
        post_notifications: true,
        notification_listener: false,
    })
}

#[tauri::command]
pub fn get_permission_status<R: Runtime>(
    #[allow(unused_variables)] app: AppHandle<R>,
) -> Result<PermissionStatus, String> {
    #[cfg(target_os = "android")]
    {
        if let Some(handle) = app.try_state::<NotificationForwarderHandle<R>>() {
            return handle
                .0
                .run_mobile_plugin("getPermissionStatus", serde_json::Value::Null)
                .map_err(|e| e.to_string());
        }
    }
    Ok(PermissionStatus {
        post_notifications: true,
        notification_listener: false,
    })
}

#[tauri::command]
pub fn open_notification_listener_settings<R: Runtime>(
    #[allow(unused_variables)] app: AppHandle<R>,
) -> Result<(), String> {
    #[cfg(target_os = "android")]
    {
        if let Some(handle) = app.try_state::<NotificationForwarderHandle<R>>() {
            handle
                .0
                .run_mobile_plugin::<()>("openNotificationListenerSettings", serde_json::Value::Null)
                .map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[tauri::command]
pub fn drain_notifications<R: Runtime>(
    #[allow(unused_variables)] app: AppHandle<R>,
) -> Result<Vec<NotificationPayload>, String> {
    #[cfg(target_os = "android")]
    {
        if let Some(handle) = app.try_state::<NotificationForwarderHandle<R>>() {
            let response: NotificationDrainResponse = handle
                .0
                .run_mobile_plugin("drainNotifications", serde_json::Value::Null)
                .map_err(|e| e.to_string())?;
            return Ok(response.notifications);
        }
    }
    Ok(Vec::new())
}

#[tauri::command]
pub fn list_recent_notifications<R: Runtime>(
    #[allow(unused_variables)] app: AppHandle<R>,
) -> Result<Vec<NotificationPayload>, String> {
    #[cfg(target_os = "android")]
    {
        if let Some(handle) = app.try_state::<NotificationForwarderHandle<R>>() {
            let response: NotificationDrainResponse = handle
                .0
                .run_mobile_plugin("listRecentNotifications", serde_json::Value::Null)
                .map_err(|e| e.to_string())?;
            return Ok(response.notifications);
        }
    }
    Ok(Vec::new())
}

#[tauri::command]
pub fn post_test_notification<R: Runtime>(
    #[allow(unused_variables)] app: AppHandle<R>,
    title: String,
    message: String,
) -> Result<(), String> {
    #[cfg(target_os = "android")]
    {
        if let Some(handle) = app.try_state::<NotificationForwarderHandle<R>>() {
            handle
                .0
                .run_mobile_plugin::<()>(
                    "postTestNotification",
                    serde_json::json!({ "title": title, "message": message }),
                )
                .map_err(|e| e.to_string())?;
        }
    }
    #[cfg(not(target_os = "android"))]
    let _ = (title, message);
    Ok(())
}

#[tauri::command]
pub fn wait_for_notifications<R: Runtime>(
    #[allow(unused_variables)] app: AppHandle<R>,
    since_version: i64,
    timeout_ms: i64,
) -> Result<WaitForNotificationsResponse, String> {
    #[cfg(target_os = "android")]
    {
        if let Some(handle) = app.try_state::<NotificationForwarderHandle<R>>() {
            return handle
                .0
                .run_mobile_plugin(
                    "waitForNotifications",
                    serde_json::json!({ "sinceVersion": since_version, "timeoutMs": timeout_ms }),
                )
                .map_err(|e| e.to_string());
        }
    }
    #[cfg(not(target_os = "android"))]
    let _ = (since_version, timeout_ms);
    Ok(WaitForNotificationsResponse {
        version: since_version,
        changed: false,
    })
}
