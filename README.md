# Furu

> **furu** *n.*, *m.* /'fʉːɾʉ/  
> **Norwegian → English:** pine; Scots pine (*Pinus sylvestris*); the pine tree.

**Warning:** Furu is experimental and work in progress. Expect rough edges, missing features, and breaking changes.

Furu aims to be a cross-platform companion app for the [PineTime](https://wiki.pine64.org/wiki/PineTime) and, when it ships, the PineTime Pro. The long-term idea is to work well with several community firmwares; that support is not in place yet.

Firmwares we intend to support (links for context):

- [InfiniTime](https://github.com/InfiniTimeOrg/InfiniTime)
- [Kongle](https://github.com/petterhs/Kongle) — Rust firmware for the PineTime
- [Wasp-os](https://github.com/wasp-os/wasp-os)

### BLE feature status (summary)

| Name | Status |
|------|:------:|
| Device Info | ✅ |
| Current Time | ✅ |
| Battery | ✅ |
| Heart Rate | ✅ |
| Notifications | ✅ |
| Steps | ✅ |
| DFU / OTA | ⚠️ |
| Companion UART | ❌ |
| Kongle (placeholder) | ❌ |
| Wasp-os (placeholder) | ❌ |

✅ done · ⚠️ partial · ❌ not implemented — see [**docs/features/catalog.md**](docs/features/catalog.md) for feature IDs, GATT details, and firmware matrix.

## License

MIT. See [LICENSE](LICENSE).

## Development and recovery baseline

Run checks inside `devenv shell`: `pnpm check`, `pnpm build`, and `cargo check --locked --manifest-path src-tauri/Cargo.toml`. After a devenv CLI upgrade, `devenv update devenv` updates its pinned modules independently of the other inputs. Submit changes on feature branches through PRs to `main` for maintainer review.

The maintainer has tested OTA from Furu to a development PineTime running InfiniTime with the standard bootloader, including rollback to InfiniTime when the trial firmware was not confirmed. This does not establish Kongle-to-Kongle OTA support: Kongle still needs a DFU receiver and image confirmation.

The DFU sender uses Nordic legacy application packages, 20-byte writes on all platforms, packet receipt checks, and device validation before activation. ZIP files must contain `manifest.json` naming one application BIN/DAT pair; bootloader and mixed packages are rejected. Raw BIN/DAT pairs are also accepted. Files are bounded and their CRC must match before BLE writes begin. Cancellation is best-effort; allow the watch to leave update mode before retrying.

Run `cargo test --locked --manifest-path src-tauri/Cargo.toml --lib` for package and mock-transport regression tests. CI runs these tests and the frontend checks on PRs and pushes to `main`. It does not flash a watch.

Furu reports activation requested, not a confirmed installation. Reconnect, check the version, and confirm the trial firmware on the watch. Repeat the development-device OTA and cancellation checks after protocol changes; an Android APK build and hardware transfer are separate from the desktop checks.

Run the complete CI checks locally with `devenv --profile ci shell -- bash scripts/check.sh`. This profile omits the Android SDK; the normal shell still includes Android tooling.
