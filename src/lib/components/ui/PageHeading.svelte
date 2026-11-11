<script lang="ts">
  import type { Snippet } from "svelte";

  type Props = {
    /** Page title; rendered as the document's `h1`. */
    title: string;
    /** Optional supporting sentence. */
    description?: string;
    /** Trailing actions on the same row. */
    actions?: Snippet;
  };

  let { title, description, actions }: Props = $props();
</script>

<div class="flex flex-wrap items-start justify-between gap-2">
  <div class="min-w-0">
    <h1 class="m-0 text-lg font-semibold">{title}</h1>
    {#if description}
      <p class="m-0 mt-1 text-sm text-surface-700-300">{description}</p>
    {/if}
  </div>
  {#if actions}
    <div class="flex shrink-0 flex-wrap items-center gap-2">{@render actions()}</div>
  {/if}
</div>
