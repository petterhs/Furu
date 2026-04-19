export type ConnectionHistoryEvent = {
  at: string;
  connected: boolean;
  /** Short note for logs / debugging (e.g. user vs link lost). */
  detail?: string;
};

export type ConnectionHistoryByDevice = Record<string, ConnectionHistoryEvent[]>;

export type ConnectionHistorySegment = {
  startMs: number;
  endMs: number;
  connected: boolean;
};
