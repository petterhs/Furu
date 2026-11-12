<script lang="ts">
  import { goto } from "$app/navigation";
  import { ChevronRight, HeartPulse, ScrollText, Wrench } from "@lucide/svelte";
  import Card from "#lib/components/ui/Card.svelte";
  import ListRow from "#lib/components/ui/ListRow.svelte";
  import PageHeading from "#lib/components/ui/PageHeading.svelte";
</script>

<div class="grid gap-4">
  <PageHeading
    title="Diagnostics"
    description="Tools for tracing Bluetooth problems. Not needed for everyday use."
  />

  <Card>
    <div class="grid gap-2">
      <ListRow
        title="Connection log"
        subtitle="Timestamped BLE, DFU and reconnect messages from this session."
        onclick={() => void goto("/settings/diagnostics/logs")}
      >
        {#snippet leading()}<ScrollText class="size-4" />{/snippet}
        {#snippet trailing()}<ChevronRight class="size-4 text-surface-700-300" />{/snippet}
      </ListRow>
      <ListRow
        title="Bluetooth tools"
        subtitle="Manual scan, direct connect and GATT test actions."
        onclick={() => void goto("/settings/diagnostics/ble")}
      >
        {#snippet leading()}<Wrench class="size-4" />{/snippet}
        {#snippet trailing()}<ChevronRight class="size-4 text-surface-700-300" />{/snippet}
      </ListRow>
      <ListRow
        title="Heart-rate capture"
        subtitle="Record raw measurement and diagnostics bytes to a file."
        onclick={() => void goto("/settings/diagnostics/heart-rate")}
      >
        {#snippet leading()}<HeartPulse class="size-4" />{/snippet}
        {#snippet trailing()}<ChevronRight class="size-4 text-surface-700-300" />{/snippet}
      </ListRow>
    </div>
  </Card>
</div>
