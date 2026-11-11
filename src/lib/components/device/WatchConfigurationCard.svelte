<script lang="ts">
  import { ArrowDown, ArrowUp, Info, X } from "@lucide/svelte";
  import { FeatureId } from "#lib/bleContract";
  import {
    CLOCK_FIELD_DEFINITIONS,
    MAX_CLOCK_FIELDS,
    clockFieldIsReady,
    getClockFieldDefinition,
  } from "#lib/integrations/clockFields";
  import { configuredProviderStore } from "#lib/stores/integrations";
  import { saveWatchConfig, watchConfigByDevice } from "#lib/stores/watchConfig";
  import { toastCaught } from "#lib/stores/toast";
  import {
    WATCH_APP_DEFINITIONS,
    defaultWatchConfig,
    moveClockField,
    sanitizeWatchConfig,
    toggleClockField,
    toggleWatchApp,
    type WatchAppId,
    type WatchConfig,
  } from "#lib/types/watchConfig";
  import Card from "#lib/components/ui/Card.svelte";

  type Props = {
    deviceId: string;
    /** True while a firmware update holds the BLE session. */
    locked: boolean;
  };

  let { deviceId, locked }: Props = $props();

  let saving = $state(false);

  /*
   * Derived from the store rather than copied into state: every change is
   * persisted immediately, so the store is the single source of truth.
   */
  let config = $derived<WatchConfig>(
    $watchConfigByDevice[deviceId]
      ? sanitizeWatchConfig($watchConfigByDevice[deviceId])
      : defaultWatchConfig(),
  );

  const readyProviders = $derived($configuredProviderStore);
  const atLimit = $derived(config.clockFields.length >= MAX_CLOCK_FIELDS);
  const available = $derived(
    CLOCK_FIELD_DEFINITIONS.filter((field) => !config.clockFields.includes(field.id)),
  );

  async function persist(next: WatchConfig): Promise<void> {
    saving = true;
    try {
      await saveWatchConfig(deviceId, next);
    } catch (error) {
      toastCaught("Could not save watch preferences", error);
    } finally {
      saving = false;
    }
  }

  const changeField = (id: string) =>
    void persist({ ...config, clockFields: toggleClockField(config.clockFields, id) });
  const reorder = (index: number, delta: number) =>
    void persist({ ...config, clockFields: moveClockField(config.clockFields, index, delta) });
  const changeApp = (id: WatchAppId) =>
    void persist({ ...config, enabledApps: toggleWatchApp(config.enabledApps, id) });
</script>

<Card
  title="Watch screen"
  description="Which values the clock shows and which pages the watch offers."
>
  <div class="flex items-start gap-2 rounded-lg border border-warning-500/40 bg-warning-950/10 p-3">
    <Info class="mt-0.5 size-4 shrink-0 text-warning-500" aria-hidden="true" />
    <p class="m-0 text-xs">
      Kongle does not accept this configuration over Bluetooth yet. Furu saves your choice and
      will apply it once the firmware supports it.
    </p>
  </div>

  <fieldset class="mt-4 min-w-0 border-0 p-0" disabled={locked}>
    <legend class="p-0 text-xs font-semibold uppercase tracking-wide text-surface-700-300">
      Clock fields
    </legend>
    <p class="m-0 mt-1 text-xs text-surface-700-300">
      {config.clockFields.length} of {MAX_CLOCK_FIELDS} slots used, shown top to bottom.
    </p>

    {#if config.clockFields.length}
      <ol class="m-0 mt-2 grid list-none gap-1 p-0">
        {#each config.clockFields as fieldId, index (fieldId)}
          {@const field = getClockFieldDefinition(fieldId)}
          {@const ready = field ? clockFieldIsReady(field, readyProviders) : true}
          <li class="flex min-w-0 items-center gap-1 rounded-lg border border-surface-200-800 p-1.5">
            <span class="w-3 shrink-0 text-center text-xs tabular-nums text-surface-700-300">
              {index + 1}
            </span>
            <span class="min-w-0 flex-1">
              <span class="block truncate text-sm">{field?.label ?? fieldId}</span>
              {#if !ready}
                <span class="block truncate text-[11px] text-warning-700-300">Needs its integration</span>
              {/if}
            </span>
            <button
              class="btn-icon btn-xs preset-tonal-surface shrink-0"
              type="button"
              aria-label="Move {field?.label ?? fieldId} up"
              disabled={index === 0}
              onclick={() => reorder(index, -1)}
            >
              <ArrowUp class="size-3.5" />
            </button>
            <button
              class="btn-icon btn-xs preset-tonal-surface shrink-0"
              type="button"
              aria-label="Move {field?.label ?? fieldId} down"
              disabled={index === config.clockFields.length - 1}
              onclick={() => reorder(index, 1)}
            >
              <ArrowDown class="size-3.5" />
            </button>
            <button
              class="btn-icon btn-xs preset-tonal-surface shrink-0"
              type="button"
              aria-label="Remove {field?.label ?? fieldId}"
              onclick={() => changeField(fieldId)}
            >
              <X class="size-3.5" />
            </button>
          </li>
        {/each}
      </ol>
    {:else}
      <p class="m-0 mt-2 text-sm text-surface-700-300">
        No fields selected; the clock shows only the time.
      </p>
    {/if}

    {#if available.length}
      <p class="m-0 mt-4 text-xs font-medium text-surface-700-300">Add a field</p>
      <div class="mt-1 grid gap-1">
        {#each available as field (field.id)}
          {@const ready = clockFieldIsReady(field, readyProviders)}
          <button
            class="flex w-full min-w-0 items-center justify-between gap-2 rounded-lg border border-surface-200-800 px-2 py-2 text-left text-sm enabled:hover:bg-surface-100-900 disabled:opacity-50"
            type="button"
            disabled={atLimit}
            onclick={() => changeField(field.id)}
          >
            <span class="min-w-0">
              <span class="block truncate">{field.label}</span>
              {#if !ready}
                <span class="block truncate text-[11px] text-warning-700-300">Needs its integration</span>
              {/if}
            </span>
            <span class="shrink-0 text-xs text-surface-700-300">
              {atLimit ? "Full" : "Add"}
            </span>
          </button>
        {/each}
      </div>
    {/if}
  </fieldset>

  <fieldset class="mt-5 min-w-0 border-0 p-0" disabled={locked}>
    <legend class="p-0 text-xs font-semibold uppercase tracking-wide text-surface-700-300">
      Watch pages
    </legend>
    <div class="mt-2 grid gap-1">
      {#each WATCH_APP_DEFINITIONS as app (app.id)}
        <label
          class="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-surface-200-800 px-2 py-2"
        >
          <span class="min-w-0">
            <span class="block text-sm">{app.label}</span>
            <span class="block text-xs text-surface-700-300">{app.description}</span>
          </span>
          <input
            type="checkbox"
            class="checkbox shrink-0"
            checked={config.enabledApps.includes(app.id)}
            onchange={() => changeApp(app.id)}
          />
        </label>
      {/each}
    </div>
  </fieldset>

  {#if locked}
    <p class="m-0 mt-4 text-xs text-surface-700-300">Unavailable during a firmware update.</p>
  {:else if saving}
    <p class="m-0 mt-4 text-xs text-surface-700-300" role="status">Saving…</p>
  {:else}
    <p class="m-0 mt-4 text-xs text-surface-700-300">Changes save automatically.</p>
  {/if}
</Card>
