<script lang="ts">
  import { RANGE_LABELS, type RangeKey } from "#lib/deviceHistory";

  type Props = {
    value: RangeKey;
    onchange: (value: RangeKey) => void;
    /** Describes what the range applies to, for screen readers. */
    label?: string;
  };

  let { value, onchange, label = "Time range" }: Props = $props();
</script>

<!--
  Plain toggle buttons rather than Skeleton's `SegmentedControl`: its checked
  label colour keys off `data-state` on the text element while the attribute
  sits on the parent item, so the accent pairing never reaches the label. These
  buttons use the same `preset-*` utilities as the rest of the app.
-->
<div
  class="inline-flex items-center gap-0.5 rounded-lg border border-surface-300-700 p-0.5"
  role="group"
  aria-label={label}
>
  {#each RANGE_LABELS as option (option.key)}
    <button
      class={[
        "btn btn-xs min-w-9",
        value === option.key ? "preset-filled-primary-500" : "preset-tonal-surface",
      ].join(" ")}
      type="button"
      aria-pressed={value === option.key}
      onclick={() => onchange(option.key)}
    >
      {option.label}
    </button>
  {/each}
</div>
