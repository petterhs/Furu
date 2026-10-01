#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
pnpm install --frozen-lockfile
pnpm check
node --test tests/dfuFile.test.mjs
pnpm build
rustfmt --check --edition 2021 src-tauri/src/ble/nordic_dfu.rs src-tauri/src/ble/dfu_package.rs
cargo test --locked --manifest-path src-tauri/Cargo.toml --lib
cargo clippy --locked --manifest-path src-tauri/Cargo.toml --lib
