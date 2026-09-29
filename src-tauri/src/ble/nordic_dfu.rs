//! Nordic Secure DFU over BLE (InfiniTime `doc/ble.md` sequence). Same GATT for InfiniTime, Wasp-os, Kongle.

use std::io::Read;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use serde::Serialize;
use tauri::AppHandle;
use tauri::Emitter;
use tauri_plugin_blec::models::WriteType;
use tauri_plugin_blec::Handler;
use tokio::sync::mpsc;

use super::registry;

/// Minimum payload per Nordic DFU **packet characteristic** write (matches default ATT MTU 23 ⇒ 20-byte payload).
const DFU_PAYLOAD_MIN: usize = 20;
/// Practical upper bound for one ATT write payload after MTU exchange (ATT MTU 247 ⇒ 244; common phone↔watch cap).
const DFU_PAYLOAD_CAP: usize = 244;

/// Effective bytes per DFU packet write (`None` ⇒ [`DFU_PAYLOAD_MIN`]). Should be ≤ negotiated ATT_MTU − 3.
fn dfu_segment_len(packet_payload_max: Option<u8>) -> usize {
    match packet_payload_max {
        Some(n) => (n as usize).clamp(DFU_PAYLOAD_MIN, DFU_PAYLOAD_CAP),
        None => DFU_PAYLOAD_MIN,
    }
}
/// Packet Receipt Notification count — must match `0x08` second byte. Higher = fewer 0x11 waits (faster) if the
/// boot loader honors it; InfiniTime often uses 10. Increase together with `RECEIPT_INTERVAL_SEGMENTS` only.
const PRN: u8 = 10;
const RECEIPT_INTERVAL_SEGMENTS: usize = PRN as usize;
const RECV_SLICE: Duration = Duration::from_millis(300);
const CP_TIMEOUT: Duration = Duration::from_secs(120);

static DFU_CANCEL: AtomicBool = AtomicBool::new(false);

/// Clear cancel flag. Call at the start of a new DFU session.
pub fn reset_dfu_cancel() {
    DFU_CANCEL.store(false, Ordering::SeqCst);
}

/// User requested abort (e.g. Cancel in UI). Best-effort: checked between packet writes and in recv waits.
pub fn request_dfu_cancel() {
    DFU_CANCEL.store(true, Ordering::SeqCst);
}

fn dfu_canceled() -> bool {
    DFU_CANCEL.load(Ordering::SeqCst)
}

fn err_if_canceled() -> Result<(), String> {
    if dfu_canceled() {
        return Err("DFU: cancelled by user".to_string());
    }
    Ok(())
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DfuProgressPayload {
    pub phase: String,
    pub percent: u8,
}

pub struct DfuImage {
    pub firmware: Vec<u8>,
    pub init_dat: Vec<u8>,
}

/// Load firmware + init packet from a ZIP (any `.bin` / `.dat` entries) or from two paths.
pub fn load_dfu_image(
    zip_path: Option<&Path>,
    firmware_bin_path: Option<&Path>,
    init_dat_path: Option<&Path>,
) -> Result<DfuImage, String> {
    if let Some(z) = zip_path {
        return load_from_zip(z);
    }
    let bin = firmware_bin_path.ok_or("DFU: missing firmware .bin path")?;
    let dat = init_dat_path.ok_or("DFU: missing init .dat path")?;
    let firmware = std::fs::read(bin).map_err(|e| format!("DFU: read firmware: {e}"))?;
    let init_dat = std::fs::read(dat).map_err(|e| format!("DFU: read init .dat: {e}"))?;
    if firmware.is_empty() {
        return Err("DFU: firmware file is empty".to_string());
    }
    if init_dat.is_empty() {
        return Err("DFU: init packet is empty".to_string());
    }
    Ok(DfuImage { firmware, init_dat })
}

fn load_from_zip(path: &Path) -> Result<DfuImage, String> {
    let file = std::fs::File::open(path).map_err(|e| format!("DFU: open zip: {e}"))?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| format!("DFU: zip: {e}"))?;
    let mut bins: Vec<(String, Vec<u8>)> = Vec::new();
    let mut dats: Vec<(String, Vec<u8>)> = Vec::new();
    for i in 0..archive.len() {
        let mut file = archive.by_index(i).map_err(|e| format!("DFU: zip entry {e}"))?;
        if file.is_dir() {
            continue;
        }
        let name = file.name().to_string();
        let lower = name.to_lowercase();
        let mut buf = Vec::new();
        file.read_to_end(&mut buf).map_err(|e| format!("DFU: read zip entry: {e}"))?;
        if lower.ends_with(".dat") {
            dats.push((name, buf));
        } else if lower.ends_with(".bin") {
            bins.push((name, buf));
        }
    }
    if dats.is_empty() {
        return Err("DFU: zip: no .dat file found".to_string());
    }
    if bins.is_empty() {
        return Err("DFU: zip: no .bin file found".to_string());
    }
    dats.sort_by(|a, b| a.0.cmp(&b.0));
    bins.sort_by(|a, b| b.1.len().cmp(&a.1.len()));
    let init_dat = dats[0].1.clone();
    let mut bin_choice = None;
    for (name, data) in &bins {
        let n = name.to_lowercase();
        if n.contains("bootloader") {
            continue;
        }
        bin_choice = Some(data.clone());
        break;
    }
    let firmware = bin_choice.unwrap_or_else(|| bins[0].1.clone());
    Ok(DfuImage { firmware, init_dat })
}

