<script lang="ts">
  import { ClipboardCopy, ScrollText, Trash2 } from "@lucide/svelte";
  import { logLines } from "#lib/stores/bleSession";
  import { toastError, toastSuccess } from "#lib/stores/toast";
  import EmptyState from "#lib/components/ui/EmptyState.svelte";
  import PageHeading from "#lib/components/ui/PageHeading.svelte";

  /**
   * Element reference for the scroll container, set through an attachment so
   * the effect below can depend on it without `bind:this`.
   */
  let container = $state<HTMLElement | null>(null);
  let pinnedToBottom = $state(true);

  /** Keeps the newest line visible unless the reader scrolled up. */
  $effect(() => {
    const node = container;
    const count = $logLines.length;
    if (!node || !pinnedToBottom) return;
    // Reading `count` subscribes the effect to new log lines.
    void count;
    node.scrollTop = node.scrollHeight;
  });

  function measurePinned(element: HTMLElement): void {
    const remaining = element.scrollHeight - element.scrollTop - element.clientHeight;
    pinnedToBottom = remaining < 24;
  }

  const scrollHost = (node: HTMLElement) => {
    container = node;
    const onScroll = () => measurePinned(node);
    node.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      node.removeEventListener("scroll", onScroll);
      if (container === node) container = null;
    };
  };

  async function copyLog(): Promise<void> {
    try {
      await navigator.clipboard.writeText($logLines.join("\n"));
      toastSuccess("Log copied", `${$logLines.length} lines on the clipboard.`);
    } catch (error) {
      toastError("Could not copy the log", String(error));
    }
  }

  function clearLog(): void {
    logLines.set([]);
  }
</script>

<div class="grid gap-4">
  <PageHeading
    title="Connection log"
    description="Newest messages at the bottom. Only this session is kept."
  >
    {#snippet actions()}
      <button
        class="btn btn-sm preset-tonal-surface gap-1.5"
        type="button"
        disabled={!$logLines.length}
        onclick={() => void copyLog()}
      >
        <ClipboardCopy class="size-3.5" />
        Copy
      </button>
      <button
        class="btn btn-sm preset-tonal-surface gap-1.5"
        type="button"
        disabled={!$logLines.length}
        onclick={clearLog}
      >
        <Trash2 class="size-3.5" />
        Clear
      </button>
    {/snippet}
  </PageHeading>

  {#if !$logLines.length}
    <EmptyState
      title="Nothing logged yet"
      description="Connect a watch or run a firmware update to produce log lines."
    >
      {#snippet icon()}<ScrollText class="size-10" />{/snippet}
    </EmptyState>
  {:else}
    <div
      class="card max-h-[calc(100dvh-14rem)] min-h-40 overflow-y-auto border border-surface-200-800 p-3 font-mono text-xs preset-filled-surface-950-50"
      {@attach scrollHost}
      role="log"
      aria-live="polite"
      aria-label="Connection log output"
    >
      {#each $logLines as line, index (`${index}-${line}`)}
        <div class="whitespace-pre-wrap break-words py-px">{line}</div>
      {/each}
    </div>
    {#if !pinnedToBottom}
      <button
        class="btn btn-sm preset-tonal-primary w-full justify-center"
        type="button"
        onclick={() => {
          pinnedToBottom = true;
          if (container) container.scrollTop = container.scrollHeight;
        }}
      >
        Jump to newest
      </button>
    {/if}
  {/if}
</div>
