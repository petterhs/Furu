# Agent notes for Furu

Concise context for AI assistants and contributors working in this repository.

## What this project is

Cross-platform **Tauri 2** companion app for **PineTime** / **PineTime Pro** (target), with BLE as the main transport. Long-term intent: support **InfiniTime**, **Kongle**, **Wasp-os**, and similar firmwares. The app and docs are **WIP**.

## Stack

| Layer | Notes |
|-------|--------|
| Shell | **Tauri 2** (`src-tauri/`), Rust 2021 |
| UI | **SvelteKit** + **Svelte 5** (`src/`), `ssr = false`, static adapter |
| Package manager | **pnpm** |
| BLE | **`tauri-plugin-blec`** + **`@mnlphlp/plugin-blec`** ([plugin repo](https://github.com/MnlPhlp/tauri-plugin-blec)) |
| Environment | **devenv** + **direnv** (`.envrc`); use `devenv shell` before `cargo` / `pnpm` if tools are not on PATH |

## BLE architecture (current)

- **Scan, connect, disconnect, permissions** are driven from the **frontend** via `@mnlphlp/plugin-blec` (same connection the Rust side sees).
- **Rust** (`src-tauri/src/ble/`) holds **feature IDs**, **app profiles**, a small **session** (active profile), **GATT constants** (`registry.rs`), and **Tauri commands** (`commands.rs`)—e.g. `ble_poc_send_string` / `ble_poc_read_string` for bring-up.
- New product behaviour (time sync, DFU, HR, …) should grow as **Rust modules** calling `tauri_plugin_blec::get_handler()`, not as ad-hoc UUIDs in Svelte.

## Documentation and single source of truth

- **`docs/features/README.md`** — Taxonomy: SIG standard vs InfiniTime vendor vs firmware-specific (Kongle, Wasp, …).
- **`docs/features/catalog.md`** — **Feature definitions** table + **firmware capability matrix** (✓ / — for InfiniTime, Kongle, Wasp-os). **Do not rename published feature IDs**; add new ones.
- **`src/lib/bleContract.ts`** — TypeScript mirror of profile IDs and feature ID strings for the UI.
- **`src-tauri/src/ble/feature_id.rs`** — Rust `FeatureId` enum; `as_str()` must stay aligned with the catalog and `bleContract.ts`.

When you add or change a capability: update **catalog**, **Rust `FeatureId`**, and **`bleContract.ts`** together unless the change is explicitly Rust-only internal.

## App profiles (not firmware names)

`ProfileId` in Rust / TS is for **in-app** gating and UX (`unknown`, `infinitime_placeholder`, …). **Firmware support** is documented in the catalog’s **firmware matrix**, not by overloading profile names.

## Android / Nix

- **`src-tauri/tauri.conf.json`** — `bundle.android.minSdkVersion` is **26** (required by `tauri-plugin-blec`).
- **`devenv.nix`** — Android **platforms 36 and 34** (plugin library targets API 34; app uses 36).
- Generated Gradle under `src-tauri/gen/android/`; syncing `compileSdk` / `targetSdk` with `devenv.nix` comments avoids surprise SDK installs.

## Commands (quick reference)

```bash
devenv shell   # if needed
pnpm check     # Svelte / TS
cd src-tauri && cargo build
pnpm tauri dev
```

## Licence

**MIT** — see [LICENSE](LICENSE).
