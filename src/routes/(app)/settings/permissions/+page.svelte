<script lang="ts">
  import { onMount } from "svelte";
  import { Check, X } from "@lucide/svelte";
  import {
    openNotificationListenerSettings,
    refreshPermissionsStatus,
    requestPromptablePermissions,
    type PermissionStatusRow,
  } from "#lib/stores/permissions";
  import { toastCaught } from "#lib/stores/toast";
  import Card from "#lib/components/ui/Card.svelte";
  import PageHeading from "#lib/components/ui/PageHeading.svelte";

  let rows = $state<PermissionStatusRow[]>([]);
  let loading = $state(true);

  async function refresh(): Promise<void> {
    loading = true;
    try {
      rows = await refreshPermissionsStatus();
    } finally {
      loading = false;
    }
  }

  async function request(): Promise<void> {
    loading = true;
    try {
      rows = await requestPromptablePermissions();
    } catch (error) {
      toastCaught("Could not request permissions", error);
    } finally {
      loading = false;
    }
  }

  async function openListenerSettings(): Promise<void> {
    loading = true;
    try {
      await openNotificationListenerSettings();
      rows = await refreshPermissionsStatus();
    } catch (error) {
      toastCaught("Could not open Android settings", error);
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    void refresh();
  });
</script>

<div class="grid gap-4">
  <PageHeading
    title="Permissions"
    description="What Furu needs for Bluetooth and for forwarding notifications."
  />

  <Card>
    {#if loading}
      <p class="m-0 text-sm text-surface-700-300">Checking permissions…</p>
    {:else}
      <ul class="m-0 grid list-none gap-1.5 p-0">
        {#each rows as row (row.id)}
          <li class="flex items-center justify-between gap-3 rounded-lg border border-surface-200-800 px-3 py-2">
            <span class="min-w-0 text-sm">{row.label}</span>
            <span class={["inline-flex shrink-0 items-center gap-1 text-xs font-medium", row.granted ? "text-success-700-300" : "text-error-700-300"].join(" ")}>
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
      {#if rows.some((row) => row.id === "notificationListener" && !row.granted)}
        <p class="m-0 mt-3 text-xs text-surface-700-300">
          Notification-listener access can only be granted in Android's settings; Furu cannot
          show that prompt itself.
        </p>
      {/if}
    {/if}

    <div class="mt-4 grid gap-2 sm:grid-cols-3">
      <button class="btn btn-sm preset-tonal-surface justify-center" type="button" onclick={() => void refresh()} disabled={loading}>
        Check again
      </button>
      <button class="btn btn-sm preset-filled-primary-500 justify-center" type="button" onclick={() => void request()} disabled={loading}>
        Request
      </button>
      <button class="btn btn-sm preset-tonal-surface justify-center" type="button" onclick={() => void openListenerSettings()} disabled={loading}>
        Notification access…
      </button>
    </div>
  </Card>
</div>
