//! Bluetooth SIG **Alert Notification Service** — **New Alert** characteristic (`0x2A46`) payload.
//!
//! [InfiniTime](https://github.com/InfiniTimeOrg/InfiniTime) copies the UTF-8 blob starting at **byte offset 3**
//! (`AlertNotificationService.cpp`: `headerSize = 3`) and splits **title** / **body** on the first **NUL** in that
//! blob (`NotificationManager::Title` / `Message`).

/// ANS category ID: Simple Alert (same numeric value as InfiniTime’s `Categories::SimpleAlert`).
pub const CATEGORY_SIMPLE_ALERT: u8 = 0x00;

/// Builds a **New Alert** write payload for InfiniTime-style peers: `[category][count=1][0][title\0message]`.
///
/// The text portion is capped at **100 bytes** (InfiniTime `NotificationManager::MessageSize`).
pub fn encode_new_alert_infinitime(
    title: &str,
    message: &str,
    category: u8,
) -> Result<Vec<u8>, String> {
    if title.contains('\0') || message.contains('\0') {
        return Err("title and message must not contain ASCII NUL".to_string());
    }
    const MAX_TEXT: usize = 100;
    let mut text: Vec<u8> = Vec::new();
    text.extend_from_slice(title.as_bytes());
    text.push(0);
    text.extend_from_slice(message.as_bytes());
    if text.len() > MAX_TEXT {
        text.truncate(MAX_TEXT);
    }
    let mut out = Vec::with_capacity(3 + text.len());
    out.push(category);
    out.push(1);
    out.push(0);
    out.extend(text);
    Ok(out)
}
