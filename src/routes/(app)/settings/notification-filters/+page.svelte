<script lang="ts">
  import { onMount } from "svelte";
  import { Search } from "@lucide/svelte";
  import {
    notificationFilters,
    refreshSeenPackagesFromRecent,
    toggleBlockedPackage,
  } from "#lib/stores/notificationFilters";
  import { toastCaught } from "#lib/stores/toast";
  import Card from "#lib/components/ui/Card.svelte";
  import EmptyState from "#lib/components/ui/EmptyState.svelte";
  import ListRow from "#lib/components/ui/ListRow.svelte";
  import PageHeading from "#lib/components/ui/PageHeading.svelte";

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
    } catch (caught) {
      error = caught instanceof Error ? caught.message : "Failed to refresh seen apps.";
    } finally {
      loading = false;
    }
  }

  async function toggle(packageName: string, blocked: boolean): Promise<void> {
    error = null;
    try {
      await toggleBlockedPackage(packageName, blocked);
    } catch (caught) {
      toastCaught("Could not update the blocklist", caught);
    }
  }

  onMount(() => {
    void refreshSeen();
  });
</script>

<div class="grid gap-4">
  <PageHeading
    title="Notification filters"
    description="Block specific Android apps so their alerts never reach the watch."
  >
    {#snippet actions()}
      <button class="btn btn-sm preset-filled-primary-500" type="button" onclick={() => void refreshSeen()} disabled={loading}>
        {loading ? "Refreshing…" : "Refresh apps"}
      </button>
    {/snippet}
  </PageHeading>

  <Card>
    <div class="flex flex-wrap items-center justify-between gap-2 text-xs text-surface-700-300">
      <span>{$notificationFilters.seenPackages.length} apps seen</span>
      <span>{$notificationFilters.blockedPackages.length} blocked</span>
    </div>

    <label class="input mt-3 flex items-center gap-2">
      <Search class="size-4 shrink-0 text-surface-700-300" aria-hidden="true" />
      <input
        class="min-w-0 flex-1 bg-transparent outline-none"
        type="search"
        placeholder="Search package name…"
        bind:value={query}
        disabled={$notificationFilters.seenPackages.length === 0}
        aria-label="Search package name"
      />
    </label>

    {#if error}
      <p class="m-0 mt-3 text-sm text-error-500">{error}</p>
    {/if}

    {#if $notificationFilters.seenPackages.length === 0}
      <div class="mt-3">
        <EmptyState
          title="No apps seen yet"
          description="Receive at least one forwarded notification, then refresh to list the apps here."
        />
      </div>
    {:else}
      <div class="mt-3 grid gap-1.5">
        {#each filteredSeenPackages as packageName (packageName)}
          <ListRow title={packageName} muted={blockedSet.has(packageName)}>
            {#snippet trailing()}
              <label class="flex shrink-0 cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  class="checkbox"
                  checked={blockedSet.has(packageName)}
                  onchange={(event) => void toggle(packageName, event.currentTarget.checked)}
                />
                <span class="text-xs">Blocked</span>
              </label>
            {/snippet}
          </ListRow>
        {:else}
          <p class="m-0 text-sm text-surface-700-300">No packages match “{query}”.</p>
        {/each}
      </div>
    {/if}
  </Card>
</div>
