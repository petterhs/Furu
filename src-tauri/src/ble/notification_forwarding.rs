#[cfg(target_os = "android")]
use serde::Deserialize;
#[cfg(target_os = "android")]
use std::sync::atomic::{AtomicI64, Ordering};
use tauri::{AppHandle, Runtime};
#[cfg(target_os = "android")]
use tauri::Manager;
#[cfg(target_os = "android")]
use tauri_plugin_blec::models::WriteType;

#[cfg(target_os = "android")]
use super::ans;
#[cfg(target_os = "android")]
use super::feature_id::FeatureId;
#[cfg(target_os = "android")]
use super::registry;
#[cfg(target_os = "android")]
use super::session;

#[cfg(target_os = "android")]
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct NotificationPayload {
    package_name: String,
    title: String,
    message: String,
    posted_at_ms: i64,
}

#[cfg(target_os = "android")]
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WaitForNotificationsResponse {
    version: i64,
    changed: bool,
}

#[cfg(target_os = "android")]
static LAST_FORWARDED_POSTED_AT_MS: AtomicI64 = AtomicI64::new(0);
#[cfg(target_os = "android")]
static LAST_QUEUE_VERSION: AtomicI64 = AtomicI64::new(0);
#[cfg(target_os = "android")]
static LAST_GATE_MASK: AtomicI64 = AtomicI64::new(-1);

#[cfg(target_os = "android")]
async fn send_ans_notification(title: &str, message: &str) -> Result<(), String> {
    let pdu = ans::encode_new_alert_infinitime(title, message, ans::CATEGORY_SIMPLE_ALERT)?;
    let handler = tauri_plugin_blec::get_handler().map_err(|e| e.to_string())?;
    handler
        .send_data(
            registry::NEW_ALERT_CHAR_UUID,
            Some(registry::ALERT_NOTIFICATION_SERVICE_UUID),
            &pdu,
            WriteType::WithResponse,
        )
        .await
        .map_err(|e| e.to_string())
}

#[cfg(target_os = "android")]
fn should_forward_notifications() -> bool {
    let Ok(s) = session::global().lock() else {
        eprintln!("[notif-fwd] session lock failed");
        return false;
    };
    let has_anss = s
        .active_feature_ids
        .iter()
        .any(|f| f == FeatureId::BleAlertNotification.as_str());
    let mut mask = 0_i64;
    if s.connection_active {
        mask |= 1;
    }
    if s.notification_forwarding_enabled {
        mask |= 2;
    }
    if s.active_device_notifications_enabled {
        mask |= 4;
    }
    if has_anss {
        mask |= 8;
    }
    let allowed = mask == 0b1111;
    let previous = LAST_GATE_MASK.swap(mask, Ordering::Relaxed);
    if previous != mask {
        eprintln!(
            "[notif-fwd] gate state conn={} global={} device={} has_anss={} allowed={}",
            s.connection_active, s.notification_forwarding_enabled, s.active_device_notifications_enabled, has_anss, allowed
        );
    }
    allowed
}

#[cfg(target_os = "android")]
fn is_package_blocked(package_name: &str) -> bool {
    let Ok(s) = session::global().lock() else {
        return false;
    };
    s.blocked_notification_packages.iter().any(|p| p == package_name)
}

#[cfg(target_os = "android")]
async fn wait_for_notification_wake<R: Runtime>(
    app: &AppHandle<R>,
    timeout_ms: i64,
) -> Result<(i64, bool), String> {
    let since_version = LAST_QUEUE_VERSION.load(Ordering::Relaxed);
    let Some(handle) = app.try_state::<tauri_plugin_notification_forwarder::NotificationForwarderHandle<R>>() else {
        return Err("notification-forwarder plugin handle not available".to_string());
    };
    let response: WaitForNotificationsResponse = handle
        .0
        .run_mobile_plugin(
            "waitForNotifications",
            serde_json::json!({ "sinceVersion": since_version, "timeoutMs": timeout_ms }),
        )
        .map_err(|e| e.to_string())?;
    LAST_QUEUE_VERSION.store(response.version, Ordering::Relaxed);
    Ok((response.version, response.changed))
}

#[cfg(target_os = "android")]
fn decode_notifications_from_raw(raw: serde_json::Value) -> Result<Vec<NotificationPayload>, String> {
    let Some(notifications_value) = raw.get("notifications") else {
        return Err(format!("missing `notifications` field: {raw}"));
    };
    let notifications: Result<Vec<NotificationPayload>, _> = match notifications_value {
        serde_json::Value::Array(_) => serde_json::from_value(notifications_value.clone()),
        serde_json::Value::String(s) => serde_json::from_str::<Vec<NotificationPayload>>(s),
        _ => serde_json::from_value(notifications_value.clone()),
    };
    notifications.map_err(|e| format!("decode failed: {e}; raw={raw}"))
}