fn emit(app: &AppHandle, phase: &str, percent: u8) -> Result<(), String> {
    app.emit(
        "dfu-progress",
        DfuProgressPayload {
            phase: phase.to_string(),
            percent,
        },
    )
    .map_err(|e| e.to_string())
}

/// One control-point notification, or an error. Uses short inner timeouts so `request_dfu_cancel` can be honored during long waits.
async fn recv_cp(rx: &mut mpsc::UnboundedReceiver<Vec<u8>>) -> Result<Vec<u8>, String> {
    let start = std::time::Instant::now();
    loop {
        err_if_canceled()?;
        if start.elapsed() > CP_TIMEOUT {
            return Err("DFU: timeout waiting for control point notification".to_string());
        }
        match tokio::time::timeout(RECV_SLICE, rx.recv()).await {
            Ok(Some(data)) => return Ok(data),
            Ok(None) => return Err("DFU: control point channel closed".to_string()),
            Err(_) => continue, // slice timeout — re-check cancel / wall timeout
        }
    }
}

async fn expect_cp_exact(
    rx: &mut mpsc::UnboundedReceiver<Vec<u8>>,
    expected: &[u8],
) -> Result<(), String> {
    for _ in 0..128 {
        let data = recv_cp(rx).await?;
        if data == expected {
            return Ok(());
        }
        if data.len() >= expected.len() && data[..expected.len()] == *expected {
            return Ok(());
        }
    }
    Err(format!(
        "DFU: timeout waiting for control point response {expected:?}"
    ))
}

async fn cp_write(handler: &Handler, data: &[u8]) -> Result<(), String> {
    err_if_canceled()?;
    handler
        .send_data(
            registry::NORDIC_DFU_CONTROL_POINT_CHAR_UUID,
            Some(registry::NORDIC_DFU_SERVICE_UUID),
            data,
            WriteType::WithResponse,
        )
        .await
        .map_err(|e| e.to_string())
}

async fn pkt_write(handler: &Handler, data: &[u8], without_response: bool) -> Result<(), String> {
    err_if_canceled()?;
    handler
        .send_data(
            registry::NORDIC_DFU_PACKET_CHAR_UUID,
            Some(registry::NORDIC_DFU_SERVICE_UUID),
            data,
            if without_response {
                WriteType::WithoutResponse
            } else {
                WriteType::WithResponse
            },
        )
        .await
        .map_err(|e| e.to_string())
}

