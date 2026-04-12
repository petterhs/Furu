//! Bluetooth SIG **Current Time** characteristic (`0x2A2B`) — 10-octet value (GATT supplement).

use chrono::{Datelike, Local, Timelike};

/// Encodes **local** wall-clock time for a write to Current Time (`0x2A2B`).
///
/// Layout: year LE u16, month, day, hour, minute, second, day-of-week (1=Monday…7=Sunday),
/// fractions256, adjust_reason (0 = manual/time set).
#[must_use]
pub fn encode_current_time_local() -> [u8; 10] {
    let n = Local::now().naive_local();
    let mut b = [0u8; 10];
    let year = n.year() as u16;
    b[0..2].copy_from_slice(&year.to_le_bytes());
    b[2] = n.month() as u8;
    b[3] = n.day() as u8;
    b[4] = n.hour() as u8;
    b[5] = n.minute() as u8;
    b[6] = n.second() as u8;
    b[7] = n.weekday().num_days_from_monday() as u8 + 1;
    b[8] = 0;
    b[9] = 0;
    b
}
