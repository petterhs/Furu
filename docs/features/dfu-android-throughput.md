# Android DFU transfer throughput

## Status

Planned investigation and optimization. No transfer behavior has changed as part of this note.

## Problem

On Android, an InfiniTime application update of roughly 386 KB took about five minutes to transfer in a maintainer test. File selection/staging also appeared to take 30–60 seconds before the transfer began; measure that separately rather than attributing it to BLE throughput.

Furu currently transfers firmware in 20-byte packets with packet receipt notifications (PRNs) every 10 packets. In [`src-tauri/src/ble/nordic_dfu.rs`](../../src-tauri/src/ble/nordic_dfu.rs), `BleTransport::packet` awaits `tauri_plugin_blec::Handler::send_data` for every packet, and `transfer` awaits each `packet` call in its loop. On Android, each call crosses from Rust through the BLE plugin into Kotlin and waits for the write callback before the next packet. This per-packet cross-language call and wait is the likely throughput cost.

## What Gadgetbridge does

Gadgetbridge's PineTime integration delegates DFU to Nordic's Android DFU library. The PineTime handler inspected in the [Gadgetbridge source mirror/fork](https://github.com/Tubbles/Gadgetbridge/blob/master/app/src/main/java/nodomain/freeyourgadget/gadgetbridge/service/devices/pinetime/PineTimeJFSupport.java) explicitly calls `.disableMtuRequest()` when it creates the DFU service. The official Gadgetbridge mirror also shows the PineTime integration importing Nordic's `DfuServiceInitiator` ([example commit](https://gitea.it/Freeyourgadget/Gadgetbridge/commit/bb1df116508cd931932701c8c7c2cd1b7e14f8b8)).

Nordic's library defaults to a 20-byte packet buffer in [`BaseDfuImpl.java`](https://github.com/NordicSemiconductor/Android-DFU-Library/blob/main/lib/dfu/src/main/java/no/nordicsemi/android/dfu/BaseDfuImpl.java). It can resize that buffer to `MTU - 3` after an MTU change, but Gadgetbridge disables the DFU MTU request, so the PineTime path uses the 20-byte default. The likely speed difference is therefore the native write path, not larger packets: Nordic's [`BaseCustomDfuImpl.writePacket`](https://github.com/NordicSemiconductor/Android-DFU-Library/blob/main/lib/dfu/src/main/java/no/nordicsemi/android/dfu/BaseCustomDfuImpl.java) issues write-without-response and returns after queuing the write; its native callback continues the transfer. Furu currently makes an awaited Rust/plugin call for each individual packet.

These observations describe the linked Gadgetbridge source and Nordic library versions; re-check them if either dependency changes.

## Suggested feature

Add an Android-native DFU packet sender that removes the Rust-to-Kotlin plugin round trip from the per-packet hot path while keeping the existing Rust DFU state machine authoritative.

The first implementation should accept a small ordered batch of firmware packets (at most the current PRN window of 10) through one Tauri/mobile-plugin call. Kotlin should own a callback-driven queue for the batch: issue each write-without-response, advance on its Android GATT write callback, then resolve or reject the single batch call. Rust should wait for that batch result and then process the existing PRN before starting the next batch. This reduces cross-language calls without sending multiple GATT writes concurrently or bypassing Android's write sequencing.

Keep these safety and compatibility properties:

- Keep each packet at or below 20 bytes unless the InfiniTime receiver implementation is inspected and hardware-tested to support a larger value. Do not infer DFU payload size from a negotiated ATT MTU.
- Preserve packet order, byte counts, PRN validation, cancellation checks, progress events, and error propagation.
- Never send validation or activation after cancellation, a failed write, a disconnect, a missing receipt, or a byte-count mismatch.
- Ensure the native queue has one owner per connection/characteristic and cannot overwrite another in-flight write. Do not implement batching by concurrently calling the existing plugin `send_data`; its Android implementation tracks a pending invoke per characteristic.
- Keep the existing non-Android transport unchanged unless a separate platform design is made.

An alternative is to integrate Nordic's Android DFU library directly through an Android Tauri plugin and let it own the complete transfer. Compare that integration cost with the smaller batch-sender before choosing; avoid maintaining two independent protocol state machines if the native library can report all progress, cancellation, validation, and failure states Furu needs.

## Work plan and acceptance

1. Add phase timings for picker return, Android URI read/cache staging, native package parsing, BLE setup, packet transfer, validation, and activation. Record durations and byte counts only; do not log file paths or firmware contents.
2. Record a baseline on the same phone, watch, firmware ZIP, and connection conditions, separating staging time from BLE transfer time.
3. Implement the Android-native sender behind the existing Rust `Transport` abstraction. Keep the current sequential sender available for other platforms and as a fallback if needed.
4. Add tests for packet ordering, batch boundaries, PRN receipt accounting, cancellation between batches, and propagation of native write failure/disconnect. Use the fake `Transport` tests for protocol behavior and Android tests/manual device runs for callback sequencing.
5. Repeat the same hardware benchmark at least three times. Accept the change only if it measurably reduces transfer time without changing image bytes, DFU outcomes, or cancellation/error behavior.

## Useful source locations

- Furu packet size, PRN setting, and transfer loop: [`nordic_dfu.rs`](../../src-tauri/src/ble/nordic_dfu.rs)
- Furu Android BLE write bridge: [`tauri-plugin-blec Android implementation`](https://github.com/MnlPhlp/tauri-plugin-blec/blob/main/android/src/main/java/Peripheral.kt)
- Gadgetbridge PineTime DFU setup: [PineTimeJFSupport.java](https://github.com/Tubbles/Gadgetbridge/blob/master/app/src/main/java/nodomain/freeyourgadget/gadgetbridge/service/devices/pinetime/PineTimeJFSupport.java)
- Nordic Android DFU packet sizing and MTU handling: [BaseDfuImpl.java](https://github.com/NordicSemiconductor/Android-DFU-Library/blob/main/lib/dfu/src/main/java/no/nordicsemi/android/dfu/BaseDfuImpl.java)
- Nordic Android DFU asynchronous packet writes: [BaseCustomDfuImpl.java](https://github.com/NordicSemiconductor/Android-DFU-Library/blob/main/lib/dfu/src/main/java/no/nordicsemi/android/dfu/BaseCustomDfuImpl.java)
- Nordic legacy DFU transfer and PRN handling: [LegacyDfuImpl.java](https://github.com/NordicSemiconductor/Android-DFU-Library/blob/main/lib/dfu/src/main/java/no/nordicsemi/android/dfu/LegacyDfuImpl.java)
