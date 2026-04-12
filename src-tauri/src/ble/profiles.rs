use serde::Serialize;

use super::feature_id::FeatureId;

/// Device/firmware profile for capability gating (not the same as hardware model).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ProfileId {
    #[default]
    Unknown,
    InfiniTimePlaceholder,
}

impl ProfileId {
    #[must_use]
    pub fn parse(s: &str) -> Result<Self, String> {
        match s {
            "unknown" => Ok(Self::Unknown),
            "infinitime_placeholder" => Ok(Self::InfiniTimePlaceholder),
            _ => Err(format!("unknown profile id: {s}")),
        }
    }

    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Unknown => "unknown",
            Self::InfiniTimePlaceholder => "infinitime_placeholder",
        }
    }

    #[must_use]
    pub const fn all() -> &'static [ProfileId] {
        &[ProfileId::Unknown, ProfileId::InfiniTimePlaceholder]
    }

    #[must_use]
    pub fn label(self) -> &'static str {
        match self {
            Self::Unknown => "Unknown",
            Self::InfiniTimePlaceholder => "InfiniTime (placeholder)",
        }
    }

    #[must_use]
    pub fn description(self) -> &'static str {
        match self {
            Self::Unknown => "No features assumed until you pick a profile.",
            Self::InfiniTimePlaceholder => {
                "Planned InfiniTime-oriented features; detection and impl not wired yet."
            }
        }
    }
}

#[derive(Serialize)]
pub struct ProfileInfo {
    pub id: &'static str,
    pub label: &'static str,
    pub description: &'static str,
}

#[must_use]
pub fn profile_infos() -> Vec<ProfileInfo> {
    ProfileId::all()
        .iter()
        .copied()
        .map(|p| ProfileInfo {
            id: p.as_str(),
            label: p.label(),
            description: p.description(),
        })
        .collect()
}

/// Features this profile claims (used for UI and future `require_feature` checks).
#[must_use]
pub fn features_for_profile(profile: ProfileId) -> &'static [FeatureId] {
    match profile {
        ProfileId::Unknown => &[],
        ProfileId::InfiniTimePlaceholder => &[
            FeatureId::BleDeviceInformation,
            FeatureId::BleCurrentTime,
            FeatureId::BleHeartRate,
            FeatureId::BleAlertNotification,
            FeatureId::BleStepCount,
            FeatureId::InfiniTimeDfu,
            FeatureId::InfiniTimeCompanionUart,
        ],
    }
}
