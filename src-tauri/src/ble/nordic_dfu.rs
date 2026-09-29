//! InfiniTime's Nordic legacy application DFU protocol, not Nordic Secure DFU.
//! https://github.com/InfiniTimeOrg/InfiniTime/blob/main/doc/ble.md#firmware-upgrades

use super::registry;
use serde::Serialize;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use tauri_plugin_blec::{models::WriteType, Handler};
use tokio::sync::mpsc;
use tokio::time::Instant;
#[path = "dfu_package.rs"]
mod package;
pub use package::load_dfu_image;
use package::DfuImage;

// InfiniTime's flash writer requires <=20 bytes even after MTU negotiation.
const PACKET_SIZE: usize = 20;
const PRN: usize = 10;
const CP_TIMEOUT: Duration = Duration::from_secs(120);
const CANCEL_POLL: Duration = Duration::from_millis(100);
static DFU_CANCEL: AtomicBool = AtomicBool::new(false);
static DFU_LOCK: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

pub fn start_session() -> Result<tokio::sync::MutexGuard<'static, ()>, String> {
    let guard = DFU_LOCK
        .try_lock()
        .map_err(|_| "DFU: an update is already running")?;
    DFU_CANCEL.store(false, Ordering::SeqCst);
    Ok(guard)
}

/// The receiver times out after cancellation; never activate an incomplete image.
pub fn request_dfu_cancel() {
    DFU_CANCEL.store(true, Ordering::SeqCst);
}

fn check_cancel(cancel: &AtomicBool) -> Result<(), String> {
    if cancel.load(Ordering::SeqCst) {
        Err("DFU: cancelled; wait for the watch to leave update mode before retrying".into())
    } else {
        Ok(())
    }
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DfuProgressPayload {
    phase: String,
    percent: u8,
}

// Test the actual transfer sequence without a Bluetooth adapter or Tauri window.
trait Transport {
    async fn control(&mut self, data: &[u8], with_response: bool) -> Result<(), String>;
    async fn packet(&mut self, data: &[u8]) -> Result<(), String>;
    async fn receive(&mut self) -> Result<Vec<u8>, String>;
}

struct BleTransport<'a> {
    handler: &'a Handler,
    rx: mpsc::Receiver<Vec<u8>>,
    overflow: std::sync::Arc<AtomicBool>,
}

impl Transport for BleTransport<'_> {
    async fn control(&mut self, data: &[u8], with_response: bool) -> Result<(), String> {
        self.handler
            .send_data(
                registry::NORDIC_DFU_CONTROL_POINT_CHAR_UUID,
                Some(registry::NORDIC_DFU_SERVICE_UUID),
                data,
                if with_response {
                    WriteType::WithResponse
                } else {
                    WriteType::WithoutResponse
                },
            )
            .await
            .map_err(|e| e.to_string())
    }
    async fn packet(&mut self, data: &[u8]) -> Result<(), String> {
        self.handler
            .send_data(
                registry::NORDIC_DFU_PACKET_CHAR_UUID,
                Some(registry::NORDIC_DFU_SERVICE_UUID),
                data,
                WriteType::WithoutResponse,
            )
            .await
            .map_err(|e| e.to_string())
    }
    async fn receive(&mut self) -> Result<Vec<u8>, String> {
        if self.overflow.load(Ordering::SeqCst) {
            return Err("DFU: too many control point notifications".into());
        }
        self.rx
            .recv()
            .await
            .ok_or_else(|| "DFU: control point channel closed".into())
    }
}

// One deadline covers the whole operation, including irrelevant notifications.
async fn receive_before<T: Transport>(
    t: &mut T,
    deadline: Instant,
    cancel: &AtomicBool,
) -> Result<Vec<u8>, String> {
    loop {
        check_cancel(cancel)?;
        let remaining = deadline.saturating_duration_since(Instant::now());
        if remaining.is_zero() {
            return Err("DFU: timeout waiting for control point response".into());
        }
        match tokio::time::timeout(remaining.min(CANCEL_POLL), t.receive()).await {
            Ok(result) => return result,
            Err(_) => continue,
        }
    }
}

