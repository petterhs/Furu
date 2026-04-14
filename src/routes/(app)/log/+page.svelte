<script lang="ts">
  import { logLines } from "$lib/stores/bleSession";
</script>

<section class="min-h-0">
  <article
    class="card max-h-[calc(100dvh-8rem)] overflow-y-auto border border-[color:var(--color-surface-200-800)] p-4 font-mono text-xs preset-filled-surface-950-50"
  >
    <h2 class="m-0 mb-3 text-sm font-semibold">Log</h2>
    {#each $logLines as line (`${line}`)}
      <div class="whitespace-pre-wrap">{line}</div>
    {/each}
  </article>
</section>
