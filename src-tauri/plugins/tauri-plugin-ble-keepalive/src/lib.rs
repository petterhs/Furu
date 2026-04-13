use tauri::{plugin::TauriPlugin, Runtime};
#[cfg(target_os = "android")]
use tauri::Manager;

#[cfg(target_os = "android")]
const PLUGIN_IDENTIFIER: &str = "com.furu.blekeepalive";

mod commands;

pub use commands::{start_service, stop_service};

pub fn init<R: Runtime>() -> TauriPlugin<R, ()> {
    tauri::plugin::Builder::<R, ()>::new("ble-keepalive")
        .invoke_handler(tauri::generate_handler![commands::start_service, commands::stop_service])
        .setup(|app, api| {
            #[cfg(target_os = "android")]
            {
                let handle =
                    api.register_android_plugin(PLUGIN_IDENTIFIER, "BleKeepalivePlugin")?;
                app.manage(handle);
            }
            #[cfg(not(target_os = "android"))]
            let _ = (app, api);
            Ok(())
        })
        .build()
}