fn response(data: &[u8], opcode: u8) -> Result<bool, String> {
    match data {
        [0x10, actual, status] => {
            if *status != 1 {
                return Err(format!(
                    "DFU: device rejected opcode 0x{actual:02x} (status 0x{status:02x})"
                ));
            }
            if *actual != opcode {
                return Err(format!("DFU: unexpected response to opcode 0x{actual:02x}"));
            }
            Ok(true)
        }
        [0x11, _, _, _, _] => Ok(false), // final receipt can precede transfer completion
        _ => Err(format!("DFU: malformed control point response {data:02x?}")),
    }
}

async fn expect_response<T: Transport>(
    t: &mut T,
    opcode: u8,
    cancel: &AtomicBool,
) -> Result<(), String> {
    let deadline = Instant::now() + CP_TIMEOUT;
    loop {
        if response(&receive_before(t, deadline, cancel).await?, opcode)? {
            return Ok(());
        }
    }
}

async fn expect_receipt<T: Transport>(
    t: &mut T,
    sent: usize,
    cancel: &AtomicBool,
) -> Result<(), String> {
    let data = receive_before(t, Instant::now() + CP_TIMEOUT, cancel).await?;
    match data.as_slice() {
        [0x11, a, b, c, d] => {
            let received = u32::from_le_bytes([*a, *b, *c, *d]) as usize;
            if received != sent { return Err(format!("DFU: byte count mismatch (sent {sent}, device reported {received})")); }
            Ok(())
        }
        [0x10, opcode, status] => Err(format!("DFU: unexpected response while transferring (opcode 0x{opcode:02x}, status 0x{status:02x})")),
        _ => Err("DFU: malformed packet receipt".into()),
    }
}

async fn transfer<T: Transport>(
    t: &mut T,
    image: DfuImage,
    cancel: &AtomicBool,
    progress: impl Fn(&str, u8) -> Result<(), String>,
) -> Result<(), String> {
    check_cancel(cancel)?;
    progress("starting", 0)?;
    t.control(&[0x01, 0x04], true).await?;
    let mut size = [0u8; 12];
    size[8..].copy_from_slice(&(image.firmware.len() as u32).to_le_bytes());
    t.packet(&size).await?;
    expect_response(t, 0x01, cancel).await?;
    progress("init_packet", 5)?;
    t.control(&[0x02, 0x00], true).await?;
    // InfiniTime parses the complete legacy init packet in one write.
    t.packet(&image.init_dat).await?;
    t.control(&[0x02, 0x01], true).await?;
    expect_response(t, 0x02, cancel).await?;
    t.control(&[0x08, PRN as u8, 0x00], true).await?;
    t.control(&[0x03], true).await?;
    let total = image.firmware.len();
    let mut sent = 0;
    for (index, chunk) in image.firmware.chunks(PACKET_SIZE).enumerate() {
        check_cancel(cancel)?;
        t.packet(chunk).await?;
        sent += chunk.len();
        if index % 8 == 0 || sent == total {
            progress("transfer", (10 + sent * 85 / total) as u8)?;
        }
        if (index + 1) % PRN == 0 && sent < total {
            expect_receipt(t, sent, cancel).await?;
        }
    }
    expect_response(t, 0x03, cancel).await?;
    check_cancel(cancel)?;
    progress("validating", 96)?;
    t.control(&[0x04], true).await?;
    expect_response(t, 0x04, cancel).await?;
    check_cancel(cancel)?;
    progress("applying", 99)?;
    // The watch may disconnect to reboot immediately: do not await an ATT reply.
    t.control(&[0x05], false).await?;
    progress("activation_requested", 100)
}

