// Keep in sync with the native parser's limits in dfu_package.rs.
export const DFU_FILE_LIMITS = {
  "package.zip": 2 * 1024 * 1024,
  "firmware.bin": 0x74000 - 16,
  "init.dat": 20,
} as const;

/** Bound memory and native reads even for content URIs with unknown/changing sizes. */
export async function readBoundedDfuFile(
  file: { read(buffer: Uint8Array): Promise<number | null> },
  maxBytes: number,
): Promise<Uint8Array> {
  const bytes = new Uint8Array(maxBytes + 1);
  let length = 0;
  while (length <= maxBytes) {
    const count = await file.read(bytes.subarray(length));
    if (count === null || count === 0) return bytes.subarray(0, length);
    length += count;
  }
  throw new Error(`Selected DFU file exceeds the ${maxBytes}-byte size limit.`);
}
