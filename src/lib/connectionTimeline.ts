import type { ConnectionHistoryEvent, ConnectionHistorySegment } from './types/connectionHistory';

/** Missing observations are unknown; watch battery backfill is never link evidence. */
export function connectionSegmentsForRange(events: readonly ConnectionHistoryEvent[], start: number, end: number): ConnectionHistorySegment[] {
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return [];
  const sorted = events.filter(e => Number.isFinite(Date.parse(e.at)))
    .slice().sort((a,b) => Date.parse(a.at) - Date.parse(b.at));
  const result: ConnectionHistorySegment[] = [];
  function add(a: number, b: number, connected: boolean | null) {
    a = Math.max(a,start); b = Math.min(b,end);
    if (b <= a) return;
    const last = result.at(-1);
    if (last && last.endMs === a && last.connected === connected) last.endMs = b;
    else result.push({startMs:a,endMs:b,connected});
  }
  add(start, sorted.length ? Date.parse(sorted[0].at) : end, null);
  for (let i=0;i<sorted.length;i++) {
    const event=sorted[i]; const at=Date.parse(event.at);
    const until=i+1<sorted.length ? Date.parse(sorted[i+1].at) : end;
    if (!event.connected) { add(at,until,false); continue; }
    // Legacy transition-only events cannot prove an open-ended connection.
    const observed=event.observedUntil ? Date.parse(event.observedUntil) : at;
    const confirmed=Number.isFinite(observed) ? Math.max(at,Math.min(observed,until)) : at;
    add(at,confirmed,true); add(confirmed,until,null);
  }
  return result;
}
