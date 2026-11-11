<script lang="ts">
  import type { Component } from "svelte";
  import ChevronRight from "@lucide/svelte/icons/chevron-right";
  import CalendarDays from "@lucide/svelte/icons/calendar-days";
  import ChartLine from "@lucide/svelte/icons/chart-line";
  import CloudSun from "@lucide/svelte/icons/cloud-sun";
  import House from "@lucide/svelte/icons/house";
  import Moon from "@lucide/svelte/icons/moon";
  import { INTEGRATION_DEFINITIONS, missingRequiredFields } from "#lib/integrations/registry";
  import { integrations } from "#lib/stores/integrations";
  import PageHeading from "#lib/components/ui/PageHeading.svelte";
  import ListRow from "#lib/components/ui/ListRow.svelte";
  import StatusPill from "#lib/components/ui/StatusPill.svelte";

  const ICONS: Record<string, Component> = {
    home_assistant: House,
    weather: CloudSun,
    stocks: ChartLine,
    calendar: CalendarDays,
    sleep: Moon,
  };

  /*
   * One compact row per provider. The detail lives on each provider's own page,
   * so this list stays scannable instead of repeating every field's status.
   */
  const summaries = $derived(
    INTEGRATION_DEFINITIONS.map((definition) => {
      const instance = $integrations.instances.find((item) => item.providerId === definition.id);
      const missing = instance
        ? missingRequiredFields(definition, instance.config)
        : definition.configFields.filter((field) => field.required).map((field) => field.label);
      return { definition, instance, missing };
    }),
  );
</script>

<div class="grid min-w-0 gap-4">
  <PageHeading
    title="Integrations"
    description="Connect your own services so the watch can show the values you care about."
  />

  <p class="m-0 text-xs text-surface-700-300">
    Credentials stay on this phone and are never sent to the watch.
  </p>

  <div class="grid min-w-0 gap-1.5">
    {#each summaries as { definition, instance, missing } (definition.id)}
      {@const Icon = ICONS[definition.id] ?? House}
      <ListRow
        title={definition.name}
        subtitle={definition.summary}
        href={`/integrations/${definition.id}`}
      >
        {#snippet leading()}
          <span class="flex size-9 items-center justify-center rounded-lg preset-tonal-primary">
            <Icon class="size-4" />
          </span>
        {/snippet}
        {#snippet trailing()}
          <span class="flex items-center gap-2">
            {#if definition.status === "planned"}
              <StatusPill label="Soon" tone="neutral" />
            {:else if instance && missing.length === 0}
              <StatusPill label={instance.enabled ? "On" : "Paused"} tone={instance.enabled ? "success" : "neutral"} />
            {:else if instance}
              <StatusPill label="Incomplete" tone="warning" />
            {/if}
            <ChevronRight class="size-4 text-surface-700-300" />
          </span>
        {/snippet}
      </ListRow>
    {/each}
  </div>

  <p class="m-0 rounded-lg border border-surface-200-800 p-3 text-xs text-surface-700-300">
    None of these send data yet. Furu stores the configuration now so it applies once each
    integration ships.
  </p>
</div>
