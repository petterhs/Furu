//! BLE backend: profiles, feature IDs, GATT registry, and Tauri commands over `tauri-plugin-blec`.

pub mod commands;
mod ans;
mod cts;
mod feature_id;
mod profiles;
mod registry;
mod session;
