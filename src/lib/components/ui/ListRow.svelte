<script lang="ts">
  import type { Snippet } from "svelte";

  type Props = {
    /** Primary text. */
    title: string;
    /** Secondary text under the title. */
    subtitle?: string;
    /** Extra note shown below both lines, e.g. a caveat. */
    detail?: string;
    /** Leading icon or avatar. */
    leading?: Snippet;
    /** Trailing control (badge, switch, button). */
    trailing?: Snippet;
    /** Optional body rendered under the row content. */
    children?: Snippet;
    /** When set the whole row is an anchor. */
    href?: string;
    /** Renders a button instead of an anchor; rows without either are static. */
    onclick?: () => void;
    /** Dims the row without removing it, e.g. a disabled integration. */
    muted?: boolean;
  };

  let {
    title,
    subtitle,
    detail,
    leading,
    trailing,
    children,
    href,
    onclick,
    muted = false,
  }: Props = $props();

  const interactive = $derived(Boolean(href || onclick));
  const base =
    "flex w-full items-center gap-3 rounded-lg border border-surface-200-800 px-3 py-2.5 text-left";
  const tone = $derived(
    [
      base,
      interactive ? "cursor-pointer transition-colors hover:bg-surface-100-900" : "",
      muted ? "opacity-60" : "",
    ].join(" "),
  );
</script>

{#snippet content()}
  {#if leading}
    <span class="shrink-0 text-surface-700-300">{@render leading()}</span>
  {/if}
  <span class="min-w-0 flex-1">
    <span class="block truncate text-sm font-medium">{title}</span>
    {#if subtitle}
      <span class="mt-0.5 block text-xs text-surface-700-300">{subtitle}</span>
    {/if}
    {#if detail}
      <span class="mt-1 block text-xs text-surface-600-400">{detail}</span>
    {/if}
  </span>
  {#if trailing}
    <span class="shrink-0">{@render trailing()}</span>
  {/if}
{/snippet}

{#if href}
  <a class="{tone} no-underline text-inherit" {href}>
    {@render content()}
  </a>
{:else if onclick}
  <button class={tone} type="button" {onclick}>
    {@render content()}
  </button>
{:else}
  <div class={tone}>
    {@render content()}
  </div>
{/if}

{#if children}
  <div class="mt-2">{@render children()}</div>
{/if}
