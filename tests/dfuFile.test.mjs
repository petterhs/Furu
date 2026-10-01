import assert from "node:assert/strict";
import test from "node:test";
import { readBoundedDfuFile, DFU_FILE_LIMITS, DFU_ABORTED, withDfuCancellation } from "../src/lib/dfuFile.ts";

function reader(data, chunkSize = Infinity) {
  let offset = 0;
  return {
    async read(buffer) {
      if (offset === data.length) return null;
      const count = Math.min(buffer.length, chunkSize, data.length - offset);
      buffer.set(data.subarray(offset, offset + count));
      offset += count;
      return count;
    },
  };
}

test("retains short reads and accepts an exact-limit file", async () => {
  const data = Uint8Array.from([1, 2, 3, 4]);
  assert.deepEqual(await readBoundedDfuFile(reader(data, 1), 4), data);
});

test("rejects oversized streams after reading only limit + 1 bytes", async () => {
  for (const limit of Object.values(DFU_FILE_LIMITS)) {
    let total = 0;
    const infiniteFile = { async read(buffer) { total += buffer.length; return buffer.length; } };
    await assert.rejects(readBoundedDfuFile(infiniteFile, limit), /size limit/);
    assert.equal(total, limit + 1);
  }
});

test("accepts EOF without spinning and propagates read errors", async () => {
  assert.equal((await readBoundedDfuFile(reader(new Uint8Array()), 20)).length, 0);
  assert.equal((await readBoundedDfuFile({ async read() { return 0; } }, 20)).length, 0);
  await assert.rejects(readBoundedDfuFile({ async read() { throw new Error("read failed"); } }, 20), /read failed/);
});

test("cancels a pending picker operation", async () => {
  const controller = new AbortController();
  const pending = withDfuCancellation(new Promise(() => {}), controller.signal);
  controller.abort();
  assert.equal(await pending, DFU_ABORTED);
});

test("cancels a pending file read", async () => {
  const controller = new AbortController();
  const pending = readBoundedDfuFile({ read() { return new Promise(() => {}); } }, 20, {
    signal: controller.signal,
  });
  controller.abort();
  await assert.rejects(pending, /DFU_CANCELLED/);
});
