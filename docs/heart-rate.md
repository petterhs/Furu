# Kongle on-demand pulse

The Kongle HR development build supports the existing `ble.hr` feature and SIG
Heart Rate Service. The built-in Kongle profile includes it; custom profiles
may opt in. Subscription/read does not start a measurement: tap the heart field
on the watch, then Measure. There is no automatic background mode.

Furu receives live notifications only while the watch has a usable pulse signal.
Invalid zero clears the current value when stopped or signal is lost. Cached
watch readings are not replayed as fresh phone measurements. Furu's existing
staleness timer also clears a stream that stops arriving. The watch separately
retains a last-reading value and age.

Contact bits follow the [SIG Heart Rate Service](https://www.bluetooth.com/wp-content/uploads/Files/Specification/HTML/HRS_v1.0/out/en/index-en.html):
bit 2 indicates support and bit 1 detection. The parser previously swapped them;
regression tests cover all combinations and Kongle's unsupported-contact payload.
Kongle does not claim skin-contact detection from an unvalidated optical model.

The dev watch has no HR sensor. Real operation, optical quality, comparison
against a reference and LED shutdown must be checked on a closed device before
this feature is considered validated. The firmware provides a 20-byte read/notify
diagnostic characteristic `6b6f180d-1886-4b40-ae7d-00a11ce50001` under HR for
raw values/status via nRF Connect when RTT is unavailable.

The diagnostic app build logs each HR read/notification as raw hex plus its
parsing result (`72 BPM` or `no valid reading`). `notifications enabled` only
means subscription setup returned successfully; it does not prove that samples
arrived. Initial-read errors are recorded too. HR subscription teardown/setup is
serialized: a stale async subscribe finishing late cannot unsubscribe a newer
listener for the same characteristic. An obsolete callback is still ignored.

After installing this build, connect and start Measure on the watch. Inspect
Logs for `HR: notification [00 ..]` versus only the initial read/setup message.
If no packets arrive, compare with an explicit 0x2a37 subscription in nRF
Connect. For implausible rates, subscribe to the custom firmware diagnostic
stream during a complete stationary measurement and export the nRF log for
waveform analysis. Signal quality and BLE delivery are separate hardware checks.
