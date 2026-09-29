//! Bounded loading of application-only Nordic legacy DFU packages.
use std::collections::HashSet;
use std::io::{Cursor, Read, Seek};
use std::path::Path;

// PineTime's application slot minus its boot magic. The receiver writes the magic.
const MAX_FIRMWARE: usize = 0x74000 - 16;
const MAX_INIT: usize = 20;
const MAX_MANIFEST: usize = 16 * 1024;

#[derive(Debug)]
pub struct DfuImage {
    pub firmware: Vec<u8>,
    pub init_dat: Vec<u8>,
}

fn read_bounded(reader: impl Read, limit: usize) -> Result<Vec<u8>, String> {
    let mut data = Vec::new();
    reader
        .take(limit as u64 + 1)
        .read_to_end(&mut data)
        .map_err(|e| format!("DFU: read package: {e}"))?;
    if data.is_empty() || data.len() > limit {
        return Err(format!("DFU: file must contain 1..={limit} bytes"));
    }
    Ok(data)
}

fn crc16(data: &[u8]) -> u16 {
    let mut crc = 0xffffu16;
    for byte in data {
        crc ^= (*byte as u16) << 8;
        for _ in 0..8 {
            crc = if crc & 0x8000 != 0 {
                (crc << 1) ^ 0x1021
            } else {
                crc << 1
            };
        }
    }
    crc
}

fn validate(firmware: Vec<u8>, init_dat: Vec<u8>) -> Result<DfuImage, String> {
    if firmware.is_empty() || firmware.len() > MAX_FIRMWARE {
        return Err("DFU: invalid firmware size".into());
    }
    if !(14..=MAX_INIT).contains(&init_dat.len()) {
        return Err("DFU: expected a legacy init packet of 14..=20 bytes".into());
    }
    let sd_count = u16::from_le_bytes([init_dat[8], init_dat[9]]) as usize;
    if sd_count == 0 || init_dat.len() != 12 + sd_count * 2 {
        return Err("DFU: malformed legacy init packet".into());
    }
    let offset = init_dat.len() - 2;
    let expected = u16::from_le_bytes([init_dat[offset], init_dat[offset + 1]]);
    if crc16(&firmware) != expected {
        return Err("DFU: firmware CRC does not match the init packet".into());
    }
    Ok(DfuImage { firmware, init_dat })
}

pub fn load_dfu_image(
    zip: Option<&Path>,
    bin: Option<&Path>,
    dat: Option<&Path>,
) -> Result<DfuImage, String> {
    match (zip, bin, dat) {
        (Some(path), None, None) => {
            load_zip(std::fs::File::open(path).map_err(|e| format!("DFU: open ZIP: {e}"))?)
        }
        (None, Some(bin), Some(dat)) => validate(
            read_bounded(
                std::fs::File::open(bin).map_err(|e| format!("DFU: open firmware: {e}"))?,
                MAX_FIRMWARE,
            )?,
            read_bounded(
                std::fs::File::open(dat).map_err(|e| format!("DFU: open init packet: {e}"))?,
                MAX_INIT,
            )?,
        ),
        _ => Err("DFU: choose either one ZIP or a BIN/DAT pair".into()),
    }
}

