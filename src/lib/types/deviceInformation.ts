/** Mirror of Rust `ble::dis::DeviceInformation` / `ble_read_device_information` IPC. */
export type DeviceInformation = {
  manufacturerName: string | null;
  modelNumber: string | null;
  serialNumber: string | null;
  firmwareRevision: string | null;
  hardwareRevision: string | null;
  softwareRevision: string | null;
};
