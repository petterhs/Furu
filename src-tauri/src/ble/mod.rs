//! BLE backend: profiles, feature IDs, GATT registry, and Tauri commands over `tauri-plugin-blec`.

pub mod commands;
pub mod notification_forwarding;
mod ans;
mod cts;
mod dis;
mod feature_id;
mod profiles;
mod registry;
mod session;
