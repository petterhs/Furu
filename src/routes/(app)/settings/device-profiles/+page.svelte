<script lang="ts">
  import { get } from "svelte/store";
  import { FeatureId, ProfileId } from "#lib/bleContract";
  import {
    defaultNameRules,
    seedBuiltinProfiles,
  } from "#lib/persistence/deviceProfilesStore";
  import type { DeviceProfileDefinition } from "#lib/types/deviceProfileCatalog";
  import type { ProfileNameMatchMode, ProfileNameRule } from "#lib/types/profileNameRule";
  import {
    deviceProfileCatalog,
    patchDeviceProfileCatalog,
  } from "#lib/stores/deviceProfiles";
  import { confirm } from "#lib/stores/confirm";
  import { toastCaught, toastSuccess } from "#lib/stores/toast";
  import Card from "#lib/components/ui/Card.svelte";
  import PageHeading from "#lib/components/ui/PageHeading.svelte";

  /** Human labels for catalog feature IDs; the IDs themselves stay stable. */
  const FEATURE_LABELS: Record<string, string> = {
    [FeatureId.bleDeviceInformation]: "Device information",
    [FeatureId.bleCurrentTime]: "Current time sync",
    [FeatureId.bleBattery]: "Battery level",
    [FeatureId.kongleBatteryHistory]: "Kongle battery history",
    [FeatureId.bleHr]: "Heart rate",
    [FeatureId.bleAnss]: "Notifications",
    [FeatureId.bleMediaControl]: "Media control",
    [FeatureId.bleDisSteps]: "Step count",
    [FeatureId.infinitimeDfu]: "Firmware update (DFU)",
    [FeatureId.infinitimeCompanionUart]: "Companion UART",
    [FeatureId.kongleWatchConfig]: "Kongle watch configuration",
  };

  const FEATURE_HINTS: Record<string, string> = {
    [FeatureId.bleDeviceInformation]: "Reads manufacturer, model and firmware strings.",
    [FeatureId.bleCurrentTime]: "Writes the phone clock to the watch.",
    [FeatureId.bleBattery]: "Reads the standard battery level every minute.",
    [FeatureId.kongleBatteryHistory]: "Kongle voltage, charging state and paged history.",
    [FeatureId.bleHr]: "Heart-rate notifications, hidden when stale.",
    [FeatureId.bleAnss]: "Forwards Android alerts to the watch.",
    [FeatureId.bleMediaControl]: "Bridges Android media sessions to the watch.",
    [FeatureId.bleDisSteps]: "Reads the InfiniTime step counter.",
    [FeatureId.infinitimeDfu]: "Nordic legacy DFU over Bluetooth.",
    [FeatureId.infinitimeCompanionUart]: "Planned; no code path yet.",
    [FeatureId.kongleWatchConfig]: "Planned; clock fields and watch pages. Settings are stored until firmware supports it.",
  };

  const allFeatureIds = Object.values(FeatureId) as string[];
  const matchModes: ProfileNameMatchMode[] = ["contains", "prefix", "equals"];

  let selectedProfileId = $state<string | null>(null);
  let editLabel = $state("");
  let editDescription = $state("");
  let editFeatures = $state<Set<string>>(new Set());

  const selected = $derived(
    selectedProfileId
      ? $deviceProfileCatalog.profiles.find((profile) => profile.id === selectedProfileId)
      : undefined,
  );

  $effect(() => {
    const profile = selected;
    if (!profile) return;
    editLabel = profile.label;
    editDescription = profile.description;
    editFeatures = new Set(profile.featureIds);
  });

  $effect(() => {
    const ids = $deviceProfileCatalog.profiles.map((profile) => profile.id);
    if (selectedProfileId && !ids.includes(selectedProfileId)) {
      selectedProfileId = ids[0] ?? null;
    }
    if (!selectedProfileId && ids.length) {
      selectedProfileId = ids[0];
    }
  });

  function toggleFeature(featureId: string): void {
    const next = new Set(editFeatures);
    if (next.has(featureId)) next.delete(featureId);
    else next.add(featureId);
    editFeatures = next;
  }

  async function saveSelectedProfile(): Promise<void> {
    if (!selected) return;
    const updated: DeviceProfileDefinition = {
      ...selected,
      label: editLabel.trim() || selected.id,
      description: editDescription.trim(),
      featureIds: Array.from(editFeatures),
    };
    if (updated.isBuiltin) {
      const ok = await confirm({
        title: "Change a built-in profile?",
        body: "Built-in profiles may be reset or extended when Furu updates. Your changes are kept, but new capabilities are added automatically.",
        confirmLabel: "Save changes",
      });
      if (!ok) return;
    }
    try {
      await patchDeviceProfileCatalog((draft) => {
        const index = draft.profiles.findIndex((profile) => profile.id === updated.id);
        if (index !== -1) draft.profiles[index] = updated;
      });
      toastSuccess("Profile saved");
    } catch (error) {
      toastCaught("Could not save the profile", error);
    }
  }

  async function resetSelectedBuiltin(): Promise<void> {
    if (!selected?.isBuiltin) return;
    const seed = seedBuiltinProfiles().find((entry) => entry.id === selected.id);
    if (!seed) return;
    try {
      await patchDeviceProfileCatalog((draft) => {
        const index = draft.profiles.findIndex((profile) => profile.id === seed.id);
        if (index !== -1) draft.profiles[index] = { ...seed };
      });
      toastSuccess("Profile reset to factory defaults");
    } catch (error) {
      toastCaught("Could not reset the profile", error);
    }
  }

  async function addCustomProfile(): Promise<void> {
    const id = `custom_${crypto.randomUUID()}`;
    try {
      await patchDeviceProfileCatalog((draft) => {
        draft.profiles.push({
          id,
          label: "Custom profile",
          description: "",
          isBuiltin: false,
          featureIds: [],
        });
      });
      selectedProfileId = id;
    } catch (error) {
      toastCaught("Could not add a profile", error);
    }
  }

  async function deleteCustomProfile(id: string): Promise<void> {
    if (new Set(seedBuiltinProfiles().map((entry) => entry.id)).has(id)) return;
    const ok = await confirm({
      title: "Delete this profile?",
      body: "Devices using it will need another profile selected. Their saved history is not removed.",
      confirmLabel: "Delete profile",
      destructive: true,
    });
    if (!ok) return;
    try {
      await patchDeviceProfileCatalog((draft) => {
        draft.profiles = draft.profiles.filter((profile) => profile.id !== id);
        draft.nameRules = draft.nameRules.filter((rule) => rule.profileId !== id);
      });
      if (selectedProfileId === id) {
        selectedProfileId = get(deviceProfileCatalog).profiles[0]?.id ?? null;
      }
      toastSuccess("Profile deleted");
    } catch (error) {
      toastCaught("Could not delete the profile", error);
    }
  }

  async function saveNameRules(next: ProfileNameRule[]): Promise<void> {
    try {
      await patchDeviceProfileCatalog((draft) => {
        draft.nameRules = next;
      });
    } catch (error) {
      toastCaught("Could not save the detection rules", error);
    }
  }

  async function addRule(): Promise<void> {
    await saveNameRules([
      ...$deviceProfileCatalog.nameRules,
      { id: crypto.randomUUID(), pattern: "", matchMode: "contains" as const, profileId: ProfileId.unknown },
    ]);
  }

  async function removeRule(id: string): Promise<void> {
    await saveNameRules($deviceProfileCatalog.nameRules.filter((rule) => rule.id !== id));
  }

  async function updateRule(id: string, patch: Partial<ProfileNameRule>): Promise<void> {
    await saveNameRules(
      $deviceProfileCatalog.nameRules.map((rule) => (rule.id === id ? { ...rule, ...patch } : rule)),
    );
  }

  async function moveRule(index: number, delta: number): Promise<void> {
    const target = index + delta;
    const rules = [...$deviceProfileCatalog.nameRules];
    if (target < 0 || target >= rules.length) return;
    [rules[index], rules[target]] = [rules[target], rules[index]];
    await saveNameRules(rules);
  }

  async function resetNameRulesDefaults(): Promise<void> {
    try {
      await patchDeviceProfileCatalog((draft) => {
        draft.nameRules = defaultNameRules();
      });
      toastSuccess("Detection rules reset");
    } catch (error) {
      toastCaught("Could not reset the rules", error);
    }
  }
