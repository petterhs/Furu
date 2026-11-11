<script lang="ts">
  import type { Snippet } from "svelte";

  type Props = {
    /** Setting name. */
    label: string;
    /** Explanation under the label; keep it to one or two sentences. */
    hint?: string;
    /** The control itself (a Switch, select, input). */
    children: Snippet;
    /** Rendered below the control, e.g. a validation error. */
    footer?: Snippet;
    /** Stacks the control under the label for full-width inputs. */
    stacked?: boolean;
  };

  let { label, hint, children, footer, stacked = false }: Props = $props();
</script>

<!--
  The visible label is a heading for the row, not a form label: Skeleton's
  Switch.Label and each input inside the control slot carry their own
  association, so duplicating it here would announce the control twice.
-->
<div
  class={[
    "flex gap-3",
    stacked ? "flex-col items-stretch" : "items-center justify-between",
  ].join(" ")}
>
  <div class="min-w-0">
    <span class="block text-sm font-medium">{label}</span>
    {#if hint}
      <p class="m-0 mt-0.5 text-xs text-surface-700-300">{hint}</p>
    {/if}
  </div>
  <div class={stacked ? "" : "shrink-0"}>
    {@render children()}
  </div>
</div>

{#if footer}
  <div class="mt-2">{@render footer()}</div>
{/if}
