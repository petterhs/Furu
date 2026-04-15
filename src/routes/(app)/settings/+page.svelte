<script lang="ts">
  import { Switch } from "@skeletonlabs/skeleton-svelte";
  import { appSettings, patchAppSettings } from "$lib/stores/appSettings";
</script>

<section class="grid gap-4">
  <h2 class="m-0 mb-2 text-base font-semibold">Settings</h2>
  <article class="card preset-tonal-surface border border-[color:var(--color-surface-200-800)] p-4">
    <h3 class="m-0 text-sm font-semibold">Notification Forwarding</h3>
    <p class="m-0 mt-2 text-sm text-[color:var(--color-surface-700-300)]">
      Enable or disable forwarding notifications from your phone to connected devices.
    </p>
    <Switch
      class="mt-4 flex w-full items-center justify-between gap-4"
      checked={$appSettings.notificationForwardingEnabled}
      onCheckedChange={({ checked }) => {
        void patchAppSettings((draft) => {
          draft.notificationForwardingEnabled = checked;
        });
      }}
    >
      <Switch.Label class="text-sm">Global notification forwarding</Switch.Label>
      <Switch.Control class="preset-filled-primary-500">
        <Switch.Thumb />
      </Switch.Control>
    </Switch>
  </article>
  <a
    class="card preset-tonal-surface block border border-[color:var(--color-surface-200-800)] p-4 no-underline text-inherit outline-offset-[-2px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--color-primary-500)]"
    href="/settings/device-profiles"
  >
    <h3 class="m-0 text-sm font-semibold">Device Profiles</h3>
    <p class="m-0 mt-2 text-sm text-[color:var(--color-surface-700-300)]">
      Name detection rules, built-in and custom profiles, and which catalog features each profile includes.
    </p>
  </a>
  <a
    class="card preset-tonal-surface block border border-[color:var(--color-surface-200-800)] p-4 no-underline text-inherit outline-offset-[-2px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--color-primary-500)]"
    href="/settings/notification-filters"
  >
    <h3 class="m-0 text-sm font-semibold">Notification Filters</h3>
    <p class="m-0 mt-2 text-sm text-[color:var(--color-surface-700-300)]">
      Manage a blocklist of app package notifications that should not be forwarded to your watch.
    </p>
  </a>
  <a
    class="card preset-tonal-surface block border border-[color:var(--color-surface-200-800)] p-4 no-underline text-inherit outline-offset-[-2px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--color-primary-500)]"
    href="/settings/permissions"
  >
    <h3 class="m-0 text-sm font-semibold">Permissions</h3>
    <p class="m-0 mt-2 text-sm text-[color:var(--color-surface-700-300)]">
      Review Bluetooth and notification permissions, request promptable access, and open system settings for
      notification listener access.
    </p>
  </a>
</section>
