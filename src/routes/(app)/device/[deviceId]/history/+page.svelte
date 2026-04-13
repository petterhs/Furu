<script lang="ts">
  import { page } from "$app/state";
  import { rememberedDevices } from "$lib/stores/devices";

  const deviceId = $derived(page.params.deviceId);
  const remembered = $derived($rememberedDevices.find((item) => item.id === deviceId));
</script>

<section class="stack">
  <article class="card">
    <h2>History</h2>
    {#if remembered}
      <p><strong>{remembered.name}</strong></p>
      <p class="mono">{remembered.address}</p>
    {:else}
      <p>Unknown remembered device.</p>
    {/if}
  </article>

  <article class="card">
    <h3>Recent activity</h3>
    <ul>
      <li>Connection events will appear here.</li>
      <li>Sync operations and alerts will be grouped by day.</li>
      <li>Battery and health snapshots can be added later.</li>
    </ul>
  </article>
</section>

<style>
  .stack {
    display: grid;
    gap: 0.9rem;
  }
  .card {
    background: #fff;
    border: 1px solid #ddd;
    border-radius: 0.75rem;
    padding: 0.9rem;
  }
  h2,
  h3 {
    margin: 0 0 0.6rem;
    font-size: 1rem;
  }
  .mono {
    font-family: ui-monospace, monospace;
    font-size: 0.82rem;
  }
</style>
