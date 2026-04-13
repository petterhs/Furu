<script lang="ts">
  import { page } from "$app/state";
  import { rememberedDevices } from "$lib/stores/devices";

  const deviceId = $derived(page.params.deviceId);
  const remembered = $derived($rememberedDevices.find((item) => item.id === deviceId));
</script>

<section class="grid gap-4">
  <article class="card border border-[color:var(--color-surface-200-800)] p-4 preset-tonal-surface">
    <h2 class="m-0 mb-3 text-base font-semibold">History</h2>
    {#if remembered}
      <p class="m-0"><strong>{remembered.name}</strong></p>
      <p class="m-0 mt-2 font-mono text-sm">{remembered.address}</p>
    {:else}
      <p class="m-0 text-sm text-[color:var(--color-surface-700-300)]">Unknown remembered device.</p>
    {/if}
  </article>

  <article class="card border border-[color:var(--color-surface-200-800)] p-4 preset-tonal-surface">
    <h3 class="m-0 mb-3 text-base font-semibold">Recent activity</h3>
    <ul class="m-0 grid list-disc gap-2 ps-5 text-sm">
      <li>Connection events will appear here.</li>
      <li>Sync operations and alerts will be grouped by day.</li>
      <li>Battery and health snapshots can be added later.</li>
    </ul>
  </article>
</section>
