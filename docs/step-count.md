# Kongle daily step count

Kongle 0.4 sensor builds expose the InfiniTime step-count UUID as a read-only
little-endian u32. Furu's existing `ble.dis_steps` reader and minute polling
work for both firmwares. Built-in Kongle profiles include that feature; on
older firmware it can be disabled in Device Profiles. Custom profiles opt in.

Kongle returns unavailable until its clock has been synchronized and a valid
sensor sample belongs to the current date. Furu clears the previous count if a
read fails, so an old day's total or disconnected sensor is not shown as fresh
data. Stale BLE database caches may need Repair connection after an ST-Link
flash that adds the Motion Service.

This is a partial daily total kept in watch RAM; reboot resets it. Counts before
initial time sync and batches crossing a date correction/midnight are retained
as undated on the watch, rather than assigned to a guessed date. Daily counts
are never increments to add up on the phone. The watch retains three date
buckets to avoid losing/doubling recent totals on backward clock corrections.

Hardware gates: send current time, verify a counted walk appears on both watch
and phone, sleep the screen, reconnect, and test a disposable clock correction
on the dev unit. Accuracy and battery results are still pending; a successful
shaking test is only proof that the sensor counter responds. The development
unit's heart-rate sensor is missing, so HR tests require a closed watch later.
