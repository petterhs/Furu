export type NativeHistoryEvent = { deviceId: string; nativeId: number; at: string; connected: boolean; detail: string };
type Event = { nativeId?: number; at: string; connected: boolean; detail?: string };
/** Replay native events once, including older events delivered after WebView suspension. */
export function mergeNativeEvents(current: Record<string, Event[]>, events: NativeHistoryEvent[]): Record<string, Event[]> {
  let next = current;
  for (const event of events) {
    const existing = next[event.deviceId] ?? [];
    if (existing.some((saved) => saved.nativeId === event.nativeId)) continue;
    if (next === current) next = { ...current };
    const { deviceId, ...entry } = event;
    next[deviceId] = [...existing, entry].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  }
  return next;
}