fn load_zip(reader: impl Read + Seek) -> Result<DfuImage, String> {
    let mut archive = zip::ZipArchive::new(Cursor::new(read_bounded(reader, 2 * 1024 * 1024)?))
        .map_err(|e| format!("DFU: ZIP: {e}"))?;
    if archive.len() > 128 {
        return Err("DFU: too many ZIP entries".into());
    }
    let mut names = HashSet::new();
    for index in 0..archive.len() {
        let entry = archive
            .by_index(index)
            .map_err(|e| format!("DFU: ZIP entry: {e}"))?;
        if !names.insert(entry.name().to_string()) {
            return Err("DFU: duplicate ZIP entry".into());
        }
    }
    let manifest_bytes = read_bounded(
        archive
            .by_name("manifest.json")
            .map_err(|_| "DFU: ZIP requires manifest.json; alternatively select a BIN/DAT pair")?,
        MAX_MANIFEST,
    )?;
    let document: serde_json::Value = serde_json::from_slice(&manifest_bytes)
        .map_err(|e| format!("DFU: invalid manifest: {e}"))?;
    let manifest = document
        .get("manifest")
        .and_then(|v| v.as_object())
        .ok_or("DFU: missing manifest object")?;
    if manifest.len() != 1 || !manifest.contains_key("application") {
        return Err("DFU: only application-only packages are supported".into());
    }
    let application = &manifest["application"];
    let filename = |key: &str, suffix: &str| -> Result<&str, String> {
        let name = application
            .get(key)
            .and_then(|v| v.as_str())
            .ok_or_else(|| format!("DFU: manifest missing {key}"))?;
        if !name.ends_with(suffix)
            || name.starts_with('/')
            || name.contains('\\')
            || name
                .split('/')
                .any(|p| p.is_empty() || p == "." || p == "..")
        {
            return Err(format!("DFU: invalid manifest filename {name}"));
        }
        Ok(name)
    };
    let bin = filename("bin_file", ".bin")?;
    let dat = filename("dat_file", ".dat")?;
    let firmware = read_bounded(
        archive
            .by_name(bin)
            .map_err(|_| "DFU: manifest firmware missing from ZIP")?,
        MAX_FIRMWARE,
    )?;
    let init_dat = read_bounded(
        archive
            .by_name(dat)
            .map_err(|_| "DFU: manifest init packet missing from ZIP")?,
        MAX_INIT,
    )?;
    validate(firmware, init_dat)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Cursor, Write};
    fn dat(firmware: &[u8]) -> Vec<u8> {
        let mut data = vec![0; 12];
        data[8] = 1;
        data.extend(crc16(firmware).to_le_bytes());
        data
    }
    fn archive(manifest: &str, firmware: &[u8], init: &[u8]) -> Cursor<Vec<u8>> {
        let mut zip = zip::ZipWriter::new(Cursor::new(Vec::new()));
        for (name, data) in [
            ("manifest.json", manifest.as_bytes()),
            ("app.bin", firmware),
            ("app.dat", init),
            ("unrelated.bin", &[0u8; 200]),
        ] {
            zip.start_file(name, zip::write::SimpleFileOptions::default())
                .unwrap();
            zip.write_all(data).unwrap();
        }
        zip.finish().unwrap()
    }
    const MANIFEST: &str =
        r#"{"manifest":{"application":{"bin_file":"app.bin","dat_file":"app.dat"}}}"#;
    #[test]
    fn crc_matches_standard_vector() {
        assert_eq!(crc16(b"123456789"), 0x29b1);
    }
    #[test]
    fn selects_manifest_pair_instead_of_largest_binary() {
        let fw = b"123456789";
        assert_eq!(
            load_zip(archive(MANIFEST, fw, &dat(fw))).unwrap().firmware,
            fw
        );
    }
    #[test]
    fn rejects_bad_crc_empty_and_oversized_files() {
        assert!(validate(vec![1], dat(&[2])).is_err());
        assert!(validate(vec![], dat(&[])).is_err());
        assert!(read_bounded(Cursor::new(vec![0; MAX_FIRMWARE + 1]), MAX_FIRMWARE).is_err());
        assert!(load_zip(archive(MANIFEST, &[], &dat(&[]))).is_err());
    }
    #[test]
    fn rejects_bootloader_and_missing_manifest_entries() {
        for manifest in [
            r#"{"manifest":{"bootloader":{"bin_file":"app.bin","dat_file":"app.dat"}}}"#,
            r#"{"manifest":{"application":{"bin_file":"missing.bin","dat_file":"app.dat"}}}"#,
            r#"{"manifest":{"application":{"bin_file":"../app.bin","dat_file":"app.dat"}}}"#,
            r#"{"manifest":{"application":{},"softdevice":{}}}"#,
        ] {
            assert!(load_zip(archive(manifest, &[1], &dat(&[1]))).is_err());
        }
    }
    #[test]
    fn rejects_malformed_init_packet_and_conflicting_inputs() {
        let mut init = dat(&[1]);
        init[8] = 4;
        assert!(validate(vec![1], init).is_err());
        assert!(validate(vec![1], vec![0; 10]).is_err());
        assert!(load_dfu_image(Some(Path::new("x")), Some(Path::new("y")), None).is_err());
    }
    #[test]
    fn rejects_zip_without_manifest() {
        let zip = zip::ZipWriter::new(Cursor::new(Vec::new()))
            .finish()
            .unwrap();
        assert!(load_zip(zip).unwrap_err().contains("manifest.json"));
    }
}
