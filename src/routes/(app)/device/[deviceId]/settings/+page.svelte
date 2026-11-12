<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { Switch } from "@skeletonlabs/skeleton-svelte";
  import { FeatureId } from "#lib/bleContract";
  import { showCurrentTimeSyncSettings, showHeartRateLoggingSettings } from "#lib/profileCapabilities";
  import { profiles } from "#lib/stores/bleSession";
  import { deviceProfileCatalog } from "#lib/stores/deviceProfiles";
  import { confirm } from "#lib/stores/confirm";
  import { toastCaught, toastSuccess } from "#lib/stores/toast";
  import {
    AUTO_RECONNECT_INTERVAL_DEFAULT_MINUTES,
    AUTO_RECONNECT_INTERVAL_MAX_MINUTES,
    AUTO_RECONNECT_INTERVAL_MIN_MINUTES,
    AUTO_RECONNECT_MAX_ATTEMPTS_CAP,
    AUTO_RECONNECT_MAX_ATTEMPTS_DEFAULT,
    CTS_SYNC_DEFAULT_MINUTES,
    CTS_SYNC_MAX_MINUTES,
    CTS_SYNC_MIN_MINUTES,
    clampAutoReconnectIntervalMinutes,
    clampAutoReconnectMaxAttempts,
    clampCtsSyncIntervalMinutes,
    deviceDisplayName,
    forgetRememberedDevice,
    rememberedDevices,
    updateRememberedDevice,
  } from "#lib/stores/devices";
  import { dfuInProgress } from "#lib/stores/dfuSession";
  import { forgetWatchConfig } from "#lib/stores/watchConfig";
  import { findRememberedByDeviceRouteParam } from "#lib/utils/deviceId";
  import WatchConfigurationCard from "#lib/components/device/WatchConfigurationCard.svelte";
  import Card from "#lib/components/ui/Card.svelte";
  import PageHeading from "#lib/components/ui/PageHeading.svelte";
  import SettingRow from "#lib/components/ui/SettingRow.svelte";

  const deviceId = $derived(page.params.deviceId ?? "");
  const remembered = $derived(findRememberedByDeviceRouteParam(deviceId, $rememberedDevices));

  /*
   * The nickname draft is keyed by device id so switching devices starts from
   * that device's saved value without a state-writing effect.
   */
  let nameDrafts = $state<Record<string, string>>({});
  let nameError = $state<string | null>(null);
  let savingName = $state(false);

  const nameDraft = $derived(nameDrafts[deviceId] ?? remembered?.nickname ?? "");

  function setNameDraft(value: string): void {
    nameDrafts = { ...nameDrafts, [deviceId]: value };
  }

  const profilePreference = $derived(remembered?.profilePreference ?? "auto");
  const notificationsEnabled = $derived(remembered?.notificationsEnabled ?? true);
  const showCts = $derived(
    remembered ? showCurrentTimeSyncSettings(profilePreference, $deviceProfileCatalog) : false,
  );
  const showHr = $derived(
    remembered ? showHeartRateLoggingSettings(profilePreference, $deviceProfileCatalog) : false,
  );
  const heartRateLoggingEnabled = $derived(remembered?.heartRateLoggingEnabled ?? false);
  const autoReconnect = $derived(remembered?.autoReconnect ?? true);
  const reconnectIntervalMinutes = $derived(
    clampAutoReconnectIntervalMinutes(
      remembered?.autoReconnectIntervalMinutes ?? AUTO_RECONNECT_INTERVAL_DEFAULT_MINUTES,
    ),
  );
  const reconnectMaxAttempts = $derived(
    clampAutoReconnectMaxAttempts(
      remembered?.autoReconnectMaxAttempts ?? AUTO_RECONNECT_MAX_ATTEMPTS_DEFAULT,
    ),
  );
  const ctsEnabled = $derived(remembered?.currentTimeSyncEnabled ?? true);
  const ctsInterval = $derived(
    clampCtsSyncIntervalMinutes(remembered?.currentTimeSyncIntervalMinutes ?? CTS_SYNC_DEFAULT_MINUTES),
  );
  const intervalPresets = [5, 15, 30, 60, 120, 360, 720, 1440] as const;
  const intervalOptions = $derived.by(() => {
    const base = [...intervalPresets] as number[];
    if (!base.includes(ctsInterval)) {
      base.push(ctsInterval);
      base.sort((a, b) => a - b);
    }
    return base;
  });

  /** Kongle devices get the watch-setup card; other profiles cannot use it. */
  const isKongle = $derived(
    Boolean(remembered) &&
      (remembered!.profilePreference === "kongle" || remembered!.detectedProfileId === "kongle"),
  );
  const watchConfigSupported = $derived(
    isKongle ||
      $deviceProfileCatalog.profiles
        .find((profile) => profile.id === profilePreference)
        ?.featureIds.includes(FeatureId.kongleWatchConfig) === true,
  );

  async function patch(patchValues: Parameters<typeof updateRememberedDevice>[1], errorTitle: string): Promise<void> {
    if (!remembered) return;
    try {
      await updateRememberedDevice(remembered.id, patchValues);
    } catch (error) {
      toastCaught(errorTitle, error);
    }
  }

  async function saveName(): Promise<void> {
    if (!remembered || savingName) return;
    savingName = true;
    nameError = null;
    try {
      await updateRememberedDevice(remembered.id, { nickname: nameDraft });
      // Clear the local draft so the field follows the saved value again.
      const next = { ...nameDrafts };
      delete next[deviceId];
      nameDrafts = next;
      toastSuccess("Device name saved");
    } catch (error) {
      nameError = String(error);
    } finally {
      savingName = false;
    }
  }

  async function onForget(): Promise<void> {
    if (!remembered) return;
    const ok = await confirm({
      title: `Forget ${deviceDisplayName(remembered)}?`,
      body: "This removes the device, its local settings and its history from Furu. The watch itself keeps its firmware and pairing.",
      confirmLabel: "Forget device",
      destructive: true,
    });
    if (!ok) return;
    const id = remembered.id;
    if (!(await forgetRememberedDevice(id))) return;
    await forgetWatchConfig(id);
    await goto("/home");
  }