async fn run_dfu_body(
    app: &AppHandle,
    handler: &Handler,
    rx: &mut mpsc::UnboundedReceiver<Vec<u8>>,
    image: DfuImage,
    segment_len: usize,
) -> Result<(), String> {
    emit(app, "starting", 0)?;

    let fw_size = image.firmware.len() as u32;
    let mut size_buf = [0u8; 12];
    size_buf[8..12].copy_from_slice(&fw_size.to_le_bytes());

    cp_write(handler, &[0x01, 0x04]).await?;
    pkt_write(handler, &size_buf, false).await?;
    expect_cp_exact(rx, &[0x10, 0x01, 0x01]).await?;

    emit(app, "init_packet", 5)?;

    cp_write(handler, &[0x02, 0x00]).await?;
    for chunk in image.init_dat.chunks(segment_len) {
        pkt_write(handler, chunk, false).await?;
    }
    cp_write(handler, &[0x02, 0x01]).await?;
    expect_cp_exact(rx, &[0x10, 0x02, 0x01]).await?;

    emit(app, "priming", 10)?;

    cp_write(handler, &[0x08, PRN]).await?;
    cp_write(handler, &[0x03]).await?;

    let total = image.firmware.len();
    let mut sent = 0usize;
    let mut seg_in_batch = 0usize;
    let chunks: Vec<&[u8]> = image.firmware.chunks(segment_len).collect();
    let total_chunks = chunks.len();

    for (idx, chunk) in chunks.iter().enumerate() {
        err_if_canceled()?;
        pkt_write(handler, chunk, true).await?;
        sent += chunk.len();
        seg_in_batch += 1;

        let pct = (sent.saturating_mul(90) / total.max(1)) as u8 + 10;
        if idx % 8 == 0 || idx + 1 == total_chunks {
            emit(app, "transfer", pct.min(99))?;
        }

        if seg_in_batch >= RECEIPT_INTERVAL_SEGMENTS && idx + 1 < total_chunks {
            let mut got = false;
            for _ in 0..50 {
                let data = recv_cp(rx).await?;
                if !data.is_empty() && data[0] == 0x11 {
                    if data.len() >= 5 {
                        let recv = u32::from_le_bytes(data[1..5].try_into().unwrap());
                        if recv as usize != sent {
                            return Err(format!(
                                "DFU: byte count mismatch (sent {sent}, device reported {recv})"
                            ));
                        }
                    }
                    got = true;
                    break;
                }
            }
            if !got {
                return Err("DFU: missing 0x11 receipt after packet batch".to_string());
            }
            seg_in_batch = 0;
        }
    }

    expect_cp_exact(rx, &[0x10, 0x03, 0x01]).await?;

    // Skip validate (0x04): device may reboot or drop GATT before the app can read the response; activate still applies the image.
    err_if_canceled()?;
    emit(app, "applying", 99)?;
    cp_write(handler, &[0x05]).await?;

    emit(app, "done", 100)?;
    Ok(())
}

/// Run Nordic DFU (blocking until done or error). Emits `dfu-progress` events.
///
/// `packet_payload_max`: optional ATT payload length per DFU packet write (clamped `20…244`). Larger values need a
/// prior MTU exchange; **tauri-plugin-blec** requests high MTU on Android connect — passing `244` there can cut transfer time.
pub async fn run_dfu(
    app: &AppHandle,
    handler: &Handler,
    image: DfuImage,
    packet_payload_max: Option<u8>,
) -> Result<(), String> {
    let segment_len = dfu_segment_len(packet_payload_max);
    let svc = Some(registry::NORDIC_DFU_SERVICE_UUID);
    let cp = registry::NORDIC_DFU_CONTROL_POINT_CHAR_UUID;

    let _ = handler.unsubscribe(cp).await;

    let (tx, mut rx) = mpsc::unbounded_channel::<Vec<u8>>();
    handler
        .subscribe(
            cp,
            svc,
            move |data| {
                let _ = tx.send(data);
            },
        )
        .await
        .map_err(|e| format!("DFU: subscribe control point: {e}"))?;

    let result = run_dfu_body(app, handler, &mut rx, image, segment_len).await;
    let _ = handler.unsubscribe(cp).await;
    result
}
