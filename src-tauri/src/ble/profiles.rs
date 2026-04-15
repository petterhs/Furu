use serde::Serialize;

use super::feature_id::FeatureId;

/// Device/firmware profile for capability gating (not the same as hardware model).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ProfileId {
    #[default]
    Unknown,
    InfiniTime,
    Kongle,
}

impl ProfileId {
    #[must_use]
    pub fn parse(s: &str) -> Result<Self, String> {
        match s {
            "unknown" => Ok(Self::Unknown),
            "infinitime" => Ok(Self::InfiniTime),
            "kongle" => Ok(Self::Kongle),
            _ => Err(format!("unknown profile id: {s}")),
        }
    }

    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Unknown => "unknown",
            Self::InfiniTime => "infinitime",
            Self::Kongle => "kongle",
        }
    }

    #[must_use]
    pub const fn all() -> &'static [ProfileId] {
        &[
            ProfileId::Unknown,
            ProfileId::InfiniTime,
            ProfileId::Kongle,
        ]
    }

    #[must_use]
    pub fn label(self) -> &'static str {
        match self {
            Self::Unknown => "Unknown",
            Self::InfiniTime => "InfiniTime",
            Self::Kongle => "Kongle",
        }
    }

    #[must_use]
    pub fn description(self) -> &'static str {
        match self {
            Self::Unknown => "No features assumed until you pick a profile.",
            Self::InfiniTime => {
                "InfiniTime-oriented GATT features (CTS, ANS, DFU, …); name rules can select this profile."
            }
            Self::Kongle => "Kongle firmware; CTS only until more services are documented.",
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
        ProfileId::InfiniTime => &[
            FeatureId::BleDeviceInformation,
            FeatureId::BleCurrentTime,
            FeatureId::BleHeartRate,
            FeatureId::BleAlertNotification,
            FeatureId::BleStepCount,
            FeatureId::InfiniTimeDfu,
            FeatureId::InfiniTimeCompanionUart,
        ],
        ProfileId::Kongle => &[FeatureId::BleCurrentTime],
    }
}
