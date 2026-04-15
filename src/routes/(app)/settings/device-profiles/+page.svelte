<script lang="ts">
  import { get } from "svelte/store";
  import { FeatureId, ProfileId } from "$lib/bleContract";
  import {
    defaultNameRules,
    seedBuiltinProfiles,
  } from "$lib/persistence/deviceProfilesStore";
  import type { DeviceProfileDefinition } from "$lib/types/deviceProfileCatalog";
  import type { ProfileNameMatchMode, ProfileNameRule } from "$lib/types/profileNameRule";
  import {
    deviceProfileCatalog,
    patchDeviceProfileCatalog,
  } from "$lib/stores/deviceProfiles";

  const allFeatureIds = Object.values(FeatureId) as string[];
  const matchModes: ProfileNameMatchMode[] = ["contains", "prefix", "equals"];

  let selectedProfileId = $state<string | null>(null);
  let editLabel = $state("");
  let editDescription = $state("");
  let editFeatures = $state<Set<string>>(new Set());

  const selected = $derived(
    selectedProfileId
      ? $deviceProfileCatalog.profiles.find((p) => p.id === selectedProfileId)
      : undefined,
  );

  $effect(() => {
    const p = selected;
    if (!p) return;
    editLabel = p.label;
    editDescription = p.description;
    editFeatures = new Set(p.featureIds);
  });

  $effect(() => {
    const ids = $deviceProfileCatalog.profiles.map((p) => p.id);
    if (selectedProfileId && !ids.includes(selectedProfileId)) {
      selectedProfileId = ids[0] ?? null;
    }
    if (!selectedProfileId && ids.length) {
      selectedProfileId = ids[0];
    }
  });

  function toggleFeature(fid: string): void {
    const next = new Set(editFeatures);
    if (next.has(fid)) next.delete(fid);
    else next.add(fid);
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
      const ok = window.confirm(
        "Built-in device profiles may be reset or replaced when you update the app. Save these changes anyway?",
      );
      if (!ok) return;
    }
    await patchDeviceProfileCatalog((d) => {
      const i = d.profiles.findIndex((x) => x.id === updated.id);
      if (i !== -1) d.profiles[i] = updated;
    });
  }

  async function resetSelectedBuiltin(): Promise<void> {
    if (!selected?.isBuiltin) return;
    const seed = seedBuiltinProfiles().find((s) => s.id === selected.id);
    if (!seed) return;
    await patchDeviceProfileCatalog((d) => {
      const i = d.profiles.findIndex((x) => x.id === seed.id);
      if (i !== -1) d.profiles[i] = { ...seed };
    });
  }

  async function addCustomProfile(): Promise<void> {
    const id = `custom_${crypto.randomUUID()}`;
    await patchDeviceProfileCatalog((d) => {
      d.profiles.push({
        id,
        label: "Custom profile",
        description: "",
        isBuiltin: false,
        featureIds: [],
      });
    });
    selectedProfileId = id;
  }

  async function deleteCustomProfile(id: string): Promise<void> {
    if (new Set(seedBuiltinProfiles().map((s) => s.id)).has(id)) return;
    const ok = window.confirm("Delete this custom profile? Devices using it will need a new profile selected.");
    if (!ok) return;
    await patchDeviceProfileCatalog((d) => {
      d.profiles = d.profiles.filter((p) => p.id !== id);
      d.nameRules = d.nameRules.filter((r) => r.profileId !== id);
    });
    if (selectedProfileId === id) {
      selectedProfileId = get(deviceProfileCatalog).profiles[0]?.id ?? null;
    }
  }

  async function saveNameRules(next: ProfileNameRule[]): Promise<void> {
    await patchDeviceProfileCatalog((d) => {
      d.nameRules = next;
    });
  }

  async function addRule(): Promise<void> {
    const next = [
      ...$deviceProfileCatalog.nameRules,
      {
        id: crypto.randomUUID(),
        pattern: "",
        matchMode: "contains" as const,
        profileId: ProfileId.unknown,
      },
    ];
    await saveNameRules(next);
  }

  async function removeRule(id: string): Promise<void> {
    await saveNameRules($deviceProfileCatalog.nameRules.filter((r) => r.id !== id));
  }

  async function updateRule(id: string, patch: Partial<ProfileNameRule>): Promise<void> {
    await saveNameRules($deviceProfileCatalog.nameRules.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  async function moveRule(index: number, delta: number): Promise<void> {
    const j = index + delta;
    const rules = [...$deviceProfileCatalog.nameRules];
    if (j < 0 || j >= rules.length) return;
    [rules[index], rules[j]] = [rules[j], rules[index]];
    await saveNameRules(rules);
  }

  async function resetNameRulesDefaults(): Promise<void> {
    await patchDeviceProfileCatalog((d) => {
      d.nameRules = defaultNameRules();
    });
  }
</script>

<section class="grid gap-6">
  <div class="flex flex-wrap items-end justify-between gap-2">
    <h2 class="m-0 text-base font-semibold">Device Profiles</h2>
    <div class="flex flex-wrap gap-2">
      <button class="btn btn-sm preset-filled-primary-500" type="button" onclick={() => void addCustomProfile()}>
        Add custom profile
      </button>
    </div>
  </div>

  <div class="grid gap-4 lg:grid-cols-[minmax(0,14rem)_1fr]">
    <aside class="card border border-[color:var(--color-surface-200-800)] p-3 preset-tonal-surface">
      <h3 class="m-0 mb-2 text-xs font-semibold uppercase tracking-wide text-[color:var(--color-surface-700-300)]">
        Profiles
      </h3>
      <ul class="m-0 list-none space-y-1 p-0">
        {#each $deviceProfileCatalog.profiles as p (p.id)}
          <li>
            <button
              class="btn w-full justify-start text-left text-sm {selectedProfileId === p.id
                ? 'preset-filled-primary-500'
                : 'preset-tonal-surface'}"
              type="button"
              onclick={() => {
                selectedProfileId = p.id;
              }}
            >
              <span class="truncate">{p.label}</span>
            </button>
          </li>
        {/each}
      </ul>
    </aside>

    {#if selected}
      <article class="card border border-[color:var(--color-surface-200-800)] p-4 preset-tonal-surface">
        <div class="mb-3 flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 class="m-0 text-sm font-semibold">{selected.label}</h3>
            <p class="m-0 mt-1 font-mono text-xs text-[color:var(--color-surface-700-300)]">{selected.id}</p>
            {#if selected.isBuiltin}
              <p class="m-0 mt-2 text-xs text-[color:var(--color-surface-700-300)]">Built-in profile</p>
            {/if}
          </div>
          <div class="flex flex-wrap gap-2">
            {#if !selected.isBuiltin}
              <button
                class="btn btn-sm preset-filled-error-500"
                type="button"
                onclick={() => void deleteCustomProfile(selected.id)}
              >
                Delete
              </button>
            {/if}
            {#if selected.isBuiltin}
              <button class="btn btn-sm preset-tonal-surface" type="button" onclick={() => void resetSelectedBuiltin()}>
                Reset to factory
              </button>
            {/if}
            <button class="btn btn-sm preset-filled-primary-500" type="button" onclick={() => void saveSelectedProfile()}>
              Save profile
            </button>
          </div>
        </div>

        <label class="label">
          <span class="label-text">Label</span>
          <input class="input" bind:value={editLabel} />
        </label>
        <label class="label mt-3">
          <span class="label-text">Description</span>
          <textarea class="textarea" rows="2" bind:value={editDescription}></textarea>
        </label>

        <fieldset class="mt-4 border border-[color:var(--color-surface-200-800)] p-3 preset-tonal-surface">
          <legend class="px-1 text-xs font-semibold">Features in this profile</legend>
          <p class="m-0 mb-2 text-xs text-[color:var(--color-surface-700-300)]">
            Only known catalog feature IDs are stored. Rust validates these when applying capabilities.
          </p>
          <div class="grid gap-2 sm:grid-cols-2">
            {#each allFeatureIds as fid (fid)}
              <label class="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  class="checkbox"
                  checked={editFeatures.has(fid)}
                  onchange={() => toggleFeature(fid)}
                />
                <span class="font-mono text-xs">{fid}</span>
              </label>
            {/each}
          </div>
        </fieldset>
      </article>
    {/if}
  </div>

  <article class="card border border-[color:var(--color-surface-200-800)] p-4 preset-tonal-surface">
    <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
      <h3 class="m-0 text-sm font-semibold">Name detection (auto profile)</h3>
      <div class="flex flex-wrap gap-2">
        <button class="btn btn-sm preset-tonal-surface" type="button" onclick={() => void addRule()}>Add rule</button>
        <button class="btn btn-sm preset-tonal-surface" type="button" onclick={() => void resetNameRulesDefaults()}>
          Reset rules to defaults
        </button>
      </div>
    </div>
    <p class="m-0 text-sm text-[color:var(--color-surface-700-300)]">
      First matching rule wins. Case-insensitive. Each rule must target a profile id listed on the left.
    </p>
    <ul class="m-0 mt-4 grid list-none gap-3 p-0">
      {#each $deviceProfileCatalog.nameRules as rule, i (rule.id)}
        <li class="border border-[color:var(--color-surface-200-800)] p-3 preset-tonal-surface">
          <div class="mb-2 flex flex-wrap items-center gap-2">
            <span class="text-xs font-medium text-[color:var(--color-surface-700-300)]">Order {i + 1}</span>
            <div class="ml-auto flex flex-wrap gap-1">
              <button
                class="btn btn-sm preset-tonal-surface"
                type="button"
                disabled={i === 0}
                onclick={() => void moveRule(i, -1)}
              >
                Up
              </button>
              <button
                class="btn btn-sm preset-tonal-surface"
                type="button"
                disabled={i === $deviceProfileCatalog.nameRules.length - 1}
                onclick={() => void moveRule(i, 1)}
              >
                Down
              </button>
              <button class="btn btn-sm preset-filled-error-500" type="button" onclick={() => void removeRule(rule.id)}>
                Remove
              </button>
            </div>
          </div>
          <label class="label">
            <span class="label-text">Pattern</span>
            <input
              class="input"
              value={rule.pattern}
              oninput={(e) =>
                void updateRule(rule.id, { pattern: (e.currentTarget as HTMLInputElement).value })}
            />
          </label>
          <label class="label mt-3">
            <span class="label-text">Match mode</span>
            <select
              class="select"
              value={rule.matchMode}
              onchange={(e) =>
                void updateRule(rule.id, {
                  matchMode: (e.currentTarget as HTMLSelectElement).value as ProfileNameMatchMode,
                })}
            >
              {#each matchModes as mode (mode)}
                <option value={mode}>{mode}</option>
              {/each}
            </select>
          </label>
          <label class="label mt-3">
            <span class="label-text">Profile</span>
            <select
              class="select"
              value={rule.profileId}
              onchange={(e) =>
                void updateRule(rule.id, { profileId: (e.currentTarget as HTMLSelectElement).value })}
            >
              {#each $deviceProfileCatalog.profiles as p (p.id)}
                <option value={p.id}>{p.label} ({p.id})</option>
              {/each}
            </select>
          </label>
        </li>
      {:else}
        <li class="text-sm text-[color:var(--color-surface-700-300)]">No rules.</li>
      {/each}
    </ul>
  </article>
</section>
