<script lang="ts">
  import type { Component, Snippet } from "svelte";
  import { onMount } from "svelte";
  import { page } from "$app/state";
  import { ArrowLeft, Bug, Home, ScrollText, Settings } from "@lucide/svelte";
  import { Navigation } from "@skeletonlabs/skeleton-svelte";
  import { initializeBleSession } from "$lib/stores/bleSession";
  import { hydrateBatteryHistory } from "$lib/stores/batteryHistory";
  import { hydrateRememberedDevices } from "$lib/stores/devices";

  let { children }: { children: Snippet } = $props();

  const pathname = $derived(page.url.pathname);
  const showBackButton = $derived(pathname !== "/home");

  function goBack(): void {
    if (window.history.length > 1) {
      window.history.back();
      return;
    }
    window.location.assign("/home");
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
    void initializeBleSession();
    void hydrateRememberedDevices();
    void hydrateBatteryHistory();
  });
</script>

<div class="mx-auto flex h-dvh max-h-dvh min-h-0 max-w-2xl flex-col overflow-hidden">
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
        </div>
      {/if}
    </div>
  </header>

  <main class="min-h-0 flex-1 overflow-y-auto px-4 py-4">
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
