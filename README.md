# Furu

> **furu** *n.*, *m.* /'fʉːɾʉ/  
> **Norwegian → English:** pine; Scots pine (*Pinus sylvestris*); the pine tree.

**Warning:** Furu is experimental and work in progress. Expect rough edges, missing features, and breaking changes.

Furu aims to be a cross-platform companion app for the [PineTime](https://wiki.pine64.org/wiki/PineTime) and, when it ships, the PineTime Pro. The long-term idea is to work well with several community firmwares; that support is not in place yet.

Firmwares we intend to support (links for context):

- [InfiniTime](https://github.com/InfiniTimeOrg/InfiniTime)
- [Kongle](https://github.com/petterhs/Kongle) — Rust firmware for the PineTime
- [Wasp-os](https://github.com/wasp-os/wasp-os)

## Android Release Candidates

This repository includes a GitHub Actions workflow for signed Android release candidates:

- Workflow: `.github/workflows/android-release-candidate.yml`
- Triggers: manual dispatch and `v*` tags
- Outputs: signed APK + AAB artifacts

Required GitHub repository secrets:

- `ANDROID_KEYSTORE_BASE64`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`

See [docs/android-signing.md](docs/android-signing.md) for full setup, local signing, and first-run validation steps.

## License

MIT. See [LICENSE](LICENSE).
