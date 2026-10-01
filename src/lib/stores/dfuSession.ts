import { get, writable } from "svelte/store";

export type DfuSession = {
  deviceId: string;
  deviceName: string;
  phase: string;
  percent: number;
  outcome: "running" | "success" | "error";
  error: string | null;
};

/** App-wide lock for DFU from package selection until the operation finishes. */
export const dfuInProgress = writable(false);
export const dfuCancelable = writable(false);
/** Progress and terminal result outlive the device route that started the update. */
export const dfuSession = writable<DfuSession | null>(null);
let bleMutationInProgress = false;
let dfuAbortController: AbortController | null = null;

export function beginDfuSession(deviceId: string, deviceName: string): boolean {
  if (get(dfuInProgress) || bleMutationInProgress) return false;
  dfuAbortController = new AbortController();
  dfuSession.set({ deviceId, deviceName, phase: "selecting_package", percent: 0, outcome: "running", error: null });
  dfuInProgress.set(true);
  dfuCancelable.set(true);
  return true;
}

export function endDfuSession(): void {
  dfuCancelable.set(false);
  dfuInProgress.set(false);
  dfuAbortController = null;
}

export function requestDfuCancel(): void {
  dfuAbortController?.abort();
}

export function getDfuAbortSignal(): AbortSignal | null {
  return dfuAbortController?.signal ?? null;
}

export function updateDfuProgress(phase: string, percent: number): void {
  dfuSession.update((session) =>
    session?.outcome === "running" ? { ...session, phase, percent } : session,
  );
}

export function finishDfuSession(outcome: "success" | "error", error: string | null = null): void {
  dfuSession.update((session) =>
    session ? { ...session, outcome, phase: outcome === "success" ? "complete" : "failed", error } : session,
  );
}

export function clearDfuSession(): void {
  if (!get(dfuInProgress)) dfuSession.set(null);
}

export function dismissDfuSession(): void {
  clearDfuSession();
}

export function isDfuSessionActive(): boolean {
  return get(dfuInProgress);
}

export function beginBleMutation(): boolean {
  if (get(dfuInProgress) || bleMutationInProgress) return false;
  bleMutationInProgress = true;
  return true;
}

export function endBleMutation(): void {
  bleMutationInProgress = false;
}
