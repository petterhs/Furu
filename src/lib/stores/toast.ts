import { createToaster } from "@skeletonlabs/skeleton-svelte";

/**
 * Single app-wide toaster. Saves, connects and destructive actions report
 * through here so the UI never fails silently.
 */
export const toaster = createToaster({
  placement: "top",
  gap: 12,
  duration: 4000,
  overlap: false,
});

export function toastSuccess(title: string, description?: string): void {
  toaster.create({ type: "success", title, description });
}

export function toastError(title: string, description?: string): void {
  toaster.create({ type: "error", title, description });
}

export function toastInfo(title: string, description?: string): void {
  toaster.create({ type: "info", title, description });
}

/** Reports a caught value as an error toast, preferring its message. */
export function toastCaught(title: string, error: unknown): void {
  const description = error instanceof Error ? error.message : String(error);
  toastError(title, description);
}
