//! Pure connection policy shared by the native actor and host tests.
use serde::{Deserialize, Serialize};
use std::time::Duration;

#[derive(Clone, Debug, Default, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DevicePolicy {
    pub address: String,
    pub name: String,
    pub nickname: String,
    pub profile_preference: String,
    pub enabled: bool,
    pub retry_delay_ms: u64,
    pub max_failures: u32,
    pub replay_notifications: bool,
    pub notifications_enabled: bool,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Profile {
    pub id: String,
    pub feature_ids: Vec<String>,
}
#[derive(Clone, Debug, Default, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NameRule {
    pub pattern: String,
    pub match_mode: String,
    pub profile_id: String,
}
#[derive(Clone, Debug, Default, Deserialize, Serialize, PartialEq)]
#[serde(default, rename_all = "camelCase")]
pub struct Policies {
    pub notification_forwarding_enabled: bool,
    pub blocked_notification_packages: Vec<String>,
    pub devices: Vec<DevicePolicy>,
    pub profiles: Vec<Profile>,
    pub name_rules: Vec<NameRule>,
}
impl Policies {
    pub fn device(&self, address: &str) -> Option<&DevicePolicy> {
        self.devices
            .iter()
            .find(|p| p.address.eq_ignore_ascii_case(address))
    }
    pub fn profile(&self, address: &str, name: &str) -> Profile {
        let preference = self
            .device(address)
            .map(|p| p.profile_preference.as_str())
            .unwrap_or("auto");
        let name = name.trim().to_lowercase();
        let id = if preference != "auto" {
            preference
        } else {
            self.name_rules
                .iter()
                .find(|r| {
                    let pattern = r.pattern.trim().to_lowercase();
                    !pattern.is_empty()
                        && match r.match_mode.as_str() {
                            "equals" => name == pattern,
                            "prefix" => name.starts_with(&pattern),
                            _ => name.contains(&pattern),
                        }
                })
                .map(|r| r.profile_id.as_str())
                .unwrap_or("unknown")
        };
        self.profiles
            .iter()
            .find(|p| p.id == id)
            .cloned()
            .unwrap_or(Profile {
                id: "unknown".into(),
                feature_ids: vec![],
            })
    }
}

#[derive(Default, Debug)]
pub struct Retry {
    pub generation: u64,
    pub attempts: u32,
    pub failures: u32,
    pub scan_first: bool,
}
impl Retry {
    pub fn cancel(&mut self) {
        self.generation = self.generation.wrapping_add(1);
        self.attempts = 0;
        self.failures = 0;
    }
    pub fn start(&mut self, scan_first: bool) {
        self.cancel();
        self.scan_first = scan_first;
    }
    pub fn next_uses_scan(&mut self) -> bool {
        let scan = self.attempts.is_multiple_of(2) == self.scan_first;
        self.attempts += 1;
        scan
    }
    pub fn failed(&mut self, p: &DevicePolicy) -> Option<Duration> {
        self.failures += 1;
        if !p.enabled || (p.max_failures > 0 && self.failures >= p.max_failures) {
            return None;
        }
        let base = p.retry_delay_ms.clamp(5_000, 3_600_000);
        Some(Duration::from_millis(
            base.saturating_mul(1 << (self.failures - 1).min(5))
                .min(base.max(300_000)),
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn retry_is_bounded_and_manual_cancellation_invalidates_late_results() {
        let mut r = Retry::default();
        r.start(false);
        let generation = r.generation;
        assert!(!r.next_uses_scan());
        assert!(r.next_uses_scan());
        let p = DevicePolicy {
            enabled: true,
            retry_delay_ms: 60_000,
            ..Default::default()
        };
        assert_eq!(r.failed(&p), Some(Duration::from_secs(60)));
        assert_eq!(r.failed(&p), Some(Duration::from_secs(120)));
        for _ in 0..10 {
            assert!(r.failed(&p).unwrap() <= Duration::from_secs(300));
        }
        r.cancel();
        assert_ne!(generation, r.generation);
        assert_eq!(r.failures, 0);
    }
    #[test]
    fn ota_starts_with_scan_and_failure_limits_are_honored() {
        let mut r = Retry::default();
        r.start(true);
        assert!(r.next_uses_scan());
        assert!(!r.next_uses_scan());
        let p = DevicePolicy {
            enabled: true,
            max_failures: 2,
            ..Default::default()
        };
        assert!(r.failed(&p).is_some());
        assert!(r.failed(&p).is_none());
        r.start(false);
        assert!(r.failed(&DevicePolicy::default()).is_none());
    }
    #[test]
    fn native_profile_matching_preserves_overrides_and_custom_features() {
        let mut p = Policies {
            devices: vec![DevicePolicy {
                address: "AA:BB".into(),
                profile_preference: "auto".into(),
                ..Default::default()
            }],
            profiles: vec![
                Profile {
                    id: "kongle".into(),
                    feature_ids: vec!["ble.cts".into()],
                },
                Profile {
                    id: "custom".into(),
                    feature_ids: vec![],
                },
            ],
            notification_forwarding_enabled: false,
            blocked_notification_packages: vec![],
            name_rules: vec![NameRule {
                pattern: "kongle".into(),
                match_mode: "prefix".into(),
                profile_id: "kongle".into(),
            }],
        };
        assert_eq!(p.profile("aa:bb", "Kongle watch").id, "kongle");
        p.devices[0].profile_preference = "custom".into();
        assert_eq!(p.profile("aa:bb", "Kongle").id, "custom");
        p.devices[0].profile_preference = "deleted".into();
        assert!(p.profile("aa:bb", "Kongle").feature_ids.is_empty());
    }
}