</script>

<div class="grid gap-4">
  <PageHeading
    title="Device profiles"
    description="A profile decides which Bluetooth features Furu uses for a watch."
  >
    {#snippet actions()}
      <button class="btn btn-sm preset-filled-primary-500" type="button" onclick={() => void addCustomProfile()}>
        Add profile
      </button>
    {/snippet}
  </PageHeading>

  <div class="grid gap-4 lg:grid-cols-[minmax(0,13rem)_1fr]">
    <Card title="Profiles" headingLevel={3} class="self-start">
      <ul class="m-0 grid list-none gap-1 p-0">
        {#each $deviceProfileCatalog.profiles as profile (profile.id)}
          <li>
            <button
              class={[
                "btn w-full justify-start text-left text-sm",
                selectedProfileId === profile.id ? "preset-filled-primary-500" : "preset-tonal-surface",
              ].join(" ")}
              type="button"
              onclick={() => { selectedProfileId = profile.id; }}
            >
              <span class="truncate">{profile.label}</span>
              {#if profile.isBuiltin}
                <span class="ml-auto shrink-0 text-[10px] opacity-70">built-in</span>
              {/if}
            </button>
          </li>
        {/each}
      </ul>
    </Card>

    {#if selected}
      <Card title={selected.label} description={selected.description || undefined}>
        {#snippet actions()}
          {#if selected.isBuiltin}
            <button class="btn btn-xs preset-tonal-surface" type="button" onclick={() => void resetSelectedBuiltin()}>
              Reset
            </button>
          {:else}
            <button class="btn btn-xs preset-tonal-error" type="button" onclick={() => void deleteCustomProfile(selected.id)}>
              Delete
            </button>
          {/if}
        {/snippet}

        <p class="m-0 font-mono text-xs text-surface-700-300">{selected.id}</p>

        <div class="mt-3 grid gap-3">
          <label class="label">
            <span class="label-text">Label</span>
            <input class="input" bind:value={editLabel} />
          </label>
          <label class="label">
            <span class="label-text">Description</span>
            <textarea class="textarea" rows="2" bind:value={editDescription}></textarea>
          </label>
        </div>

        <fieldset class="mt-4 border-0 p-0">
          <legend class="text-xs font-semibold uppercase tracking-wide text-surface-700-300">
            Features
          </legend>
          <div class="mt-2 grid gap-1">
            {#each allFeatureIds as featureId (featureId)}
              <label class="flex cursor-pointer items-start gap-2 rounded-lg border border-surface-200-800 px-2 py-1.5">
                <input
                  type="checkbox"
                  class="checkbox mt-0.5 shrink-0"
                  checked={editFeatures.has(featureId)}
                  onchange={() => toggleFeature(featureId)}
                />
                <span class="min-w-0">
                  <span class="block text-sm">{FEATURE_LABELS[featureId] ?? featureId}</span>
                  {#if FEATURE_HINTS[featureId]}
                    <span class="block text-xs text-surface-700-300">{FEATURE_HINTS[featureId]}</span>
                  {/if}
                  <span class="block font-mono text-[10px] text-surface-600-400">{featureId}</span>
                </span>
              </label>
            {/each}
          </div>
        </fieldset>

        <button class="btn btn-sm preset-filled-primary-500 mt-4 w-full justify-center" type="button" onclick={() => void saveSelectedProfile()}>
          Save profile
        </button>
      </Card>
    {/if}
  </div>

  <Card
    title="Name detection"
    description="Used when a device's profile is set to auto. The first matching rule wins."
  >
    {#snippet actions()}
      <button class="btn btn-xs preset-tonal-surface" type="button" onclick={() => void addRule()}>Add rule</button>
      <button class="btn btn-xs preset-tonal-surface" type="button" onclick={() => void resetNameRulesDefaults()}>
        Reset rules
      </button>
    {/snippet}

    <div class="grid gap-2">
      {#each $deviceProfileCatalog.nameRules as rule, index (rule.id)}
        <div class="rounded-lg border border-surface-200-800 p-3">
          <div class="mb-2 flex flex-wrap items-center gap-2">
            <span class="text-xs font-medium text-surface-700-300">Rule {index + 1}</span>
            <div class="ml-auto flex flex-wrap gap-1">
              <button class="btn btn-xs preset-tonal-surface" type="button" disabled={index === 0} onclick={() => void moveRule(index, -1)}>
                Up
              </button>
              <button
                class="btn btn-xs preset-tonal-surface"
                type="button"
                disabled={index === $deviceProfileCatalog.nameRules.length - 1}
                onclick={() => void moveRule(index, 1)}
              >
                Down
              </button>
              <button class="btn btn-xs preset-tonal-error" type="button" onclick={() => void removeRule(rule.id)}>
                Remove
              </button>
            </div>
          </div>
          <div class="grid gap-2 sm:grid-cols-3">
            <input
              class="input"
              placeholder="Name pattern"
              value={rule.pattern}
              oninput={(event) => void updateRule(rule.id, { pattern: event.currentTarget.value })}
            />
            <select
              class="select"
              value={rule.matchMode}
              onchange={(event) =>
                void updateRule(rule.id, { matchMode: event.currentTarget.value as ProfileNameMatchMode })}
            >
              {#each matchModes as mode (mode)}
                <option value={mode}>{mode}</option>
              {/each}
            </select>
            <select
              class="select"
              value={rule.profileId}
              onchange={(event) => void updateRule(rule.id, { profileId: event.currentTarget.value })}
            >
              {#each $deviceProfileCatalog.profiles as profile (profile.id)}
                <option value={profile.id}>{profile.label}</option>
              {/each}
            </select>
          </div>
        </div>
      {:else}
        <p class="m-0 text-sm text-surface-700-300">No rules. Auto profile detection stays off.</p>
      {/each}
    </div>
  </Card>
</div>
