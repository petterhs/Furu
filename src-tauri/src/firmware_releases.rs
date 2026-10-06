//! Public Kongle GitHub releases. PR artifacts stay in Actions until deliberately tagged.

use std::time::Duration;

use reqwest::Client;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Manager};

const RELEASES_API: &str = "https://api.github.com/repos/petterhs/Kongle/releases?per_page=100";
const MAX_PACKAGE_BYTES: u64 = 2 * 1024 * 1024; // Match the DFU parser's ZIP bound.

#[derive(Deserialize)]
struct GitHubRelease {
    id: u64,
    tag_name: String,
    body: Option<String>,
    html_url: String,
    published_at: Option<String>,
    prerelease: bool,
    draft: bool,
    assets: Vec<GitHubAsset>,
}

#[derive(Deserialize)]
struct GitHubAsset {
    name: String,
    size: u64,
    digest: Option<String>,
    browser_download_url: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FirmwareRelease {
    id: u64,
    tag_name: String,
    notes: String,
    html_url: String,
    published_at: Option<String>,
    prerelease: bool,
    size: u64,
}

fn client() -> Result<Client, String> {
    Client::builder()
        .user_agent("Furu firmware updater (https://github.com/petterhs/Furu)")
        .timeout(Duration::from_secs(60))
        .build()
        .map_err(|e| format!("Firmware catalog: {e}"))
}

fn package_asset(release: &GitHubRelease) -> Option<&GitHubAsset> {
    let expected = format!("kongle-{}-dfu.zip", release.tag_name);
    release.assets.iter().find(|asset| {
        asset.name == expected
            && asset.size > 0
            && asset.size <= MAX_PACKAGE_BYTES
            && asset
                .digest
                .as_deref()
                .is_some_and(|digest| digest.starts_with("sha256:") && digest.len() == 71)
    })
}

async fn fetch_releases(client: &Client) -> Result<Vec<GitHubRelease>, String> {
    client
        .get(RELEASES_API)
        .timeout(Duration::from_secs(12))
        .header(reqwest::header::ACCEPT, "application/vnd.github+json")
        .send()
        .await
        .map_err(|e| format!("Firmware catalog: {e}"))?
        .error_for_status()
        .map_err(|e| format!("Firmware catalog: {e}"))?
        .json::<Vec<GitHubRelease>>()
        .await
        .map_err(|e| format!("Firmware catalog: invalid response: {e}"))
}

#[tauri::command]
pub async fn firmware_list_releases() -> Result<Vec<FirmwareRelease>, String> {
    let releases = fetch_releases(&client()?).await?;
    Ok(releases
        .into_iter()
        .filter_map(|release| {
            if release.draft {
                return None;
            }
            let size = package_asset(&release)?.size;
            Some(FirmwareRelease {
                id: release.id,
                tag_name: release.tag_name,
                notes: release.body.unwrap_or_default(),
                html_url: release.html_url,
                published_at: release.published_at,
                prerelease: release.prerelease,
                size,
            })
        })
        .collect())
}

#[tauri::command]
pub async fn firmware_download_release(app: AppHandle, release_id: u64) -> Result<String, String> {
    let client = client()?;
    let releases = fetch_releases(&client).await?;
    let release = releases
        .iter()
        .find(|release| release.id == release_id && !release.draft)
        .ok_or("Firmware release is no longer available")?;
    let asset = package_asset(release).ok_or("Firmware release has no verified DFU ZIP")?;
    let expected_digest = asset
        .digest
        .as_deref()
        .unwrap()
        .trim_start_matches("sha256:");

    let mut response = client
        .get(&asset.browser_download_url)
        .send()
        .await
        .map_err(|e| format!("Firmware download: {e}"))?
        .error_for_status()
        .map_err(|e| format!("Firmware download: {e}"))?;
    let mut bytes = Vec::with_capacity(asset.size as usize);
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|e| format!("Firmware download: {e}"))?
    {
        if bytes.len() + chunk.len() > MAX_PACKAGE_BYTES as usize {
            return Err("Firmware download exceeds the DFU package size limit".into());
        }
        bytes.extend_from_slice(&chunk);
    }
    if bytes.len() as u64 != asset.size {
        return Err("Firmware download size differs from the release asset".into());
    }
    let actual_digest = format!("{:x}", Sha256::digest(&bytes));
    if actual_digest != expected_digest {
        return Err("Firmware download checksum differs from the GitHub release".into());
    }

    let cache = app
        .path()
        .app_cache_dir()
        .map_err(|e| format!("Firmware cache: {e}"))?
        .join("dfu-import");
    std::fs::create_dir_all(&cache).map_err(|e| format!("Firmware cache: {e}"))?;
    let path = cache.join(format!("release-{release_id}.zip"));
    let temporary = cache.join(format!("release-{release_id}.part"));
    std::fs::write(&temporary, bytes).map_err(|e| format!("Firmware cache: {e}"))?;
    std::fs::rename(&temporary, &path).map_err(|e| format!("Firmware cache: {e}"))?;
    Ok(path.to_string_lossy().into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_checksum_bounded_dfu_zip_is_offered() {
        let release = GitHubRelease {
            id: 1,
            tag_name: "v0.3.0-rc.1".into(),
            body: None,
            html_url: String::new(),
            published_at: None,
            prerelease: true,
            draft: false,
            assets: vec![GitHubAsset {
                name: "kongle-v0.3.0-rc.1-dfu.zip".into(),
                size: 100,
                digest: Some(format!("sha256:{}", "a".repeat(64))),
                browser_download_url: String::new(),
            }],
        };
        assert!(package_asset(&release).is_some());
        let mut oversized = release;
        oversized.assets[0].size = MAX_PACKAGE_BYTES + 1;
        assert!(package_asset(&oversized).is_none());
    }
}
