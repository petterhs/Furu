use std::sync::{LazyLock, Mutex};

use super::profiles::ProfileId;

#[derive(Debug, Default)]
pub struct Session {
    /// User- or future auto-detection-selected profile.
    pub active_profile: ProfileId,
}

static SESSION: LazyLock<Mutex<Session>> = LazyLock::new(|| Mutex::new(Session::default()));

pub fn global() -> &'static Mutex<Session> {
    &SESSION
}
