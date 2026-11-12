<script lang="ts">
  import { page } from "$app/state";
  import { goto } from "$app/navigation";
  import { Switch } from "@skeletonlabs/skeleton-svelte";
  import { getIntegrationDefinition, isProviderId, missingRequiredFields } from "#lib/integrations/registry";
  import {
    getInstance,
    integrations,
    removeIntegration,
    saveIntegration,
    setIntegrationEnabled,
  } from "#lib/stores/integrations";
  import { confirm } from "#lib/stores/confirm";
  import { toastCaught, toastSuccess } from "#lib/stores/toast";
  import Card from "#lib/components/ui/Card.svelte";
  import PageHeading from "#lib/components/ui/PageHeading.svelte";
  import SettingRow from "#lib/components/ui/SettingRow.svelte";
  import StatusPill from "#lib/components/ui/StatusPill.svelte";

  const providerId = $derived(page.params.providerId ?? "");
  const definition = $derived(isProviderId(providerId) ? getIntegrationDefinition(providerId) : undefined);
  const existing = $derived(isProviderId(providerId) ? getInstance(providerId) : undefined);

  /*
   * Local edits are keyed by provider id, so navigating to another integration
   * starts from that provider's saved values without a state-writing effect.
   */
  let edits = $state<Record<string, Record<string, string>>>({});
  let labelEdits = $state<Record<string, string>>({});
  let saving = $state(false);

  const draft = $derived<Record<string, string>>({
    ...(existing?.config ?? {}),
    ...(edits[providerId] ?? {}),
  });
  const label = $derived(labelEdits[providerId] ?? existing?.label ?? "");

  function setField(key: string, value: string): void {
    edits = { ...edits, [providerId]: { ...(edits[providerId] ?? {}), [key]: value } };
  }

  function setLabel(value: string): void {
    labelEdits = { ...labelEdits, [providerId]: value };
  }

  const missing = $derived(definition ? missingRequiredFields(definition, draft) : []);

  async function save(): Promise<void> {
    if (!definition || saving) return;
    saving = true;
    try {
      await saveIntegration(definition.id, draft, label);
      // Drop local edits so the form reflects exactly what the store holds.
      const nextEdits = { ...edits };
      delete nextEdits[definition.id];
      edits = nextEdits;
      const nextLabels = { ...labelEdits };
      delete nextLabels[definition.id];
      labelEdits = nextLabels;
      toastSuccess(`${definition.name} saved`, missing.length
        ? `Still missing: ${missing.join(", ")}`
        : "All required fields are set.");
    } catch (error) {
      toastCaught("Could not save this integration", error);
    } finally {
      saving = false;
    }
  }

  async function remove(): Promise<void> {
    if (!definition) return;
    const ok = await confirm({
      title: `Remove ${definition.name}?`,
      body: "Furu deletes the saved configuration for this integration. Anything already on the watch keeps its last value until it goes stale.",
      confirmLabel: "Remove",
      destructive: true,
    });
    if (!ok) return;
    try {
      await removeIntegration(definition.id);
      toastSuccess(`${definition.name} removed`);
      await goto("/integrations");
    } catch (error) {
      toastCaught("Could not remove this integration", error);
    }
  }

  async function toggleEnabled(checked: boolean): Promise<void> {
    if (!definition) return;
    try {
      await setIntegrationEnabled(definition.id, checked);
    } catch (error) {
      toastCaught("Could not change this integration", error);
    }
  }
</script>

<div class="grid gap-4">
  {#if !definition}
    <PageHeading title="Integration not found" description={`There is no integration called “${providerId}”.`} />
    <a class="btn preset-tonal-surface" href="/integrations">Back to integrations</a>
  {:else}
    <PageHeading title={definition.name} description={definition.summary}>
      {#snippet actions()}
        {#if definition.status === "planned"}
          <StatusPill label="Not available yet" tone="warning" />
        {:else if existing && missing.length === 0}
          <StatusPill label="Configured" tone="success" />
        {/if}
      {/snippet}
    </PageHeading>

    <Card>
      <p class="m-0 text-xs text-surface-900-100">
        Credentials stay on this phone (Tauri’s app store, not the watch). Furu never sends
        tokens over Bluetooth.
      </p>
    </Card>

    <Card title="Connection">
      <div class="grid gap-4">
        <SettingRow
          label="Name"
          hint="Optional label shown in Furu's integration list."
          stacked
        >
          <input
            class="input"
            placeholder={definition.name}
            value={label}
            oninput={(event) => setLabel(event.currentTarget.value)}
          />
        </SettingRow>
        {#each definition.configFields as field (field.key)}
          <SettingRow label={field.label} hint={field.hint} stacked>
            {#if field.kind === "select"}
              <select
                class="select"
                value={draft[field.key] ?? field.options?.[0]?.value ?? ""}
                onchange={(event) => setField(field.key, event.currentTarget.value)}
              >
                {#each field.options ?? [] as option (option.value)}
                  <option value={option.value}>{option.label}</option>
                {/each}
              </select>
            {:else if field.kind === "list"}
              <textarea
                class="textarea min-h-24 font-mono text-xs"
                rows="4"
                placeholder={field.placeholder}
                value={draft[field.key] ?? ""}
                oninput={(event) => setField(field.key, event.currentTarget.value)}
              ></textarea>
            {:else}
              <input
                class="input"
                type={field.kind === "password" ? "password" : field.kind === "number" ? "number" : field.kind === "url" ? "url" : "text"}
                placeholder={field.placeholder}
                value={draft[field.key] ?? ""}
                oninput={(event) => setField(field.key, event.currentTarget.value)}
              />
            {/if}
          </SettingRow>
        {/each}
      </div>

      <button
        class="btn btn-sm preset-filled-primary-500 mt-4 w-full justify-center"
        type="button"
        disabled={saving}
        onclick={() => void save()}
      >
        {saving ? "Saving…" : "Save configuration"}
      </button>
      {#if missing.length}
        <p class="m-0 mt-2 text-xs text-warning-700-300">
          Required: {missing.join(", ")}
        </p>
      {/if}
    </Card>

    {#if existing}
      <Card title="This integration">
        <SettingRow label="Enabled" hint="Pause an integration without deleting its configuration.">
          <Switch
            checked={existing.enabled}
            onCheckedChange={({ checked }) => void toggleEnabled(checked)}
          >
            <Switch.HiddenInput />
            <Switch.Control class="preset-filled-primary-500"><Switch.Thumb /></Switch.Control>
          </Switch>
        </SettingRow>
        <p class="m-0 mt-3 text-xs text-surface-700-300">
          Last saved {new Date(existing.updatedAt).toLocaleString()}.
        </p>
        <button class="btn btn-sm preset-filled-error-500 mt-3" type="button" onclick={() => void remove()}>
          Remove integration
        </button>
      </Card>
    {/if}

    <Card title="What the watch will show">
      <p class="m-0 text-sm">{definition.watchUsage}</p>
      <p class="m-0 mt-2 text-xs text-surface-700-300">
        Choose which values appear on the clock under the device's Watch setup page.
        {$integrations.instances.length === 0
          ? "Nothing is configured yet."
          : "Settings are saved even before the matching firmware capability ships."}
      </p>
    </Card>
  {/if}
</div>
