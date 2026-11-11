/**
 * Pure helpers behind the device history cards.
 *
 * These lived inline in the 1000-line device page, which made them impossible to
 * unit test. They have no Svelte or DOM dependencies.
 */

export type RangeKey = "3h" | "1d" | "3d" | "7d";

export const RANGE_MS: Record<RangeKey, number> = {
  "3h": 3 * 60 * 60 * 1000,
  "1d": 24 * 60 * 60 * 1000,
  "3d": 3 * 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
};

export const RANGE_LABELS: { key: RangeKey; label: string }[] = [
  { key: "3h", label: "3H" },
  { key: "1d", label: "1D" },
  { key: "3d", label: "3D" },
  { key: "7d", label: "1W" },
];

/** Samples further apart than this start a new chart segment. */
export const GAP_THRESHOLD_MS = 15 * 60_000;

/** Splits a time series at gaps so no line implies data that was never recorded. */
export function splitAtGaps<T extends { time: Date }>(points: readonly T[]): T[][] {
  const segments: T[][] = [];
  for (const point of points) {
    const current = segments.at(-1);
    const previous = current?.at(-1);
    if (!current || !previous || point.time.getTime() - previous.time.getTime() > GAP_THRESHOLD_MS) {
      segments.push([point]);
    } else {
      current.push(point);
    }
  }
  return segments;
}

/** Counts gaps so the UI can explain a broken line. */
export function countGaps(points: readonly { at: string }[]): number {
  let gaps = 0;
  for (let index = 1; index < points.length; index += 1) {
    if (Date.parse(points[index].at) - Date.parse(points[index - 1].at) > GAP_THRESHOLD_MS) {
      gaps += 1;
    }
  }
  return gaps;
}

/** Compact weekday label, e.g. "Sun 12", which fits narrow phone screens. */
export function formatShortDayLabel(date: Date): string {
  const weekday = date.toLocaleDateString(undefined, { weekday: "short" });
  return `${weekday} ${date.getDate()}`;
}

export function formatClock(ms: number): string {
  const date = new Date(ms);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export function formatTimelineAxisTick(ms: number, range: RangeKey): string {
  return range === "7d" ? formatShortDayLabel(new Date(ms)) : formatClock(ms);
}

/** Local calendar-day bands used for the date row above the timeline. */
export function connectionTimelineDayBands(
  startMs: number,
  endMs: number,
  range: RangeKey,
): { start: number; end: number; label: string }[] {
  const bands: { start: number; end: number; label: string }[] = [];
  const first = new Date(startMs);
  let cursor = new Date(first.getFullYear(), first.getMonth(), first.getDate()).getTime();
  const compact = range === "7d";
  while (cursor < endMs) {
    const next = cursor + 24 * 60 * 60 * 1000;
    const segStart = Math.max(startMs, cursor);
    const segEnd = Math.min(endMs, next);
    if (segEnd > segStart) {
      bands.push({
        start: segStart,
        end: segEnd,
        label: compact
          ? formatShortDayLabel(new Date(cursor))
          : new Date(cursor).toLocaleDateString(undefined, {
              weekday: "short",
              month: "short",
              day: "numeric",
            }),
      });
    }
    cursor = next;
  }
  return bands;
}

/** Grid ticks at local midnights stepped every `hours` from `startMs`. */
export function connectionTimelineHourGridTicks(
  startMs: number,
  endMs: number,
  hours: number,
): number[] {
  const start = new Date(startMs);
  const startOfDay = new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime();
  const step = hours * 60 * 60 * 1000;
  let cursor = startOfDay;
  while (cursor + step <= startMs) cursor += step;
  while (cursor < startMs) cursor += step;
  const out: number[] = [];
  while (cursor <= endMs) {
    out.push(cursor);
    cursor += step;
  }
  return out;
}

/** Vertical lines at each local midnight, used for the 1-week range. */
export function connectionTimelineDayBoundaryTicks(startMs: number, endMs: number): number[] {
  const start = new Date(startMs);
  let cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime();
  if (cursor < startMs) cursor += 24 * 60 * 60 * 1000;
  const out: number[] = [];
  while (cursor <= endMs) {
    out.push(cursor);
    cursor += 24 * 60 * 60 * 1000;
  }
  return out;
}

export function timelineGridStepHours(range: RangeKey): number | null {
  if (range === "3h") return 1;
  if (range === "1d") return 4;
  if (range === "3d") return 8;
  return null;
}

export function timelineTicksFor(range: RangeKey, startMs: number, endMs: number): number[] {
  if (range === "7d") return connectionTimelineDayBoundaryTicks(startMs, endMs);
  return connectionTimelineHourGridTicks(startMs, endMs, range === "3h" ? 1 : range === "3d" ? 8 : 4);
}

/** Thins dense tick labels so they do not overlap on a phone. */
export function timelineTickLabelStep(tickCount: number): number {
  if (tickCount > 36) return 3;
  if (tickCount > 22) return 2;
  return 1;
}

/** Percentage-positioned bands for the charging strip under the battery chart. */
export function chargingSegments(
  samples: readonly { at: string; charging?: boolean }[],
  rangeStartMs: number,
  rangeEndMs: number,
): { left: number; width: number }[] {
  const span = Math.max(1, rangeEndMs - rangeStartMs);
  return samples.flatMap((sample, index) => {
    if (!sample.charging) return [];
    const start = Date.parse(sample.at);
    const next = index + 1 < samples.length ? Date.parse(samples[index + 1].at) : rangeEndMs;
    const end = Math.min(next, start + GAP_THRESHOLD_MS, rangeEndMs);
    if (end <= start) return [];
    return [
      {
        left: Math.max(0, ((start - rangeStartMs) / span) * 100),
        width: ((end - start) / span) * 100,
      },
    ];
  });
}
