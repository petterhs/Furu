<script lang="ts">
  import type { Component, Snippet } from "svelte";
  import { onMount } from "svelte";
  import { page } from "$app/state";
  import { ArrowLeft, Bug, Home, ScrollText, Settings } from "@lucide/svelte";
  import { Navigation } from "@skeletonlabs/skeleton-svelte";
  import { initializeBleSession } from "$lib/stores/bleSession";
  import { hydrateBatteryHistory } from "$lib/stores/batteryHistory";
  import { hydrateConnectionHistory } from "$lib/stores/connectionHistory";
  import { hydrateRememberedDevices } from "$lib/stores/devices";
  import { hydrateAppSettings } from "$lib/stores/appSettings";
  import { hydrateNotificationFilters } from "$lib/stores/notificationFilters";
  import { requestPromptablePermissions } from "$lib/stores/permissions";
  import { invoke } from "@tauri-apps/api/core";
  import { getVersion } from "@tauri-apps/api/app";
  import { dfuCancelable, dfuSession, dismissDfuSession, requestDfuCancel } from "$lib/stores/dfuSession";

  let { children }: { children: Snippet } = $props();
  let appVersion = $state<string | null>(null);

  const pathname = $derived(page.url.pathname);
  const showBackButton = $derived(pathname !== "/home");

  function goBack(): void {
    if (window.history.length > 1) {
      window.history.back();
      return;
    }
    window.location.assign("/home");
  }

  function dfuPhaseLabel(phase: string, percent: number): string {
    if (phase === "selecting_package") return "Choose a firmware package in the Android file picker.";
    if (phase === "staging") return "Copying the selected file into app storage.";
    if (phase === "downloading") return "Downloading and checking the Kongle release package.";
    return `${phase.replaceAll("_", " ")} (${percent}%)`;
  }

  function cancelDfu(): void {
    requestDfuCancel();
    void invoke("ble_dfu_cancel").catch(() => {});
  }

  const links: { label: string; href: string; icon: Component; match?: (path: string) => boolean }[] = [
    { label: "Home", href: "/home", icon: Home },
    { label: "Debug", href: "/debug", icon: Bug },
    { label: "Logs", href: "/log", icon: ScrollText },
    {
      label: "Settings",
      href: "/settings",
      icon: Settings,
      match: (path) => path === "/settings" || path.startsWith("/settings/"),
    },
  ];

  onMount(() => {
    void getVersion().then((version) => { appVersion = version; }).catch(() => {});
    void initializeBleSession();
    void hydrateAppSettings();
    void hydrateNotificationFilters();
    void requestPromptablePermissions();
    void hydrateRememberedDevices();
    void hydrateBatteryHistory();
    void hydrateConnectionHistory();
  });
</script>

<div class="mx-auto flex h-dvh max-h-dvh min-h-0 min-w-0 max-w-2xl flex-col overflow-hidden">
  <header
    class="sticky top-0 z-10 shrink-0 border-b border-surface-200-800 bg-surface-50-950 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top,0px))] backdrop-blur-sm"
  >
    <div class="flex min-h-8 items-center">
      {#if showBackButton}
        <button
          class="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[color:var(--color-primary-600)] bg-[color:var(--color-primary-500)] text-white"
          type="button"
          onclick={goBack}
          aria-label="Go back"
        >
          <ArrowLeft class="size-4 text-white" />
        </button>
      {:else}
        <div class="flex items-center gap-2">
          <img src="/furu-logo.png" alt="Furu icon" class="h-10 w-10 rounded-md" />
          <h1 class="m-0 text-base font-semibold">Furu</h1>
          {#if appVersion}<span class="font-mono text-xs text-[color:var(--color-surface-700-300)]">v{appVersion}</span>{/if}
        </div>
      {/if}
      {#if showBackButton && appVersion}
        <span class="ml-auto font-mono text-xs text-[color:var(--color-surface-700-300)]">Furu v{appVersion}</span>
      {/if}
    </div>
    {#if $dfuSession}
      <div class="mt-3 flex items-center justify-between gap-3 rounded-md border border-[color:var(--color-primary-500)] p-3 text-sm" role="status" aria-live="polite">
        <div class="min-w-0 flex-1 space-y-1">
          <p class="m-0 font-medium">
            Firmware update for {$dfuSession.deviceName}
            {#if $dfuSession.outcome === "running"}(in progress){:else if $dfuSession.outcome === "success"}(complete){:else}(failed){/if}
          </p>
          {#if $dfuSession.outcome === "running"}
            <p class="m-0">
              {dfuPhaseLabel($dfuSession.phase, $dfuSession.percent)}
              {#if $dfuSession.phase === "selecting_package"}Cancel if the picker does not open.{:else if $dfuSession.phase === "downloading"}Keep Furu open until the download finishes.{:else}Keep Furu open and stay near the watch.{/if}
            </p>
            {#if $dfuSession.phase !== "selecting_package" && $dfuSession.phase !== "downloading"}
              <progress class="h-1.5 w-full accent-[color:var(--color-primary-500)]" max={100} value={$dfuSession.percent}></progress>
            {/if}
          {:else if $dfuSession.outcome === "success"}
            <p class="m-0">Activation was requested. Reconnect to check the watch; Furu cannot confirm installation.</p>
          {:else}
            <p class="m-0 text-[color:var(--color-error-700-300)]">{$dfuSession.error ?? "The update did not finish."}</p>
          {/if}
        </div>
        {#if $dfuSession.outcome === "running" && $dfuCancelable}
          <button class="btn btn-sm preset-tonal-surface shrink-0" type="button" onclick={cancelDfu}>
            Cancel
          </button>
        {:else if $dfuSession.outcome !== "running"}
          <button class="btn btn-sm preset-tonal-surface shrink-0" type="button" onclick={dismissDfuSession} aria-label="Dismiss firmware update result">
            Dismiss
          </button>
        {/if}
      </div>
    {/if}
  </header>

  <main class="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-4 py-4">
    {@render children()}
  </main>

  <footer
    class="shrink-0 border-t border-surface-200-800 bg-surface-100-900 pb-[env(safe-area-inset-bottom,0px)]"
  >
    <Navigation layout="bar">
      <Navigation.Menu class="grid grid-cols-4 gap-2">
        {#each links as link (link.href)}
          {@const Icon = link.icon}
          {@const isCurrent = link.match ? link.match(pathname) : pathname === link.href}
          <Navigation.TriggerAnchor
            href={link.href}
            class="no-underline"
            aria-current={isCurrent ? "page" : undefined}
          >
            <Icon class="size-5" aria-hidden="true" />
            <Navigation.TriggerText>{link.label}</Navigation.TriggerText>
          </Navigation.TriggerAnchor>
        {/each}
      </Navigation.Menu>
    </Navigation>
  </footer>
</div>
