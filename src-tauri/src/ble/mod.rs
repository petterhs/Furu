//! BLE backend: profiles, feature IDs, GATT registry, and Tauri commands over `tauri-plugin-blec`.

mod ans;
pub mod commands;
pub mod connection;
mod connection_policy;
mod cts;
mod dis;
mod feature_id;
mod kongle_battery;
pub mod media;
mod nordic_dfu;
pub mod notification_forwarding;
mod profiles;
mod registry;
mod session;