#[cfg(target_os = "android")]
fn fetch_recent_notifications<R: Runtime>(app: &AppHandle<R>) -> Result<Vec<NotificationPayload>, String> {
    let Some(handle) = app.try_state::<tauri_plugin_notification_forwarder::NotificationForwarderHandle<R>>() else {
        return Err("notification-forwarder plugin handle not available".to_string());
    };
    let raw: serde_json::Value = handle
        .0
        .run_mobile_plugin("listRecentNotifications", serde_json::Value::Null)
        .map_err(|e| format!("listRecentNotifications call failed: {e}"))?;
    decode_notifications_from_raw(raw)
}

#[cfg(target_os = "android")]
pub fn spawn_background_forwarder<R: Runtime>(app: AppHandle<R>) {
    tauri::async_runtime::spawn(async move {
        const EVENT_WAIT_TIMEOUT_MS: i64 = 20_000;
        const FALLBACK_SWEEP_SECONDS: u64 = 30;
        let mut ticks_since_last_sweep: u64 = 0;
        loop {
            let wake = wait_for_notification_wake(&app, EVENT_WAIT_TIMEOUT_MS).await;
            let changed = match wake {
                Ok((version, changed)) => {
                    if changed {
                        eprintln!("[notif-fwd] wake version={version} changed=true");
                    }
                    changed
                }
                Err(error) => {
                    eprintln!("[notif-fwd] waitForNotifications failed: {error}");
                    false
                }
            };

            ticks_since_last_sweep += 1;
            let do_fallback_sweep = ticks_since_last_sweep * (EVENT_WAIT_TIMEOUT_MS as u64 / 1000) >= FALLBACK_SWEEP_SECONDS;
            if do_fallback_sweep {
                ticks_since_last_sweep = 0;
            }
            if !changed && !do_fallback_sweep {
                continue;
            }
            if do_fallback_sweep {
                eprintln!("[notif-fwd] fallback sweep");
            }

            if !should_forward_notifications() {
                continue;
            }

            let pending_result = fetch_recent_notifications(&app);
            let Ok(mut pending) = pending_result else {
                eprintln!("[notif-fwd] listRecentNotifications {}", pending_result.err().unwrap_or_default());
                continue;
            };

            pending.sort_by_key(|n| n.posted_at_ms);
            let last_sent = LAST_FORWARDED_POSTED_AT_MS.load(Ordering::Relaxed);
            if !pending.is_empty() {
                eprintln!("[notif-fwd] recent_count={} last_sent={}", pending.len(), last_sent);
            }

            let mut sent_this_tick = 0usize;
            for n in pending.into_iter().filter(|n| n.posted_at_ms > last_sent) {
                if is_package_blocked(&n.package_name) {
                    LAST_FORWARDED_POSTED_AT_MS.store(n.posted_at_ms, Ordering::Relaxed);
                    continue;
                }
                let title = if n.title.trim().is_empty() {
                    n.package_name.as_str()
                } else {
                    n.title.as_str()
                };
                let message = if n.message.trim().is_empty() {
                    "(no message)"
                } else {
                    n.message.as_str()
                };
                if let Err(error) = send_ans_notification(title, message).await {
                    eprintln!(
                        "notification forward send failed (pkg={}, at={}): {}",
                        n.package_name, n.posted_at_ms, error
                    );
                    // Retry this and later notifications on next tick.
                    break;
                }
                LAST_FORWARDED_POSTED_AT_MS.store(n.posted_at_ms, Ordering::Relaxed);
                sent_this_tick += 1;
            }
            if sent_this_tick > 0 {
                eprintln!("[notif-fwd] forwarded_count={sent_this_tick}");
            }
        }
    });
}

#[cfg(not(target_os = "android"))]
pub fn spawn_background_forwarder<R: Runtime>(_app: AppHandle<R>) {}

/// Advance the phone notification watermark to the newest queued item (or “now”) without
/// forwarding, so a fresh **manual** connect does not blast historical notifications to the watch.
#[cfg(target_os = "android")]
pub async fn absorb_notification_backlog_watermark(app: tauri::AppHandle) -> Result<(), String> {
    let pending = fetch_recent_notifications(&app)?;
    let watermark = pending
        .iter()
        .map(|n| n.posted_at_ms)
        .max()
        .unwrap_or_else(current_time_ms_unix);
    LAST_FORWARDED_POSTED_AT_MS.store(watermark, Ordering::Relaxed);
    eprintln!(
        "[notif-fwd] absorb backlog watermark={watermark} (recent_count={})",
        pending.len()
    );
    Ok(())
}

#[cfg(target_os = "android")]
fn current_time_ms_unix() -> i64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

#[cfg(not(target_os = "android"))]
pub async fn absorb_notification_backlog_watermark(_app: tauri::AppHandle) -> Result<(), String> {
    Ok(())
}
