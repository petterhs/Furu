<script lang="ts">
  import { onMount } from "svelte";
  import { Check, X } from "@lucide/svelte";
  import {
    openNotificationListenerSettings,
    refreshPermissionsStatus,
    requestPromptablePermissions,
    type PermissionStatusRow,
  } from "$lib/stores/permissions";

  let rows = $state<PermissionStatusRow[]>([]);
  let loading = $state(true);

  async function checkPermissions(): Promise<void> {
    loading = true;
    try {
      rows = await refreshPermissionsStatus();
    } finally {
      loading = false;
    }
  }

  async function requestPermissions(): Promise<void> {
    loading = true;
    try {
      rows = await requestPromptablePermissions();
    } finally {
      loading = false;
    }
  }

  async function openNotificationSettings(): Promise<void> {
    loading = true;
    try {
      await openNotificationListenerSettings();
      rows = await refreshPermissionsStatus();
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    void checkPermissions();
  });
</script>

<section class="grid gap-4">
  <h2 class="m-0 mb-2 text-base font-semibold">Permissions</h2>
  <article class="card preset-tonal-surface border border-[color:var(--color-surface-200-800)] p-4">
    <p class="m-0 text-sm text-[color:var(--color-surface-700-300)]">
      Check device permissions needed for BLE and notification forwarding.
    </p>

    {#if loading}
      <p class="m-0 mt-4 text-sm text-[color:var(--color-surface-700-300)]">Checking permissions...</p>
    {:else}
      <ul class="m-0 mt-4 list-none space-y-2 p-0">
        {#each rows as row (row.id)}
          <li
            class="flex items-center justify-between gap-3 rounded-md border border-[color:var(--color-surface-200-800)] px-3 py-2"
          >
            <span class="text-sm">{row.label}</span>
            <span
              class={`inline-flex items-center gap-1 text-sm ${
                row.granted ? "text-[color:var(--color-success-500)]" : "text-[color:var(--color-error-500)]"
              }`}
            >
              {#if row.granted}
                <Check class="size-4" aria-hidden="true" />
                Granted
              {:else}
                <X class="size-4" aria-hidden="true" />
                Missing
              {/if}
            </span>
          </li>
        {/each}
      </ul>
    {/if}

    <div class="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
      <button class="btn preset-tonal-primary" type="button" onclick={() => void checkPermissions()} disabled={loading}>
        Check permissions
      </button>
      <button
        class="btn preset-filled-primary-500"
        type="button"
        onclick={() => void requestPermissions()}
        disabled={loading}
      >
        Request permissions
      </button>
      <button
        class="btn preset-tonal-surface"
        type="button"
        onclick={() => void openNotificationSettings()}
        disabled={loading}
      >
        Open notification access settings
      </button>
    </div>
  </article>
</section>
