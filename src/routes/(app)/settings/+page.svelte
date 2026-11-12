<script lang="ts">
  import { Switch } from "@skeletonlabs/skeleton-svelte";
  import { goto } from "$app/navigation";
  import {
    BellRing,
    ChevronRight,
    ClipboardList,
    Info,
    SlidersHorizontal,
    Stethoscope,
  } from "@lucide/svelte";
  import { appSettings, patchAppSettings } from "#lib/stores/appSettings";
  import type { ThemeMode } from "#lib/persistence/appSettingsStore";
  import { toastCaught } from "#lib/stores/toast";
  import Card from "#lib/components/ui/Card.svelte";
  import ListRow from "#lib/components/ui/ListRow.svelte";
  import PageHeading from "#lib/components/ui/PageHeading.svelte";
  import SettingRow from "#lib/components/ui/SettingRow.svelte";

  const THEME_OPTIONS: { value: ThemeMode; label: string }[] = [
    { value: "dark", label: "Mocha (dark)" },
    { value: "light", label: "Latte (light)" },
    { value: "system", label: "Match the phone" },
  ];

  async function patch(mutator: Parameters<typeof patchAppSettings>[0], errorTitle: string): Promise<void> {
    try {
      await patchAppSettings(mutator);
    } catch (error) {
      toastCaught(errorTitle, error);
    }
  }
</script>

<div class="grid gap-4">
  <PageHeading title="Settings" description="Appearance, notifications and device defaults." />

  <Card title="Appearance">
    <SettingRow label="Theme" hint="Catppuccin Mocha is the default; Latte is available in light environments." stacked>
      <select
        class="select"
        value={$appSettings.themeMode}
        onchange={(event) =>
          void patch((draft) => {
            draft.themeMode = event.currentTarget.value as ThemeMode;
          }, "Could not change the theme")}
      >
        {#each THEME_OPTIONS as option (option.value)}
          <option value={option.value}>{option.label}</option>
        {/each}
      </select>
    </SettingRow>
  </Card>

  <Card title="Notifications">
    <SettingRow
      label="Forward notifications"
      hint="Master switch. Per-device and per-app filters still apply."
    >
      <Switch
        checked={$appSettings.notificationForwardingEnabled}
        onCheckedChange={({ checked }) =>
          void patch((draft) => {
            draft.notificationForwardingEnabled = checked;
          }, "Could not save the notification setting")}
      >
        <Switch.HiddenInput />
        <Switch.Control class="preset-filled-primary-500"><Switch.Thumb /></Switch.Control>
      </Switch>
    </SettingRow>
    <div class="mt-4">
      <ListRow
        title="Notification filters"
        subtitle="Block specific apps from reaching the watch."
        onclick={() => void goto("/settings/notification-filters")}
      >
        {#snippet leading()}<BellRing class="size-4" />{/snippet}
        {#snippet trailing()}<ChevronRight class="size-4 text-surface-700-300" />{/snippet}
      </ListRow>
    </div>
  </Card>

  <Card title="Permissions">
    <ListRow
      title="Bluetooth and notification access"
      subtitle="Check what Furu is allowed to use, and open Android's settings."
      onclick={() => void goto("/settings/permissions")}
    >
      {#snippet leading()}<Stethoscope class="size-4" />{/snippet}
      {#snippet trailing()}<ChevronRight class="size-4 text-surface-700-300" />{/snippet}
    </ListRow>
  </Card>

  <Card title="Devices">
    <div class="grid gap-2">
      <ListRow
        title="Device profiles"
        subtitle="Name detection rules and the features each firmware profile enables."
        onclick={() => void goto("/settings/device-profiles")}
      >
        {#snippet leading()}<SlidersHorizontal class="size-4" />{/snippet}
        {#snippet trailing()}<ChevronRight class="size-4 text-surface-700-300" />{/snippet}
      </ListRow>
    </div>
    <SettingRow
      label="Show development firmware"
      hint="Include release candidates and PR previews in the firmware list. These are trial images."
    >
      <Switch
        checked={$appSettings.firmwareDevelopmentChannel}
        onCheckedChange={({ checked }) =>
          void patch((draft) => {
            draft.firmwareDevelopmentChannel = checked;
          }, "Could not save the firmware channel")}
      >
        <Switch.HiddenInput />
        <Switch.Control class="preset-filled-primary-500"><Switch.Thumb /></Switch.Control>
      </Switch>
    </SettingRow>
  </Card>

  <Card title="Advanced">
    <div class="grid gap-2">
      <ListRow
        title="Diagnostics"
        subtitle="Connection log and low-level Bluetooth tools."
        onclick={() => void goto("/settings/diagnostics")}
      >
        {#snippet leading()}<ClipboardList class="size-4" />{/snippet}
        {#snippet trailing()}<ChevronRight class="size-4 text-surface-700-300" />{/snippet}
      </ListRow>
      <ListRow
        title="About Furu"
        subtitle="Version, licence and where the project lives."
        onclick={() => void goto("/settings/about")}
      >
        {#snippet leading()}<Info class="size-4" />{/snippet}
        {#snippet trailing()}<ChevronRight class="size-4 text-surface-700-300" />{/snippet}
      </ListRow>
    </div>
  </Card>
</div>