</script>

<div class="grid gap-4">
  <PageHeading
    title={remembered ? deviceDisplayName(remembered) : "Unknown device"}
    description="Settings and watch screen"
  >
    {#snippet actions()}
      <a class="btn btn-sm preset-tonal-surface" href={`/device/${deviceId}`}>Overview</a>
    {/snippet}
  </PageHeading>

  {#if !remembered}
    <Card>
      <p class="m-0 text-sm text-surface-700-300">
        Furu does not know this device. It may have been forgotten on another screen.
      </p>
    </Card>
  {:else}
    <Card title="Identity">
      <div class="grid gap-4">
        <SettingRow label="Name in Furu" hint="Only a label; firmware detection uses the Bluetooth name." stacked>
          <div class="flex gap-2">
            <input
              class="input flex-1"
              maxlength="60"
              placeholder={remembered.name}
              value={nameDraft}
              oninput={(event) => setNameDraft(event.currentTarget.value)}
            />
            <button
              class="btn btn-sm preset-filled-primary-500 shrink-0"
              type="button"
              disabled={savingName}
              onclick={() => void saveName()}
            >
              {savingName ? "Saving…" : "Save"}
            </button>
          </div>
          {#snippet footer()}
            <p class="m-0 text-xs text-surface-700-300">
              Bluetooth name: {remembered.name}. Clear the field to fall back to it.
            </p>
            {#if nameError}<p class="m-0 mt-1 text-xs text-error-500" role="alert">{nameError}</p>{/if}
          {/snippet}
        </SettingRow>

        <SettingRow label="Device profile" hint="Controls which Bluetooth features Furu uses." stacked>
          <select
            class="select"
            disabled={$dfuInProgress}
            value={profilePreference}
            onchange={(event) => void patch({ profilePreference: event.currentTarget.value }, "Could not change the profile")}
          >
            <option value="auto">Auto (detect from name)</option>
            {#each $profiles as profile (profile.id)}
              <option value={profile.id}>{profile.label}</option>
            {/each}
          </select>
          {#snippet footer()}
            <p class="m-0 text-xs text-surface-700-300">
              Edit profiles and their features under
              <a class="anchor" href="/settings/device-profiles">Settings → Device profiles</a>.
            </p>
          {/snippet}
        </SettingRow>
      </div>
    </Card>

    <Card title="Notifications">
      <SettingRow label="Forward notifications" hint="Send this watch the alerts allowed by the global filters.">
        <Switch
          checked={notificationsEnabled}
          onCheckedChange={({ checked }) => void patch({ notificationsEnabled: checked }, "Could not save this setting")}
        >
          <Switch.HiddenInput />
          <Switch.Control class="preset-filled-primary-500"><Switch.Thumb /></Switch.Control>
        </Switch>
      </SettingRow>
    </Card>

    <Card title="Connection">
      <div class="grid gap-4">
        <SettingRow
          label="Reconnect automatically"
          hint="After an unexpected drop, retry in the background with a direct connect instead of scanning."
        >
          <Switch
            checked={autoReconnect}
            onCheckedChange={({ checked }) => void patch({ autoReconnect: checked }, "Could not save this setting")}
          >
            <Switch.HiddenInput />
            <Switch.Control class="preset-filled-primary-500"><Switch.Thumb /></Switch.Control>
          </Switch>
        </SettingRow>

        <SettingRow
          label="Minutes between retries"
          hint={`${AUTO_RECONNECT_INTERVAL_MIN_MINUTES}–${AUTO_RECONNECT_INTERVAL_MAX_MINUTES} minutes. The first retry starts after five seconds.`}
          stacked
        >
          <input
            class="input"
            type="number"
            min={AUTO_RECONNECT_INTERVAL_MIN_MINUTES}
            max={AUTO_RECONNECT_INTERVAL_MAX_MINUTES}
            step="1"
            value={reconnectIntervalMinutes}
            onchange={(event) =>
              void patch(
                { autoReconnectIntervalMinutes: Number(event.currentTarget.value) },
                "Could not save the retry interval",
              )}
          />
        </SettingRow>

        <SettingRow
          label="Maximum failed retries"
          hint={`0 means no limit. Default ${AUTO_RECONNECT_MAX_ATTEMPTS_DEFAULT}, capped at ${AUTO_RECONNECT_MAX_ATTEMPTS_CAP}.`}
          stacked
        >
          <input
            class="input"
            type="number"
            min="0"
            max={AUTO_RECONNECT_MAX_ATTEMPTS_CAP}
            step="1"
            value={reconnectMaxAttempts}
            onchange={(event) =>
              void patch(
                { autoReconnectMaxAttempts: Number(event.currentTarget.value) },
                "Could not save the retry limit",
              )}
          />
        </SettingRow>
      </div>
    </Card>

    {#if showCts}
      <Card
        title="Time sync"
        description="Keeps the watch clock aligned with the phone while connected."
      >
        <div class="grid gap-4">
          <SettingRow
            label="Sync automatically"
            hint={profilePreference === "auto"
              ? "With the profile on auto, sync runs when the detected profile includes current time."
              : "Runs while the watch is connected and the profile includes current time."}
          >
            <Switch
              checked={ctsEnabled}
              onCheckedChange={({ checked }) => void patch({ currentTimeSyncEnabled: checked }, "Could not save this setting")}
            >
              <Switch.HiddenInput />
              <Switch.Control class="preset-filled-primary-500"><Switch.Thumb /></Switch.Control>
            </Switch>
          </SettingRow>
          <SettingRow
            label="Minutes between syncs"
            hint={`${CTS_SYNC_MIN_MINUTES}–${CTS_SYNC_MAX_MINUTES} minutes.`}
            stacked
          >
            <select
              class="select"
              value={ctsInterval}
              onchange={(event) =>
                void patch(
                  { currentTimeSyncIntervalMinutes: Number(event.currentTarget.value) },
                  "Could not save the sync interval",
                )}
            >
              {#each intervalOptions as minutes (minutes)}
                <option value={minutes}>{minutes} min</option>
              {/each}
            </select>
          </SettingRow>
        </div>
      </Card>
    {/if}

    {#if showHr}
      <Card title="Heart rate">
        <SettingRow
          label="Enable heart rate logging"
          hint="Only applies when the profile includes the heart rate service."
        >
          <Switch
            checked={heartRateLoggingEnabled}
            onCheckedChange={({ checked }) => void patch({ heartRateLoggingEnabled: checked }, "Could not save this setting")}
          >
            <Switch.HiddenInput />
            <Switch.Control class="preset-filled-primary-500"><Switch.Thumb /></Switch.Control>
          </Switch>
        </SettingRow>
      </Card>
    {/if}

    {#if remembered && watchConfigSupported}
      <WatchConfigurationCard deviceId={remembered.id} locked={$dfuInProgress} />
    {/if}

    <Card title="Remove this device">
      <p class="m-0 text-sm text-surface-700-300">
        Forgetting a device clears its nickname, preferences and the history Furu recorded.
      </p>
      <button
        class="btn btn-sm preset-filled-error-500 mt-3"
        type="button"
        disabled={$dfuInProgress}
        onclick={() => void onForget()}
      >
        Forget device
      </button>
    </Card>
  {/if}
</div>
