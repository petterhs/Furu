// Keep in sync with the native parser's limits in dfu_package.rs.
export const DFU_FILE_LIMITS = {
  "package.zip": 2 * 1024 * 1024,
  "firmware.bin": 0x74000 - 16,
  "init.dat": 20,
} as const;

export const DFU_ABORTED = Symbol("dfu-aborted");

/** Race an operation against the app-wide cancel action without leaving an unhandled rejection. */
export function withDfuCancellation<T>(
  operation: Promise<T>,
  signal: AbortSignal,
): Promise<T | typeof DFU_ABORTED> {
  if (signal.aborted) return Promise.resolve(DFU_ABORTED);
  return new Promise((resolve, reject) => {
    const cleanup = () => signal.removeEventListener("abort", onAbort);
    const onAbort = () => {
      cleanup();
      resolve(DFU_ABORTED);
    };
    signal.addEventListener("abort", onAbort, { once: true });
    operation.then(
      (value) => {
        cleanup();
        resolve(value);
      },
      (error: unknown) => {
        cleanup();
        reject(error);
      },
    );
  });
}

/** Bound memory and native reads even for content URIs with unknown/changing sizes. */
export async function readBoundedDfuFile(
  file: { read(buffer: Uint8Array): Promise<number | null> },
  maxBytes: number,
  options: { signal?: AbortSignal; onProgress?: (bytesRead: number) => void } = {},
): Promise<Uint8Array> {
  const bytes = new Uint8Array(maxBytes + 1);
  let length = 0;
  while (length <= maxBytes) {
    const read = options.signal
      ? await withDfuCancellation(file.read(bytes.subarray(length)), options.signal)
      : await file.read(bytes.subarray(length));
    if (read === DFU_ABORTED) throw new Error("DFU_CANCELLED");
    const count = read;
    if (count === null || count === 0) return bytes.subarray(0, length);
    length += count;
    options.onProgress?.(length);
  }
  throw new Error(`Selected DFU file exceeds the ${maxBytes}-byte size limit.`);
}
