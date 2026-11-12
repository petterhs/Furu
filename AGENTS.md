# Agent notes for Furu

Concise context for AI assistants and contributors working in this repository.

## What this project is

Cross-platform **Tauri 2** companion app for **PineTime** / **PineTime Pro** (target), with BLE as the main transport. Long-term intent: support **InfiniTime**, **Kongle**, **Wasp-os**, and similar firmwares. The app and docs are **WIP**.

## Stack

| Layer | Notes |
|-------|--------|
| Shell | **Tauri 2** (`src-tauri/`), Rust 2021 |
| UI | **SvelteKit 3** + **Svelte 5** (`src/`), `ssr = false`, static adapter. Kit 3 has **no `svelte.config.js`**: adapter and compiler options live in the `sveltekit()` plugin in [`vite.config.js`](vite.config.js). Imports use the **`#lib/*`** subpath alias (configured in `package.json` `imports` and `tsconfig.json` `paths`); `$lib` is removed. |
| UI theming | **Tailwind CSS v4** + **Skeleton 5** — `@tailwindcss/vite` in [`vite.config.js`](vite.config.js); global imports, the `dark` custom variant, full accent ramps and the Catppuccin overrides in [`src/app.css`](src/app.css); `data-theme="catppuccin"` and `data-mode` on `<html>` in [`src/app.html`](src/app.html). **Catppuccin Mocha is the default**; Latte is opt-in via Settings → Appearance (`appSettings.themeMode`). See [`docs/ui.md`](docs/ui.md) for the shell, navigation map and component inventory. **Conventions:** prefer **Tailwind utilities** for layout/spacing/typography; use Skeleton **utilities** (`btn`, `card`, `input`, `select`, `preset-*`, …) for surfaces and controls; reach for **`@skeletonlabs/skeleton-svelte`** primitives when they remove bespoke interactive UI (for example `Navigation` in the app shell, `Switch` for settings toggles, `Dialog` behind `ConfirmDialog`). Use the shared primitives in [`src/lib/components/ui/`](src/lib/components/ui/) instead of copying class strings, and paired color tokens (`bg-surface-50-950`) rather than arbitrary `[color:var(--…)]` syntax. Keep **scoped `<style>`** only for cases Tailwind/Skeleton cannot express cleanly. Prefer theme tokens / CSS variables over hard-coded hex colors. **Zoom is disabled** (`user-scalable=no`), so the layout must not overflow horizontally at narrow widths. |
| Package manager | **pnpm** |
| Node | **>= 22.17** — SvelteKit 3 uses `Promise.withResolvers`, so Node 20 fails at `pnpm build` during prerender with `TypeError: Promise.withResolvers is not a function`. Declared in `package.json` `engines` and used by the Android workflows. |
| BLE | **`tauri-plugin-blec`** + **`@mnlphlp/plugin-blec`** ([plugin repo](https://github.com/MnlPhlp/tauri-plugin-blec)) |
| Dialog / files | **`tauri-plugin-dialog`** + **`@tauri-apps/plugin-dialog`** — DFU file pick; **`tauri-plugin-fs`** + **`@tauri-apps/plugin-fs`** — read picked files and stage copies under **`$APPCACHE`** so Rust can `open()` real paths (e.g. Android `content://` URIs are not openable from `std::fs` alone). Capabilities include **`fs:allow-app-write-recursive`** so `mkdir` / `writeFile` under subdirs of **`$APPCACHE`** work (`fs:default`’s `create-app-specific-dirs` only covers the base app folders, not nested paths like `dfu-import/…`). |
| Environment | **devenv** + **direnv** (`.envrc`); use `devenv shell` before `cargo` / `pnpm` if tools are not on PATH |

## BLE architecture (current)

- **Connect, disconnect, reconnect and OTA pauses** are owned by `src-tauri/src/ble/connection.rs`. Frontend commands request intent and observe native snapshots; do not add a second JS retry timer. Explicit permission/Bluetooth enable dialogs run before a manual connect request. Debug scan/read tools still use `@mnlphlp/plugin-blec`. See `docs/reconnect.md`.
- **Rust** (`src-tauri/src/ble/`) owns feature gating and Nordic legacy application DFU. The UI accepts application DFU ZIPs only; `ble_dfu_flash_package` retains BIN/DAT parsing for backend compatibility. Transfers use 20-byte packets on every platform, validate on the device before activation, emit `dfu-progress`, and support best-effort cancellation. A backend session lock prevents overlapping updates. Activation requested does not mean installation confirmed.
- New product behaviour (time sync, DFU, HR, …) should grow as **Rust modules** calling `tauri_plugin_blec::get_handler()`, not as ad-hoc UUIDs in Svelte.

## Documentation and single source of truth

- **`docs/ui.md`** — shell, navigation map, theme mechanics, component inventory and Svelte conventions. Read before adding a page or control.
- **`docs/features/README.md`** — Short pointer to the feature catalog.
- **`docs/features/catalog.md`** — **Feature definitions** (names, IDs, status, GATT) + **firmware capability matrix**. **Do not rename published feature IDs**; add new ones.
- **`src/lib/bleContract.ts`** — TypeScript mirror of profile IDs and feature ID strings for the UI.
- **`src-tauri/src/ble/feature_id.rs`** — Rust `FeatureId` enum; `as_str()` must stay aligned with the catalog and `bleContract.ts`.
- **`src/lib/integrations/registry.ts`** — the provider catalogue (Home Assistant, weather, stocks, calendar, sleep) and their config fields. Every provider is `planned` until a backend exists; the UI states that plainly.
- **`src/lib/integrations/clockFields.ts`** — the bounded clock-field contract the watch will consume. Stable IDs; the watch renders at most four.

When you add or change a capability: update **catalog**, **Rust `FeatureId`**, and **`bleContract.ts`** together unless the change is explicitly Rust-only internal.

## App profiles (not firmware names)

`ProfileId` in Rust / TS is for **in-app** gating and UX (`unknown`, `infinitime`, …). **Firmware support** is documented in the catalog’s **firmware matrix**, not by overloading profile names.

**Device Profiles (Settings):** the app also persists a **device profile catalog** (`device-profiles.json` via Tauri Store): built-in and **custom** profiles, each with a user-editable **subset of known feature IDs**, plus name-detection rules for `auto`. The UI mirrors the catalog and preferences to the native connection manager; Rust applies capabilities before publishing a ready connection. **Feature ID strings** remain defined in the catalog / `bleContract.ts` / `FeatureId` — the profile editor only toggles which of those IDs apply; adding a **new** capability still requires the usual catalog + Rust + TS alignment.

## Android / Nix

- **`src-tauri/tauri.conf.json`** — `bundle.android.minSdkVersion` is **26** (required by `tauri-plugin-blec`).
- **`devenv.nix`** — Android **platforms 36 and 34** (plugin library targets API 34; app uses 36).
- Generated Gradle under `src-tauri/gen/android/`; syncing `compileSdk` / `targetSdk` with `devenv.nix` comments avoids surprise SDK installs.
- **Background BLE** — `tauri-plugin-ble-keepalive` provides the Android `connectedDevice` foreground service and disconnect notifications. Rust's connection owner drives them and retries independently of the WebView. Preferences, connection intent and recent transitions survive normal process relaunch; Android force-stop/service-only restart does not recreate the activity-bound BLE plugin. See `docs/reconnect.md` for policy and hardware checks.

## Commands (quick reference)

```bash
devenv shell   # if needed
pnpm check     # Svelte / TS
cd src-tauri && cargo build
pnpm tauri dev
```

## Version numbers

The app version must match in `package.json`, `src-tauri/tauri.conf.json` and
`src-tauri/Cargo.toml`. The lockfile's `furu` entry follows `Cargo.toml`; refresh
it from `src-tauri/` with `cargo update --offline -p furu`.

`pnpm tauri android dev` refuses to start when the **Rust crate** and **NPM
package** versions of `tauri` and each `tauri-plugin-*` disagree on major/minor.
Bumping the JS packages therefore requires matching crate updates:

```bash
cd src-tauri && cargo update \
  -p tauri -p tauri-plugin-store -p tauri-plugin-dialog \
  -p tauri-plugin-opener -p tauri-plugin-fs
```

Dev builds install as a **separate app** (`com.furu_app.dev`, "Furu Dev") so they
never collide with a signed release install. That comes from
`bundle.android.debugApplicationIdSuffix` in `tauri.conf.json`, not from editing
`src-tauri/gen/android/`. Tauri regenerates the Gradle files on every
`tauri android build`/`dev` and will silently drop hand-added lines such as
`applicationIdSuffix`; the config option is the supported path.

## Licence

**MIT** — see [LICENSE](LICENSE).

## Collaboration

Use feature branches and PRs targeting `main`; the maintainer reviews and merges manually. Use the configured Git identity without agent co-author trailers. Hardware checks use the ST-Link-connected PineTime development device; closed devices include an InfiniTime daily driver. Distinguish maintainer-reported hardware results from automated checks. Review the process after the first few PRs.
