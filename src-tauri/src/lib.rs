mod ble;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_blec::init())
        .plugin(tauri_plugin_ble_keepalive::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            greet,
            ble::commands::ble_list_profiles,
            ble::commands::ble_get_active_profile,
            ble::commands::ble_set_active_profile,
            ble::commands::ble_list_features_for_active_profile,
            ble::commands::ble_poc_send_current_time,
            ble::commands::ble_poc_send_notification,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
