<script lang="ts">
  import type { DeviceInformation } from "#lib/types/deviceInformation";
  import Card from "#lib/components/ui/Card.svelte";

  type Props = {
    info: DeviceInformation | null;
    error: string | null;
    canRead: boolean;
    onrefresh: () => void;
  };

  let { info, error, canRead, onrefresh }: Props = $props();

  type Row = { label: string; value: string; mono?: boolean };

  const rows = $derived<Row[]>(
    info
      ? [
          { label: "Manufacturer", value: info.manufacturerName?.trim() || "—" },
          { label: "Model", value: info.modelNumber?.trim() || "—" },
          { label: "Firmware", value: info.firmwareRevision?.trim() || "—" },
          { label: "Software", value: info.softwareRevision?.trim() || "—" },
          { label: "Hardware", value: info.hardwareRevision?.trim() || "—" },
          { label: "Serial number", value: info.serialNumber?.trim() || "—", mono: true },
        ]
      : [],
  );
</script>

<Card title="Device information">
  {#snippet actions()}
    {#if canRead && info}
      <button class="btn btn-xs preset-tonal-surface" type="button" onclick={onrefresh}>
        Refresh
      </button>
    {/if}
  {/snippet}

  {#if !canRead}
    <p class="m-0 text-sm text-surface-700-300">
      Connect this watch to read its Bluetooth Device Information service.
    </p>
  {:else if error}
    <p class="m-0 text-sm text-error-700-300">{error}</p>
    <button class="btn btn-sm preset-tonal-primary mt-2" type="button" onclick={onrefresh}>
      Retry
    </button>
  {:else if info}
    <dl class="m-0 divide-y divide-surface-200-800 text-sm">
      {#each rows as row (row.label)}
        <div class="flex items-baseline justify-between gap-4 py-2">
          <dt class="m-0 shrink-0 text-surface-700-300">{row.label}</dt>
          <dd class={["m-0 min-w-0 truncate text-right font-medium", row.mono ? "font-mono text-xs" : ""].join(" ")}>
            {row.value}
          </dd>
        </div>
      {/each}
    </dl>
  {:else}
    <p class="m-0 text-sm text-surface-700-300">Reading device information…</p>
  {/if}
</Card>
