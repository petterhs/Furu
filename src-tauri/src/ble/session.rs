use std::sync::{LazyLock, Mutex};

/// Runtime BLE capability selection (profile id is an opaque string; may be built-in or custom).
#[derive(Debug, Clone)]
pub struct Session {
    pub active_profile_id: String,
    pub active_feature_ids: Vec<String>,
    pub notification_forwarding_enabled: bool,
    pub active_device_notifications_enabled: bool,
    pub connection_active: bool,
    pub blocked_notification_packages: Vec<String>,
}

impl Default for Session {
    fn default() -> Self {
        Self {
            active_profile_id: "unknown".to_string(),
            active_feature_ids: Vec::new(),
            notification_forwarding_enabled: true,
            active_device_notifications_enabled: true,
            connection_active: false,
            blocked_notification_packages: Vec::new(),
        }
    }
}

static SESSION: LazyLock<Mutex<Session>> = LazyLock::new(|| Mutex::new(Session::default()));

pub fn global() -> &'static Mutex<Session> {
    &SESSION
}
