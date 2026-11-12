<script lang="ts">
  import type { Snippet } from "svelte";

  type Props = {
    /** Headline, e.g. "No watches yet". */
    title: string;
    /** One or two sentences explaining the next step. */
    description?: string;
    icon?: Snippet;
    /** Primary and secondary actions. */
    actions?: Snippet;
  };

  let { title, description, icon, actions }: Props = $props();
</script>

<div class="flex flex-col items-center gap-3 rounded-lg border border-dashed border-surface-300-700 px-6 py-10 text-center">
  {#if icon}
    <span class="text-surface-500-500" aria-hidden="true">{@render icon()}</span>
  {/if}
  <div class="max-w-sm">
    <p class="m-0 text-sm font-semibold">{title}</p>
    {#if description}
      <p class="m-0 mt-1 text-sm text-surface-700-300">{description}</p>
    {/if}
  </div>
  {#if actions}
    <div class="mt-1 flex flex-wrap justify-center gap-2">{@render actions()}</div>
  {/if}
</div>
