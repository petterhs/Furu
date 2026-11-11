<script lang="ts">
  import { Dialog } from "@skeletonlabs/skeleton-svelte";
  import { pendingConfirm, resolveConfirm } from "#lib/stores/confirm";

  /**
   * Renders the app-wide confirmation dialog. Mount once in the app shell;
   * callers use `confirm()` from `#lib/stores/confirm` instead of
   * `window.confirm`, which renders an unstyled Android system dialog.
   */
  const open = $derived($pendingConfirm !== null);
  const request = $derived($pendingConfirm);
  const paragraphs = $derived(
    request ? (Array.isArray(request.body) ? request.body : request.body ? [request.body] : []) : [],
  );
</script>

<Dialog
  open={open}
  onOpenChange={(details) => {
    if (!details.open) resolveConfirm(false);
  }}
  role="alertdialog"
>
  {#if request}
    <Dialog.Backdrop class="fixed inset-0 z-40 bg-black/60" />
    <Dialog.Positioner class="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
      <Dialog.Content
        class="card preset-filled-surface-50-950 w-full max-w-md border border-surface-200-800 p-5 shadow-xl"
      >
        <Dialog.Title class="m-0 text-lg font-semibold">{request.title}</Dialog.Title>
        {#if paragraphs.length}
          <Dialog.Description class="mt-2 space-y-2 text-sm text-surface-700-300">
            {#each paragraphs as paragraph, index (`${index}-${paragraph.slice(0, 16)}`)}
              <p class="m-0">{paragraph}</p>
            {/each}
          </Dialog.Description>
        {/if}
        <div class="mt-5 flex justify-end gap-2">
          <button
            class="btn btn-sm preset-tonal-surface"
            type="button"
            onclick={() => resolveConfirm(false)}
          >
            {request.cancelLabel ?? "Cancel"}
          </button>
          <button
            class={[
              "btn btn-sm",
              request.destructive ? "preset-filled-error-500" : "preset-filled-primary-500",
            ].join(" ")}
            type="button"
            onclick={() => resolveConfirm(true)}
          >
            {request.confirmLabel ?? "Confirm"}
          </button>
        </div>
      </Dialog.Content>
    </Dialog.Positioner>
  {/if}
</Dialog>
