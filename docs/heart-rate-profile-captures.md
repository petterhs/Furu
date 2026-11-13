# Heart-rate test capture filenames

The capture page reads the current watch's Firmware Revision at recording start.
The export filename includes that revision/hash and every configuration observed
in nonempty measuring diagnostics packets. Read failures and recordings without
configuration data are explicitly named `unknown`; cached values from another
watch are not substituted. Idle snapshots from a previous attempt are ignored.

Kongle's opt-in `hr-test-profiles` firmware emits 20-byte diagnostic version 4.
The high nibble of byte 5 identifies profile 0=A (gain 2, 12.5 mA), 1=B (gain 4,
12.5 mA), 2=C (gain 2, 20 mA), or 3=D (gain 4, 20 mA). The low 12 bits across
bytes 4–5 still encode sample count. Version 3 contains gain in the high nibble;
its LED selection is not encoded and is exported as unknown. These values are
LED drive settings, not measured whole-watch current.

A recording may include multiple watch-started measurements/profiles. Filenames
include all observed profiles, and CSV rows append `firmware_revision`, `profile`,
`gain`, and `led_current_ma` while retaining `t_ms,source,hex`. JSON adds metadata
without changing the raw sample list shape. No raw bytes are altered and nothing
is uploaded. Profile changes are made on the watch, not over BLE from Furu.

Run the pure metadata tests with `node --test tests/heart-rate-capture-metadata.test.mjs`
inside `devenv shell`, followed by `pnpm check` and `pnpm build`.
