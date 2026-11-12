# Kongle on-demand pulse

The Kongle HR development builds (`feature/heart-rate`) expose the existing
`ble.hr` feature over the standard SIG Heart Rate Service. The built-in Kongle
profile now includes `ble.hr` and `ble.dis_steps`; custom profiles may opt in.

Subscription or read does **not** start a measurement. Tap the heart field on the
watch, then Measure. There is no automatic background mode.

## Receiving readings

Furu takes live notifications only while the watch has a usable pulse signal.
An invalid zero clears the current value when measurement stops or the signal is
lost, and cached watch readings are never replayed as fresh phone measurements.
Furu's staleness timer also clears a stream that stops arriving.

Contact bits follow the [SIG Heart Rate Service](https://www.bluetooth.com/wp-content/uploads/Files/Specification/HTML/HRS_v1.0/out/en/index-en.html):
**bit 2** indicates support, **bit 1** detection. The parser previously read them
the wrong way round; regression tests now cover every combination plus Kongle's
unsupported-contact payload.

Kongle currently sends **flags `0x00`** — contact reporting unsupported — with the
rate in byte 1, or `[0x00, 0x00]` while not measuring. The idle zero falls outside
the plausible range and therefore surfaces as "no reading" rather than 0 bpm.

## Raw capture for offline analysis

Settings → Diagnostics → **Heart-rate capture** records every characteristic
notification with a millisecond timestamp, then exports CSV or JSON. Use it when
readings look wrong or never arrive.

It subscribes to two streams:

| Stream | UUID | Payload |
|--------|------|---------|
| Measurement | `0x2A37` | SIG flags + 8/16-bit rate |
| Diagnostics | `6b6f180d-…-0001` | 20 bytes: version, phase, BPM, error, sample count and gain, PPG and ambient counters, one-second min/max, elapsed ms |

It also reads `6b6f180d-…-0002` (quality/confidence) once at start. If the vendor
characteristics are absent — non-Kongle firmware — capture says so and continues
with measurements only. The buffer holds 20 000 samples in memory; nothing is
uploaded and the file is written wherever the save dialog points.

CSV columns are `t_ms,source,hex`, one row per sample, with bytes verbatim. That
is deliberate: the analysis should see the firmware's idle pattern rather than a
filtered view.

Filenames use **local** time, and the JSON header records `startedAt` with an
explicit offset plus `startedAtUtc` and the `timezone` name. An earlier UTC-only
name made a 01:12 local capture look like it predated a 00:44 commit.

To judge a capture without a spreadsheet:

```bash
node scripts/analyse-hr-capture.mjs docs/furu-hr-capture-*.csv
```

It prints the reading timeline and then states whether a flat optical waveform
(the signal) or the estimator's thresholds explain the gaps — a flat second has a
1 s PPG window span under 2 counts, where no algorithm could find a pulse.

## Diagnosing "no readings"

1. Connect, then start a capture, then start Measure on the watch.
2. Open Logs and look for `HR: notification [..]`.
   - Only `HR: notifications enabled (0x2A37)` and no notification lines means no
     packets arrived: subscription succeeded but the watch never notified.
   - Lines with `[00 00] -> no valid reading` mean packets arrive but the estimator
     is reporting idle.
3. For comparison, subscribe to `0x2A37` directly in nRF Connect. If that also
   yields nothing, the issue is in firmware acquisition, not Furu.
4. For implausible rates, capture a complete stationary measurement and analyse
   the diagnostics counters offline.

## Validation status

`HR: notifications enabled` only proves subscription setup returned successfully.
The development watch has no HR sensor, so real operation, optical quality,
comparison against a reference and LED shutdown must be checked on a closed
device before this is considered validated. Step counts on Kongle depend on the
same sensor bus work and are reported separately in [the step-count notes](step-count.md).
