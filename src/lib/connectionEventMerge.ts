export type NativeHistoryEvent = { deviceId: string; nativeId: number; at: string; connected: boolean; observedUntil?: string; detail: string };
type Event = { nativeId?: number; at: string; connected: boolean; observedUntil?: string; detail?: string };
/** Replay native events once, including older events delivered after WebView suspension. */
export function mergeNativeEvents(current: Record<string, Event[]>, events: NativeHistoryEvent[]): Record<string, Event[]> {
  let next = current;
  for (const event of events) {
    const existing = next[event.deviceId] ?? [];
    const index = existing.findIndex(saved => saved.nativeId === event.nativeId);
    if (index >= 0) {
      const saved = existing[index];
      const observed = Date.parse(event.observedUntil ?? "");
      const previous = Date.parse(saved.observedUntil ?? saved.at);
      if (saved.at === event.at && saved.connected && event.connected && Number.isFinite(observed) && observed > previous) {
        if (next === current) next = { ...current };
        const updated = existing.slice();
        updated[index] = { ...saved, observedUntil: event.observedUntil };
        next[event.deviceId] = updated;
      }
      continue;
    }
    if (next === current) next = { ...current };
    const { deviceId, ...entry } = event;
    next[deviceId] = [...existing, entry].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  }
  return next;
}
