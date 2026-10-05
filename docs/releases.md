# Android builds and Kongle firmware feed

Every Furu PR builds a debug APK in CI. Download the `furu-dev-pr-*` artifact
from its Actions run; it installs as **Furu Dev** alongside the normal Furu app
and bundles its frontend for offline use. PR artifacts are short-lived.

Tagging a reviewed commit publishes a signed Android APK and AAB plus a
SHA-256 file and changelog to GitHub Releases. `vX.Y.Z-rc.N` publishes a
prerelease from `main`, and `vX.Y.Z` publishes a stable release from `main`.
PR previews remain unsigned Furu Dev APKs in Actions artifacts so PR code never
receives Android signing secrets. The base
version must match `package.json`, `src-tauri/tauri.conf.json`, and
`src-tauri/Cargo.toml`. The suffix labels the GitHub release; the installed
Android app reports the base version. The signed APK uses the same app ID and
key as the installed normal Furu app, so it can update that app. CI currently
builds arm64 Android packages.

The tagged-release workflow needs these repository secrets before it can sign:
`ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`,
and `ANDROID_KEY_PASSWORD`. See [Android signing](android-signing.md). Never
commit or paste the keystore or its passwords into a PR. A PR debug APK needs
none of these secrets. After configuring them, run the workflow manually once
and install its signed APK on a test phone to verify it upgrades the existing
Furu installation.

Release notes use [git-cliff](https://git-cliff.org/) and the repository's
`cliff.toml`. Prefer concise `feat:`, `fix:`, and `docs:` PR titles or squash
commit subjects. Preview notes with:

```bash
devenv shell -- git-cliff --unreleased --tag vX.Y.Z --config cliff.toml
```

The device page retrieves published Kongle GitHub Releases directly. By
default it shows stable firmware. Settings → Firmware channel opts into RCs
and explicitly tagged PR previews. Furu downloads only a Kongle-named DFU ZIP
under its size limit, checks the SHA-256 digest reported by GitHub, then uses
the normal battery confirmation and DFU validation. It never flashes just
because a release appeared. The local file picker remains available for
InfiniTime or unpublished packages. If offline, the catalog shows an error but
the local picker still works. A successful transfer is an activation request;
check the firmware version after reconnecting, and remember that Kongle trial
firmware remains unconfirmed and can revert on reset.
