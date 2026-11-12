<script lang="ts">
  import type { Component, Snippet } from "svelte";
  import { onMount } from "svelte";
  import { page } from "$app/state";
  import { Blocks, House, Settings, Watch } from "@lucide/svelte";
  import { getVersion } from "@tauri-apps/api/app";
  import { initializeBleSession } from "#lib/stores/bleSession";
  import { hydrateBatteryHistory } from "#lib/stores/batteryHistory";
  import { hydrateConnectionHistory } from "#lib/stores/connectionHistory";
  import { hydrateRememberedDevices } from "#lib/stores/devices";
  import { hydrateAppSettings, watchSystemTheme } from "#lib/stores/appSettings";
  import { hydrateNotificationFilters } from "#lib/stores/notificationFilters";
  import { hydrateDeviceProfiles } from "#lib/stores/deviceProfiles";
  import { hydrateWatchConfig } from "#lib/stores/watchConfig";
  import { hydrateIntegrations } from "#lib/stores/integrations";
  import { requestPromptablePermissions } from "#lib/stores/permissions";
  import { toastError } from "#lib/stores/toast";
  import AppHeader from "#lib/components/ui/AppHeader.svelte";
  import NavBar, { type NavItem } from "#lib/components/ui/NavBar.svelte";
  import DfuBanner from "#lib/components/ui/DfuBanner.svelte";
  import ConfirmDialog from "#lib/components/ui/ConfirmDialog.svelte";
  import Toaster from "#lib/components/ui/Toaster.svelte";

  let { children }: { children: Snippet } = $props();

  let appVersion = $state<string | null>(null);

  const pathname = $derived(page.url.pathname);
  /** Only the four root tabs own the tab bar; everything else is a child route. */
  const rootRoutes = ["/home", "/devices", "/integrations", "/settings"];
  const isRootRoute = $derived(rootRoutes.includes(pathname));
  const showBack = $derived(!isRootRoute);

  const navItems: NavItem[] = [
    { label: "Home", href: "/home", icon: House },
    {
      label: "Devices",
      href: "/devices",
      icon: Watch,
      match: (path) => path === "/devices" || path.startsWith("/devices/") || path.startsWith("/device/"),
    },
    {
      label: "Integrations",
      href: "/integrations",
      icon: Blocks,
      match: (path) => path === "/integrations" || path.startsWith("/integrations/"),
    },
    {
      label: "Settings",
      href: "/settings",
      icon: Settings,
      match: (path) => path === "/settings" || path.startsWith("/settings/"),
    },
  ];

  function goBack(): void {
    if (window.history.length > 1) {
      window.history.back();
      return;
    }
    window.location.assign("/home");
  }

  onMount(() => {
    void getVersion().then((version) => { appVersion = version; }).catch(() => {});
    void (async () => {
      // Profiles and settings decide which features exist, so they hydrate first.
      await Promise.allSettled([
        hydrateAppSettings(),
        hydrateDeviceProfiles(),
        hydrateNotificationFilters(),
        hydrateRememberedDevices(),
        hydrateBatteryHistory(),
        hydrateConnectionHistory(),
        hydrateWatchConfig(),
        hydrateIntegrations(),
      ]);
      // A failed BLE start must not take the shell down with it: the device list
      // and settings stay usable and the error is reported instead.
      try {
        await initializeBleSession();
      } catch (error) {
        toastError("Bluetooth could not start", error instanceof Error ? error.message : String(error));
      }
    })();
    void requestPromptablePermissions();
    return watchSystemTheme();
  });
</script>

<div class="mx-auto flex h-dvh max-h-dvh min-h-0 min-w-0 max-w-2xl flex-col overflow-hidden">
  <AppHeader {appVersion} showBack={showBack} onBack={goBack}>
    <DfuBanner />
  </AppHeader>

  <main class="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-4 py-4">
    <div class="mx-auto max-w-2xl">
      {@render children()}
    </div>
  </main>

  {#if isRootRoute}
    <footer class="shrink-0 border-t border-surface-200-800 bg-surface-50-950">
      <NavBar items={navItems} {pathname} />
    </footer>
  {/if}
</div>

<ConfirmDialog />
<Toaster />