pub async fn run_dfu(app: &AppHandle, handler: &Handler, image: DfuImage) -> Result<(), String> {
    let cp = registry::NORDIC_DFU_CONTROL_POINT_CHAR_UUID;
    let (tx, rx) = mpsc::channel(32);
    let overflow = std::sync::Arc::new(AtomicBool::new(false));
    let callback_overflow = overflow.clone();
    handler
        .subscribe(cp, Some(registry::NORDIC_DFU_SERVICE_UUID), move |data| {
            if tx.try_send(data).is_err() {
                callback_overflow.store(true, Ordering::SeqCst);
            }
        })
        .await
        .map_err(|e| format!("DFU: subscribe control point: {e}"))?;
    let mut transport = BleTransport {
        handler,
        rx,
        overflow,
    };
    let result = transfer(&mut transport, image, &DFU_CANCEL, |phase, percent| {
        app.emit(
            "dfu-progress",
            DfuProgressPayload {
                phase: phase.into(),
                percent,
            },
        )
        .map_err(|e| e.to_string())
    })
    .await;
    let _ = handler.unsubscribe(cp).await;
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::VecDeque;
    #[derive(Default)]
    struct Mock {
        replies: VecDeque<Vec<u8>>,
        writes: Vec<(bool, Vec<u8>, bool)>,
    }
    impl Transport for Mock {
        async fn control(&mut self, data: &[u8], response: bool) -> Result<(), String> {
            self.writes.push((true, data.to_vec(), response));
            Ok(())
        }
        async fn packet(&mut self, data: &[u8]) -> Result<(), String> {
            self.writes.push((false, data.to_vec(), false));
            Ok(())
        }
        async fn receive(&mut self) -> Result<Vec<u8>, String> {
            match self.replies.pop_front() {
                Some(data) => Ok(data),
                None => std::future::pending().await,
            }
        }
    }
    fn image() -> DfuImage {
        DfuImage {
            firmware: vec![42; 221],
            init_dat: vec![0; 14],
        }
    }
    fn mock(status: u8) -> Mock {
        Mock {
            replies: vec![
                vec![0x10, 1, 1],
                vec![0x10, 2, 1],
                vec![0x11, 200, 0, 0, 0],
                vec![0x10, 3, 1],
                vec![0x10, 4, status],
            ]
            .into(),
            ..Mock::default()
        }
    }
    #[tokio::test]
    async fn validates_before_activation_and_uses_20_byte_packets() {
        let mut device = mock(1);
        transfer(&mut device, image(), &AtomicBool::new(false), |_, _| Ok(()))
            .await
            .unwrap();
        let control: Vec<_> = device
            .writes
            .iter()
            .filter(|w| w.0)
            .map(|w| (w.1.clone(), w.2))
            .collect();
        assert_eq!(
            control,
            vec![
                (vec![1, 4], true),
                (vec![2, 0], true),
                (vec![2, 1], true),
                (vec![8, 10, 0], true),
                (vec![3], true),
                (vec![4], true),
                (vec![5], false)
            ]
        );
        let packets: Vec<_> = device.writes.iter().filter(|w| !w.0).collect();
        assert_eq!(&packets[0].1[8..], &221u32.to_le_bytes());
        assert!(packets.iter().all(|w| w.1.len() <= 20 && !w.2));
        assert_eq!(packets.last().unwrap().1.len(), 1);
    }
    #[tokio::test]
    async fn failed_validation_never_activates() {
        let mut device = mock(5);
        assert!(
            transfer(&mut device, image(), &AtomicBool::new(false), |_, _| Ok(()))
                .await
                .unwrap_err()
                .contains("status 0x05")
        );
        assert!(!device.writes.iter().any(|w| w.0 && w.1 == [5]));
    }
    #[tokio::test]
    async fn truncated_or_wrong_receipts_abort() {
        for receipt in [vec![0x11], vec![0x11, 199, 0, 0, 0]] {
            let mut device = mock(1);
            device.replies[2] = receipt;
            assert!(
                transfer(&mut device, image(), &AtomicBool::new(false), |_, _| Ok(()))
                    .await
                    .is_err()
            );
            assert!(!device.writes.iter().any(|w| w.0 && w.1 == [5]));
        }
    }
    #[tokio::test]
    async fn cancellation_before_activation_never_activates() {
        let cancel = AtomicBool::new(false);
        let mut device = mock(1);
        let result = transfer(&mut device, image(), &cancel, |phase, _| {
            if phase == "validating" {
                cancel.store(true, Ordering::SeqCst);
            }
            Ok(())
        })
        .await;
        assert!(result.unwrap_err().contains("cancelled"));
        assert!(!device.writes.iter().any(|w| w.0 && w.1 == [5]));
    }
    #[tokio::test(start_paused = true)]
    async fn missing_response_times_out() {
        assert!(
            expect_response(&mut Mock::default(), 1, &AtomicBool::new(false))
                .await
                .unwrap_err()
                .contains("timeout")
        );
    }
    #[test]
    fn rejects_malformed_and_error_responses() {
        for data in [
            &[0x10, 4][..],
            &[0x10, 4, 1, 0],
            &[0x10, 4, 5],
            &[0x10, 3, 1],
        ] {
            assert!(response(data, 4).is_err());
        }
    }
    #[test]
    fn serializes_sessions_and_releases_guard() {
        let session = start_session().unwrap();
        assert!(start_session().is_err());
        drop(session);
        assert!(start_session().is_ok());
    }
}
