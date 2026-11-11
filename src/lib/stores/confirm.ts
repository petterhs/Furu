import { writable } from "svelte/store";

export type ConfirmOptions = {
  title: string;
  /** Body copy; a string or a list of paragraphs for multi-step warnings. */
  body?: string | string[];
  confirmLabel?: string;
  cancelLabel?: string;
  /** Styles the confirm button as destructive. */
  destructive?: boolean;
};

type ConfirmRequest = ConfirmOptions & { resolve: (confirmed: boolean) => void };

/**
 * A single pending confirmation. Overlapping requests resolve the previous one
 * as cancelled, so a stray long-press cannot silently approve an action.
 */
export const pendingConfirm = writable<ConfirmRequest | null>(null);

/**
 * Promise-based confirmation backed by a Skeleton dialog.
 *
 * ```ts
 * if (await confirm({ title: "Forget watch?", destructive: true })) { … }
 * ```
 */
export function confirm(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    pendingConfirm.update((previous) => {
      previous?.resolve(false);
      return { ...options, resolve };
    });
  });
}

export function resolveConfirm(confirmed: boolean): void {
  pendingConfirm.update((pending) => {
    pending?.resolve(confirmed);
    return null;
  });
}
