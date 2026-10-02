#[cfg(target_os = "android")]
use crate::BleKeepaliveHandle;
#[cfg(target_os = "android")]
use tauri::Manager;
use tauri::{AppHandle, Runtime};

#[tauri::command]
pub fn start_service<R: Runtime>(
    #[allow(unused_variables)] app: AppHandle<R>,
    #[allow(unused_variables)] reconnecting: Option<bool>,
) -> Result<(), String> {
    #[cfg(target_os = "android")]
    {
        if let Some(handle) = app.try_state::<BleKeepaliveHandle<R>>() {
            handle
                .0
                .run_mobile_plugin::<()>(
                    "startService",
                    serde_json::json!({ "reconnecting": reconnecting.unwrap_or(false) }),
                )
                .map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[tauri::command]
pub fn stop_service<R: Runtime>(
    #[allow(unused_variables)] app: AppHandle<R>,
) -> Result<(), String> {
    #[cfg(target_os = "android")]
    {
        if let Some(handle) = app.try_state::<BleKeepaliveHandle<R>>() {
            handle
                .0
                .run_mobile_plugin::<()>("stopService", serde_json::Value::Null)
                .map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[tauri::command]
pub fn notify_disconnect<R: Runtime>(
    #[allow(unused_variables)] app: AppHandle<R>,
    #[allow(unused_variables)] name: String,
) -> Result<(), String> {
    #[cfg(target_os = "android")]
    {
        if let Some(handle) = app.try_state::<BleKeepaliveHandle<R>>() {
            handle
                .0
                .run_mobile_plugin::<()>("notifyDisconnect", serde_json::json!({ "name": name }))
                .map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}
