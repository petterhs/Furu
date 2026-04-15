use tauri::{plugin::TauriPlugin, Runtime};
#[cfg(target_os = "android")]
use tauri::Manager;

mod commands;

pub use commands::{
    check_permissions, drain_notifications, get_permission_status, list_recent_notifications,
    open_notification_listener_settings, post_test_notification, wait_for_notifications,
};

#[cfg(target_os = "android")]
const PLUGIN_IDENTIFIER: &str = "com.furu.notificationforwarder";

#[cfg(target_os = "android")]
pub struct NotificationForwarderHandle<R: Runtime>(pub tauri::plugin::PluginHandle<R>);

pub fn init<R: Runtime>() -> TauriPlugin<R, ()> {
    tauri::plugin::Builder::<R, ()>::new("notification-forwarder")
        .invoke_handler(tauri::generate_handler![
            commands::check_permissions,
            commands::get_permission_status,
            commands::open_notification_listener_settings,
            commands::drain_notifications,
            commands::list_recent_notifications,
            commands::wait_for_notifications,
            commands::post_test_notification
        ])
        .setup(|app, api| {
            #[cfg(target_os = "android")]
            {
                let handle =
                    api.register_android_plugin(PLUGIN_IDENTIFIER, "NotificationForwarderPlugin")?;
                app.manage(NotificationForwarderHandle(handle));
            }
            #[cfg(not(target_os = "android"))]
            let _ = (app, api);
            Ok(())
        })
        .build()
}
