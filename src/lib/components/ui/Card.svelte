<script lang="ts">
  import type { Snippet } from "svelte";

  type Props = {
    /** Card heading; omit for an unlabelled surface. */
    title?: string;
    /** One-line explanation shown under the title. */
    description?: string;
    /** Heading level so page structure stays semantic. */
    headingLevel?: 2 | 3;
    /** Trailing controls rendered on the heading row. */
    actions?: Snippet;
    /** Body content. */
    children: Snippet;
    /** Renders the softer surface used for grouped settings. */
    padded?: boolean;
    class?: string;
  };

  let {
    title,
    description,
    headingLevel = 2,
    actions,
    children,
    padded = true,
    class: className = "",
  }: Props = $props();

  const headingTag = $derived(headingLevel === 2 ? "h2" : "h3");
</script>

<section
  class={[
    "card preset-tonal-surface border border-surface-200-800",
    padded ? "p-4" : "",
    className,
  ].join(" ")}
>
  {#if title || actions}
    <div class="flex flex-wrap items-start justify-between gap-2">
      <div class="min-w-0">
        {#if title}
          <svelte:element this={headingTag} class="m-0 text-base font-semibold">
            {title}
          </svelte:element>
        {/if}
        {#if description}
          <p class="m-0 mt-1 text-sm text-surface-700-300">{description}</p>
        {/if}
      </div>
      {#if actions}
        <div class="flex shrink-0 flex-wrap items-center gap-2">{@render actions()}</div>
      {/if}
    </div>
  {/if}
  <div class={title || actions ? "mt-3" : ""}>
    {@render children()}
  </div>
</section>
