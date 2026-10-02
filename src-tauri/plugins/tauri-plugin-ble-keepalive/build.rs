const COMMANDS: &[&str] = &["start_service", "stop_service", "notify_disconnect"];

fn main() {
    tauri_plugin::Builder::new(COMMANDS)
        .android_path("android")
        .build();
}
