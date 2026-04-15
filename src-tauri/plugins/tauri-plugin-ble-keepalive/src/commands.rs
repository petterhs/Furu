use tauri::{AppHandle, Runtime};
#[cfg(target_os = "android")]
use tauri::Manager;
#[cfg(target_os = "android")]
use crate::BleKeepaliveHandle;

#[tauri::command]
pub fn start_service<R: Runtime>(#[allow(unused_variables)] app: AppHandle<R>) -> Result<(), String> {
    #[cfg(target_os = "android")]
    {
        if let Some(handle) = app.try_state::<BleKeepaliveHandle<R>>() {
            handle
                .0
                .run_mobile_plugin::<()>("startService", serde_json::Value::Null)
                .map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[tauri::command]
pub fn stop_service<R: Runtime>(#[allow(unused_variables)] app: AppHandle<R>) -> Result<(), String> {
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
