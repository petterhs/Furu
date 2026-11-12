<script lang="ts">
  type Props = {
    /** Short status word, e.g. "Connected". */
    label: string;
    tone?: "success" | "warning" | "error" | "neutral" | "primary";
    /** Pulses the dot for an in-progress state. */
    busy?: boolean;
    /** Optional extra class for positioning. */
    class?: string;
  };

  let { label, tone = "neutral", busy = false, class: className = "" }: Props = $props();

  const toneClass = $derived(
    {
      success: "preset-filled-success-500",
      warning: "preset-filled-warning-500",
      error: "preset-filled-error-500",
      primary: "preset-filled-primary-500",
      neutral: "preset-tonal-surface border border-surface-300-700",
    }[tone],
  );
</script>

<span class={["badge gap-1.5", toneClass, className].join(" ")}>
  {#if busy}
    <span
      class="inline-block size-1.5 animate-pulse rounded-full bg-current"
      aria-hidden="true"
    ></span>
  {/if}
  {label}
</span>
