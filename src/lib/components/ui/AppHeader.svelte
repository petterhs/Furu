<script lang="ts">
  import type { Snippet } from "svelte";
  import { ArrowLeft } from "@lucide/svelte";

  type Props = {
    /** Page title shown when the back button is not needed. */
    appName?: string;
    appVersion?: string | null;
    /** Shows a back affordance for non-root routes. */
    showBack: boolean;
    onBack: () => void;
    /** Extra content below the title row, e.g. the firmware update banner. */
    children?: Snippet;
  };

  let {
    appName = "Furu",
    appVersion = null,
    showBack,
    onBack,
    children,
  }: Props = $props();
</script>

<header
  class="sticky top-0 z-10 shrink-0 border-b border-surface-200-800 bg-surface-50-950 pt-[max(0.75rem,env(safe-area-inset-top,0px))] backdrop-blur-sm"
>
  <div class="mx-auto flex min-h-11 max-w-2xl items-center gap-3 px-4 pb-3">
    {#if showBack}
      <button
        class="btn-icon btn-sm preset-tonal-surface shrink-0"
        type="button"
        onclick={onBack}
        aria-label="Go back"
      >
        <ArrowLeft class="size-4" />
      </button>
      <span class="min-w-0 flex-1 truncate text-sm font-semibold">{appName}</span>
    {:else}
      <img src="/furu-logo.png" alt="" class="size-8 shrink-0 rounded-md" />
      <h1 class="m-0 flex-1 text-base font-semibold">{appName}</h1>
    {/if}
    {#if appVersion}
      <span class="shrink-0 font-mono text-xs text-surface-700-300">v{appVersion}</span>
    {/if}
  </div>
  {#if children}
    <div class="mx-auto max-w-2xl px-4 pb-3">{@render children()}</div>
  {/if}
</header>
