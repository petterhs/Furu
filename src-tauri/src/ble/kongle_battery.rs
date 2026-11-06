//! Kongle battery telemetry and paged history protocol v1.

use chrono::{TimeZone, Utc};
use serde::Serialize;
use tauri_plugin_blec::models::WriteType;

use super::{feature_id::FeatureId, registry, session};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BatteryCurrent {
    pub voltage_mv: u16,
    pub percent: u8,
    pub charging: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BatterySample {
    pub at: String,
    pub voltage_mv: u16,
    pub percent: u8,
    pub charging: bool,
}

fn require_feature() -> Result<(), String> {
    let state = session::global().lock().map_err(|e| e.to_string())?;
    if state
        .active_feature_ids
        .iter()
        .any(|id| id == FeatureId::KongleBatteryHistory.as_str())
    {
        Ok(())
    } else {
        Err("Kongle battery history is not enabled for this device profile".into())
    }
}

pub async fn read_current() -> Result<BatteryCurrent, String> {
    require_feature()?;
    let handler = tauri_plugin_blec::get_handler().map_err(|e| e.to_string())?;
    let data = handler
        .recv_data(
            registry::KONGLE_BATTERY_CURRENT_CHAR_UUID,
            Some(registry::KONGLE_BATTERY_SERVICE_UUID),
        )
        .await
        .map_err(|e| e.to_string())?;
    if data.len() != 4 || data[2] > 100 || data[3] > 1 {
        return Err("invalid Kongle battery telemetry".into());
    }
    Ok(BatteryCurrent {
        voltage_mv: u16::from_le_bytes([data[0], data[1]]),
        percent: data[2],
        charging: data[3] == 1,
    })
}

struct Page {
    base: u32,
    next: u32,
    now_uptime: u32,
    records: Vec<(u32, u32, u16, u8, bool)>,
}

fn parse_page(data: &[u8]) -> Result<Page, String> {
    if data.len() < 14 || data[0] != 1 {
        return Err("unsupported Kongle battery history page".into());
    }
    let base = u32::from_le_bytes(data[1..5].try_into().unwrap());
    let next = u32::from_le_bytes(data[5..9].try_into().unwrap());
    let count = data[9] as usize;
    let now_uptime = u32::from_le_bytes(data[10..14].try_into().unwrap());
    if count > 18 || data.len() != 14 + count * 12 || next != base + count as u32 {
        return Err("malformed Kongle battery history page".into());
    }
    let mut records = Vec::with_capacity(count);
    for bytes in data[14..].chunks_exact(12) {
        let uptime = u32::from_le_bytes(bytes[0..4].try_into().unwrap());
        let epoch = u32::from_le_bytes(bytes[4..8].try_into().unwrap());
        let voltage = u16::from_le_bytes([bytes[8], bytes[9]]);
        if (epoch == 0 && uptime > now_uptime) || bytes[10] > 100 || bytes[11] > 1 {
            return Err("invalid Kongle battery sample".into());
        }
        records.push((uptime, epoch, voltage, bytes[10], bytes[11] == 1));
    }
    Ok(Page {
        base,
        next,
        now_uptime,
        records,
    })
}

pub async fn read_history() -> Result<Vec<BatterySample>, String> {
    require_feature()?;
    let handler = tauri_plugin_blec::get_handler().map_err(|e| e.to_string())?;
    let epoch =
        u32::try_from(Utc::now().timestamp()).map_err(|_| "phone time cannot be sent to Kongle")?;
    handler
        .send_data(
            registry::KONGLE_BATTERY_EPOCH_CHAR_UUID,
            Some(registry::KONGLE_BATTERY_SERVICE_UUID),
            &epoch.to_le_bytes(),
            WriteType::WithResponse,
        )
        .await
        .map_err(|e| e.to_string())?;
    let mut cursor = 0u32;
    let mut samples = Vec::new();
    for _ in 0..32 {
        handler
            .send_data(
                registry::KONGLE_BATTERY_CURSOR_CHAR_UUID,
                Some(registry::KONGLE_BATTERY_SERVICE_UUID),
                &cursor.to_le_bytes(),
                WriteType::WithResponse,
            )
            .await
            .map_err(|e| e.to_string())?;
        let bytes = handler
            .recv_data(
                registry::KONGLE_BATTERY_PAGE_CHAR_UUID,
                Some(registry::KONGLE_BATTERY_SERVICE_UUID),
            )
            .await
            .map_err(|e| e.to_string())?;
        let page = parse_page(&bytes)?;
        if page.base < cursor || page.next < page.base {
            return Err("Kongle battery history moved backwards".into());
        }
        let host_now = Utc::now().timestamp_millis();
        for (uptime, epoch, voltage_mv, percent, charging) in page.records {
            let at_ms = if epoch != 0 {
                i64::from(epoch) * 1000
            } else {
                host_now - i64::from(page.now_uptime - uptime) * 1000
            };
            let at = Utc
                .timestamp_millis_opt(at_ms)
                .single()
                .ok_or("Kongle battery timestamp out of range")?
                .to_rfc3339();
            samples.push(BatterySample {
                at,
                voltage_mv,
                percent,
                charging,
            });
        }
        if page.next == cursor || page.next == page.base {
            return Ok(samples);
        }
        cursor = page.next;
    }
    Err("Kongle battery history exceeded the page limit".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_truncated_and_invalid_pages() {
        assert!(parse_page(&[1; 13]).is_err());
        let mut page = vec![1];
        page.extend_from_slice(&0u32.to_le_bytes());
        page.extend_from_slice(&1u32.to_le_bytes());
        page.push(1);
        page.extend_from_slice(&10u32.to_le_bytes());
        assert!(parse_page(&page).is_err());
        page.extend_from_slice(&11u32.to_le_bytes());
        page.extend_from_slice(&0u32.to_le_bytes());
        page.extend_from_slice(&3800u16.to_le_bytes());
        page.extend_from_slice(&[50, 0]);
        assert!(parse_page(&page).is_err());
    }

    #[test]
    fn parses_epoch_and_charging_from_valid_page() {
        let mut page = vec![1];
        page.extend_from_slice(&4u32.to_le_bytes());
        page.extend_from_slice(&5u32.to_le_bytes());
        page.push(1);
        page.extend_from_slice(&100u32.to_le_bytes());
        page.extend_from_slice(&50u32.to_le_bytes());
        page.extend_from_slice(&1_783_000_000u32.to_le_bytes());
        page.extend_from_slice(&3860u16.to_le_bytes());
        page.extend_from_slice(&[60, 1]);
        let parsed = parse_page(&page).unwrap();
        assert_eq!(parsed.records, vec![(50, 1_783_000_000, 3860, 60, true)]);
    }
}
