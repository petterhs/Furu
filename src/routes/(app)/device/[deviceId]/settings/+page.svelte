<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { Switch } from "@skeletonlabs/skeleton-svelte";
  import { showCurrentTimeSyncSettings, showHeartRateLoggingSettings } from "$lib/profileCapabilities";
  import { profiles } from "$lib/stores/bleSession";
  import { deviceProfileCatalog } from "$lib/stores/deviceProfiles";
  import {
    CTS_SYNC_DEFAULT_MINUTES,
    CTS_SYNC_MAX_MINUTES,
    CTS_SYNC_MIN_MINUTES,
    clampCtsSyncIntervalMinutes,
    forgetRememberedDevice,
    rememberedDevices,
    updateRememberedDevice,
  } from "$lib/stores/devices";
  import { findRememberedByDeviceRouteParam } from "$lib/utils/deviceId";

  const deviceId = $derived(page.params.deviceId);
  const remembered = $derived(findRememberedByDeviceRouteParam(deviceId, $rememberedDevices));
  const profilePreference = $derived(remembered?.profilePreference ?? "auto");
  const notificationsEnabled = $derived(remembered?.notificationsEnabled ?? true);
  const showCts = $derived(
    remembered ? showCurrentTimeSyncSettings(profilePreference, $deviceProfileCatalog) : false,
  );
  const showHr = $derived(
    remembered ? showHeartRateLoggingSettings(profilePreference, $deviceProfileCatalog) : false,
  );
  const heartRateLoggingEnabled = $derived(remembered?.heartRateLoggingEnabled ?? false);
  const ctsEnabled = $derived(remembered?.currentTimeSyncEnabled ?? true);
  const ctsInterval = $derived(
    clampCtsSyncIntervalMinutes(remembered?.currentTimeSyncIntervalMinutes ?? CTS_SYNC_DEFAULT_MINUTES),
  );

  const intervalPresets = [5, 15, 30, 60, 120, 360, 720, 1440] as const;

  const intervalOptions = $derived(
    (() => {
      const base = [...intervalPresets] as number[];
      if (!base.includes(ctsInterval)) {
        base.push(ctsInterval);
        base.sort((a, b) => a - b);
      }
      return base;
    })(),
  );

  async function onPreferenceChange(value: string): Promise<void> {
    if (!remembered) return;
    await updateRememberedDevice(remembered.id, { profilePreference: value });
  }

  async function onForget(): Promise<void> {
    if (!remembered) return;
    await forgetRememberedDevice(remembered.id);
    await goto("/home");
  }
</script>

<section class="grid gap-4">
  <article class="card border border-[color:var(--color-surface-200-800)] p-4 preset-tonal-surface">
    <h2 class="m-0 mb-3 text-base font-semibold">Device Settings</h2>
    {#if remembered}
      <p class="m-0"><strong>{remembered.name}</strong></p>
      <p class="m-0 mt-2 font-mono text-sm">{remembered.address}</p>

      <label class="label mt-4">
        <span class="label-text">Device profile</span>
        <select
          class="select"
          value={profilePreference}
          onchange={(e) => onPreferenceChange((e.currentTarget as HTMLSelectElement).value)}
        >
          <option value="auto">auto (name detection)</option>
          {#each $profiles as profile (profile.id)}
            <option value={profile.id}>{profile.label}</option>
          {/each}
        </select>
      </label>
      <p class="m-0 mt-2 text-xs text-[color:var(--color-surface-700-300)]">
        Edit profiles and features under
        <a class="anchor" href="/settings/device-profiles">Settings → Device Profiles</a>.
      </p>

      <Switch
        class="mt-4 flex w-full items-center justify-between gap-4"
        checked={notificationsEnabled}
        disabled={!remembered}
        onCheckedChange={({ checked }) => {
          if (!remembered) return;
          void updateRememberedDevice(remembered.id, { notificationsEnabled: checked });
        }}
      >
        <Switch.Label class="text-sm">Notifications enabled</Switch.Label>
        <Switch.Control class="preset-filled-primary-500">
          <Switch.Thumb />
        </Switch.Control>
      </Switch>

      {#if showCts}
        <div class="mt-6 border-t border-[color:var(--color-surface-200-800)] pt-4">
          <h3 class="m-0 mb-2 text-sm font-semibold">Current time sync (CTS)</h3>
          {#if profilePreference === "auto"}
            <p class="m-0 text-sm text-[color:var(--color-surface-700-300)]">
              Profile preference is <strong>auto</strong>: the app picks a profile from the device BLE name using your
              <a class="anchor" href="/settings/device-profiles">Device Profiles</a>. CTS sync runs when that
              profile includes current time.
            </p>
          {:else}
            <p class="m-0 text-sm text-[color:var(--color-surface-700-300)]">
              CTS sync applies while connected and the active profile includes current time.
            </p>
          {/if}
          <p class="m-0 mt-2 text-xs text-[color:var(--color-surface-700-300)]">
            Interval is clamped between {CTS_SYNC_MIN_MINUTES} and {CTS_SYNC_MAX_MINUTES} minutes.
          </p>
          <Switch
            class="mt-4 flex w-full items-center justify-between gap-4"
            checked={ctsEnabled}
            disabled={!remembered}
            onCheckedChange={({ checked }) => {
              if (!remembered) return;
              void updateRememberedDevice(remembered.id, { currentTimeSyncEnabled: checked });
            }}
          >
            <Switch.Label class="text-sm">Automatic time sync</Switch.Label>
            <Switch.Control class="preset-filled-primary-500">
              <Switch.Thumb />
            </Switch.Control>
          </Switch>
          <label class="label mt-4">
            <span class="label-text">Minutes between syncs</span>
            <select
              class="select"
              value={ctsInterval}
              onchange={(e) => {
                if (!remembered) return;
                const v = Number((e.currentTarget as HTMLSelectElement).value);
                void updateRememberedDevice(remembered.id, { currentTimeSyncIntervalMinutes: v });
              }}
            >
              {#each intervalOptions as m (m)}
                <option value={m}>{m} min</option>
              {/each}
            </select>
          </label>
        </div>
      {/if}

      {#if showHr}
        <div class="mt-6 border-t border-[color:var(--color-surface-200-800)] pt-4">
          <h3 class="m-0 mb-2 text-sm font-semibold">Heart rate</h3>
          <p class="m-0 text-sm text-[color:var(--color-surface-700-300)]">
            Shown when the selected device profile (or auto detection candidates) includes heart rate.
          </p>
          <Switch
            class="mt-4 flex w-full items-center justify-between gap-4"
            checked={heartRateLoggingEnabled}
            disabled={!remembered}
            onCheckedChange={({ checked }) => {
              if (!remembered) return;
              void updateRememberedDevice(remembered.id, { heartRateLoggingEnabled: checked });
            }}
          >
            <Switch.Label class="text-sm">Enable heart rate logging</Switch.Label>
            <Switch.Control class="preset-filled-primary-500">
              <Switch.Thumb />
            </Switch.Control>
          </Switch>
        </div>
      {/if}
    {:else}
      <p class="m-0 text-sm text-[color:var(--color-surface-700-300)]">Device not found.</p>
    {/if}
  </article>

  <div class="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
    <button class="btn btn-sm preset-filled-error-500" type="button" onclick={onForget} disabled={!remembered}>
      Forget / Unbind Device
    </button>
  </div>
</section>
