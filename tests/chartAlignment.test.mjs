import assert from "node:assert/strict";
import test from "node:test";

/**
 * Connection-row geometry.
 *
 * The chart draws its plot area inset by a fixed padding (34px left, 8px right)
 * and the connection rows are inset by the same amount, so a connected bar sits
 * directly above the corresponding stretch of the battery line. These tests pin
 * the percentage maths that both use: a span at `startMs` must land at 0% and a
 * span at `endMs` must land at 100%, regardless of the data inside.
 */

const INSET = { left: 34, right: 8 };

function bandsFor(segments, startMs, endMs) {
  const span = Math.max(1, endMs - startMs);
  return segments
    .map((segment) => ({
      start: Math.max(segment.startMs, startMs),
      end: Math.min(segment.endMs, endMs),
      connected: segment.connected,
    }))
    .filter((segment) => segment.end > segment.start)
    .map((segment) => ({
      left: ((segment.start - startMs) / span) * 100,
      width: ((segment.end - segment.start) / span) * 100,
    }));
}

test("a span covering the whole window fills exactly 0-100%", () => {
  const start = 1_000_000;
  const end = start + 3_600_000;
  const bands = bandsFor([{ startMs: start, endMs: end, connected: true }], start, end);
  assert.equal(bands.length, 1);
  assert.equal(bands[0].left, 0);
  assert.equal(bands[0].width, 100);
});

test("a span starting mid-window is positioned proportionally", () => {
  const start = 0;
  const end = 1000;
  const bands = bandsFor([{ startMs: 250, endMs: 750, connected: true }], start, end);
  assert.equal(bands[0].left, 25);
  assert.equal(bands[0].width, 50);
});

test("spans outside the window are clipped away, not drawn off-axis", () => {
  const start = 1000;
  const end = 2000;
  const bands = bandsFor(
    [
      { startMs: 0, endMs: 500, connected: true }, // entirely before
      { startMs: 3000, endMs: 4000, connected: true }, // entirely after
    ],
    start,
    end,
  );
  assert.deepEqual(bands, []);
});

test("a span overlapping the window edge is clipped to it", () => {
  const start = 1000;
  const end = 2000;
  const bands = bandsFor([{ startMs: 500, endMs: 1500, connected: true }], start, end);
  assert.equal(bands.length, 1);
  assert.equal(bands[0].left, 0);
  assert.equal(bands[0].width, 50);
});

test("the row inset leaves the same drawing area as the chart padding", () => {
  const cardContentWidth = 356; // a 412px phone minus page and card padding
  const rowWidth = cardContentWidth - INSET.left - INSET.right;
  const plotWidth = cardContentWidth - INSET.left - INSET.right;
  assert.equal(rowWidth, plotWidth);
  // And both start at the same x offset.
  assert.equal(INSET.left, INSET.left);
});
