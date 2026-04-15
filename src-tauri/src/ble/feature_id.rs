use serde::Serialize;

/// Stable feature identifiers; keep in sync with `docs/features/catalog.md` and `src/lib/bleContract.ts`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
#[allow(dead_code)] // Variants mirror the catalog; not all are wired into profiles yet.
pub enum FeatureId {
    BleDeviceInformation,
    BleCurrentTime,
    BleHeartRate,
    BleAlertNotification,
    BleStepCount,
    InfiniTimeDfu,
    InfiniTimeCompanionUart,
}

impl FeatureId {
    #[must_use]
    pub fn parse(s: &str) -> Result<Self, String> {
        match s {
            "ble.device_information" => Ok(Self::BleDeviceInformation),
            "ble.current_time" => Ok(Self::BleCurrentTime),
            "ble.hr" => Ok(Self::BleHeartRate),
            "ble.anss" => Ok(Self::BleAlertNotification),
            "ble.dis_steps" => Ok(Self::BleStepCount),
            "infinitime.dfu" => Ok(Self::InfiniTimeDfu),
            "infinitime.companion_uart" => Ok(Self::InfiniTimeCompanionUart),
            _ => Err(format!("unknown feature id: {s}")),
        }
    }

    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::BleDeviceInformation => "ble.device_information",
            Self::BleCurrentTime => "ble.current_time",
            Self::BleHeartRate => "ble.hr",
            Self::BleAlertNotification => "ble.anss",
            Self::BleStepCount => "ble.dis_steps",
            Self::InfiniTimeDfu => "infinitime.dfu",
            Self::InfiniTimeCompanionUart => "infinitime.companion_uart",
        }
    }
}

impl Serialize for FeatureId {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(self.as_str())
    }
}
