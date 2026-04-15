const COMMANDS: &[&str] = &[
    "check_permissions",
    "get_permission_status",
    "open_notification_listener_settings",
    "drain_notifications",
    "list_recent_notifications",
    "wait_for_notifications",
    "post_test_notification",
];

fn main() {
    tauri_plugin::Builder::new(COMMANDS)
        .android_path("android")
        .build();
}
