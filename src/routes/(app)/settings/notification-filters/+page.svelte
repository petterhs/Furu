<script lang="ts">
  import { onMount } from "svelte";
  import {
    notificationFilters,
    refreshSeenPackagesFromRecent,
    toggleBlockedPackage,
  } from "$lib/stores/notificationFilters";

  let loading = $state(false);
  let error = $state<string | null>(null);
  let query = $state("");

  const normalizedQuery = $derived(query.trim().toLowerCase());
  const filteredSeenPackages = $derived(
    normalizedQuery
      ? $notificationFilters.seenPackages.filter((pkg) => pkg.toLowerCase().includes(normalizedQuery))
      : $notificationFilters.seenPackages,
  );
  const blockedSet = $derived(new Set($notificationFilters.blockedPackages));

  async function refreshSeen(): Promise<void> {
    loading = true;
    error = null;
    try {
      await refreshSeenPackagesFromRecent();
    } catch (err) {
      error = err instanceof Error ? err.message : "Failed to refresh seen apps.";
    } finally {
      loading = false;
    }
  }

  async function handleBlockedToggle(packageName: string, blocked: boolean): Promise<void> {
    error = null;
    try {
      await toggleBlockedPackage(packageName, blocked);
    } catch (err) {
      error = err instanceof Error ? err.message : "Failed to update blocklist.";
    }
  }

  onMount(() => {
    void refreshSeen();
  });
</script>

<section class="grid gap-4">
  <h2 class="m-0 mb-1 text-base font-semibold">Notification Filters</h2>
  <p class="m-0 text-sm text-[color:var(--color-surface-700-300)]">
    Block specific Android app packages so their notifications are not forwarded to your watch.
  </p>

  <article class="card preset-tonal-surface border border-[color:var(--color-surface-200-800)] p-4">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <p class="m-0 text-xs text-[color:var(--color-surface-700-300)]">
        Seen: {$notificationFilters.seenPackages.length} | Blocked: {$notificationFilters.blockedPackages.length}
      </p>
      <button class="btn btn-sm preset-filled-primary-500" type="button" onclick={() => void refreshSeen()} disabled={loading}>
        {loading ? "Refreshing..." : "Refresh seen apps"}
      </button>
    </div>

    <label class="label mt-3">
      <span class="label-text">Filter packages</span>
      <input
        class="input"
        type="search"
        placeholder="Search package name..."
        bind:value={query}
        disabled={$notificationFilters.seenPackages.length === 0}
      />
    </label>

    {#if error}
      <p class="m-0 mt-3 text-sm text-[color:var(--color-error-500)]">{error}</p>
    {/if}

    {#if $notificationFilters.seenPackages.length === 0}
      <p class="m-0 mt-4 text-sm text-[color:var(--color-surface-700-300)]">
        No app packages seen yet. Receive at least one forwarded notification first, then refresh.
      </p>
    {:else}
      <ul class="m-0 mt-4 list-none space-y-2 p-0">
        {#each filteredSeenPackages as packageName (packageName)}
          <li
            class="flex items-center justify-between gap-3 rounded-md border border-[color:var(--color-surface-200-800)] px-3 py-2"
          >
            <span class="truncate font-mono text-xs sm:text-sm">{packageName}</span>
            <label class="flex shrink-0 cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                class="checkbox"
                checked={blockedSet.has(packageName)}
                onchange={(event) =>
                  void handleBlockedToggle(packageName, (event.currentTarget as HTMLInputElement).checked)}
              />
              <span>Blocked</span>
            </label>
          </li>
        {:else}
          <li class="text-sm text-[color:var(--color-surface-700-300)]">No packages match your filter.</li>
        {/each}
      </ul>
    {/if}
  </article>
</section>
