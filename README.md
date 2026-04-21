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
| DFU / OTA | ❌ |
| Companion UART | ❌ |
| Kongle (placeholder) | ❌ |
| Wasp-os (placeholder) | ❌ |

✅ done · ⚠️ partial · ❌ not implemented — see [**docs/features/catalog.md**](docs/features/catalog.md) for feature IDs, GATT details, and firmware matrix.

## License

MIT. See [LICENSE](LICENSE).
