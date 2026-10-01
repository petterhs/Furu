import { get, writable } from "svelte/store";

/** App-wide lock for DFU from package selection until the operation finishes. */
export const dfuInProgress = writable(false);
export const dfuCancelable = writable(false);
let bleMutationInProgress = false;

export function beginDfuSession(): boolean {
  if (get(dfuInProgress) || bleMutationInProgress) return false;
  dfuInProgress.set(true);
  return true;
}

export function endDfuSession(): void {
  dfuCancelable.set(false);
  dfuInProgress.set(false);
}

export function setDfuCancelable(cancelable: boolean): void {
  dfuCancelable.set(cancelable);
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
