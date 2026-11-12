import assert from "node:assert/strict";
import test from "node:test";
import { localFileStamp, localIsoWithOffset } from "../src/lib/utils/timestamp.ts";

/**
 * Capture filenames must be in the reader's local time. A UTC name previously
 * made a 01:12 CET capture look like it predated a 00:44 commit, which led to a
 * wrong conclusion about which firmware had been tested.
 */

// A fixed instant: 2026-11-12 00:12:20 UTC.
const instant = new Date(Date.UTC(2026, 10, 12, 0, 12, 20));

/** Runs `fn` with TZ set, restoring the previous value. */
function withTimeZone(tz, fn) {
  const previous = process.env.TZ;
  process.env.TZ = tz;
  try {
    fn();
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
}

test("filename stamp uses local wall-clock time, not UTC", () => {
  withTimeZone("Europe/Oslo", () => {
    // 00:12 UTC is 01:12 in Oslo (CET, UTC+1).
    assert.equal(localFileStamp(instant), "2026-11-12T01-12-20");
  });
});

test("filename stamp is unchanged in a UTC timezone", () => {
  withTimeZone("UTC", () => {
    assert.equal(localFileStamp(instant), "2026-11-12T00-12-20");
  });
});

test("filename stamp handles a zone behind UTC, including the date", () => {
  withTimeZone("America/New_York", () => {
    // 00:12 UTC is 19:12 the previous day in EST (UTC-5).
    assert.equal(localFileStamp(instant), "2026-11-11T19-12-20");
  });
});

test("filename stamp contains no characters invalid on a filesystem", () => {
  const stamp = localFileStamp(instant);
  assert.doesNotMatch(stamp, /[:.]/);
  assert.match(stamp, /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}$/);
});

test("ISO with offset states the zone so the instant is unambiguous", () => {
  withTimeZone("Europe/Oslo", () => {
    assert.equal(localIsoWithOffset(instant), "2026-11-12T01:12:20+01:00");
  });
});

test("ISO with offset handles negative offsets", () => {
  withTimeZone("America/New_York", () => {
    assert.equal(localIsoWithOffset(instant), "2026-11-11T19:12:20-05:00");
  });
});

test("ISO with offset uses Z-equivalent zero offset in UTC", () => {
  withTimeZone("UTC", () => {
    assert.match(localIsoWithOffset(instant), /\+00:00$/);
  });
});

test("the local and UTC representations denote the same instant", () => {
  withTimeZone("Europe/Oslo", () => {
    const local = localIsoWithOffset(instant);
    assert.equal(Date.parse(local), instant.getTime());
    assert.equal(Date.parse(instant.toISOString()), instant.getTime());
  });
});
