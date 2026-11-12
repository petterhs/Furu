<script lang="ts">
  import type { Snippet } from "svelte";

  type Props = {
    /** Metric name, e.g. "Battery". */
    label: string;
    /** Formatted value; a dash placeholder is fine. */
    value: string;
    /** Unit rendered smaller beside the value. */
    unit?: string;
    /** Leading icon. */
    icon?: Snippet;
    /** Secondary line, e.g. "Charging · 4.01 V". */
    hint?: string;
    /** Accent used for the icon and value. */
    tone?: "primary" | "success" | "warning" | "error" | "neutral";
  };

  let { label, value, unit, icon, hint, tone = "neutral" }: Props = $props();

  const toneClass = $derived(
    {
      primary: "text-primary-500",
      success: "text-success-500",
      warning: "text-warning-500",
      error: "text-error-500",
      neutral: "text-surface-900-100",
    }[tone],
  );
</script>

<div
  class="rounded-lg border border-surface-200-800 bg-surface-100-900/60 px-3 py-2.5"
>
  <div class="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-surface-700-300">
    {#if icon}
      <span class="shrink-0" aria-hidden="true">{@render icon()}</span>
    {/if}
    <span class="truncate">{label}</span>
  </div>
  <p class="m-0 mt-1 flex items-baseline gap-1 {toneClass}">
    <span class="text-xl font-semibold tabular-nums">{value}</span>
    {#if unit}<span class="text-xs font-medium">{unit}</span>{/if}
  </p>
  {#if hint}
    <p class="m-0 mt-0.5 truncate text-xs text-surface-700-300">{hint}</p>
  {/if}
</div>
