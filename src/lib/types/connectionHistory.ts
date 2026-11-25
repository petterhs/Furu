export type ConnectionHistoryEvent = {
  at: string;
  nativeId?: number;
  connected: boolean;
  /** Last successful native link observation, never a battery sample timestamp. */
  observedUntil?: string;
  /** Short note for logs / debugging (e.g. user vs link lost). */
  detail?: string;
};

export type ConnectionHistoryByDevice = Record<string, ConnectionHistoryEvent[]>;

export type ConnectionHistorySegment = {
  startMs: number;
  endMs: number;
  connected: boolean | null;
};
