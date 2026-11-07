import { get, writable } from "svelte/store";
import { BleOperationGate } from "$lib/bleOperationGate";

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
const operationGate = new BleOperationGate();
export const bleOperationsReleased = writable(0);
let dfuAbortController: AbortController | null = null;

export function beginDfuSession(deviceId: string, deviceName: string): boolean {
  if (!operationGate.beginDfu()) return false;
  dfuAbortController = new AbortController();
  dfuSession.set({ deviceId, deviceName, phase: "selecting_package", percent: 0, outcome: "running", error: null });
  dfuInProgress.set(true);
  dfuCancelable.set(true);
  return true;
}

export function endDfuSession(): void {
  operationGate.endDfu();
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
  return operationGate.beginMutation();
}

export function endBleMutation(): void {
  operationGate.endMutation();
  bleOperationsReleased.update((revision) => revision + 1);
}

export function beginCapabilityUpdate(connectionFinalization: boolean): boolean {
  return operationGate.beginCapabilities(connectionFinalization);
}

export function endCapabilityUpdate(): void {
  operationGate.endCapabilities();
  bleOperationsReleased.update((revision) => revision + 1);
}
