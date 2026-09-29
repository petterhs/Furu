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

The recovered DFU implementation remains experimental. Follow-up work must resolve the skipped DFU validation command, derive packet sizes from the negotiated MTU rather than assuming 244 bytes on Android, select matching BIN/DAT files from package metadata, and verify the installed version after reboot. Transfer progress is not proof that a new firmware version was permanently accepted.
