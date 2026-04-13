<script lang="ts">
  import type { Component, Snippet } from "svelte";
  import { onMount } from "svelte";
  import { page } from "$app/state";
  import { Bug, Home } from "@lucide/svelte";
  import { Navigation } from "@skeletonlabs/skeleton-svelte";
  import { initializeBleSession } from "$lib/stores/bleSession";
  import { hydrateRememberedDevices } from "$lib/stores/devices";

  let { children }: { children: Snippet } = $props();

  const pathname = $derived(page.url.pathname);

  const links: { label: string; href: string; icon: Component }[] = [
    { label: "Home", href: "/home", icon: Home },
    { label: "Debug", href: "/debug", icon: Bug },
  ];

  onMount(() => {
    void initializeBleSession();
    void hydrateRememberedDevices();
  });
</script>

<div class="mx-auto flex h-dvh max-h-dvh min-h-0 max-w-2xl flex-col overflow-hidden">
  <header
    class="sticky top-0 z-10 shrink-0 border-b border-surface-200-800 bg-surface-50-950 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top,0px))] backdrop-blur-sm"
  >
    <h1 class="m-0 text-base font-semibold">Furu</h1>
  </header>

  <main class="min-h-0 flex-1 overflow-y-auto px-4 py-4">
    {@render children()}
  </main>

  <footer
    class="shrink-0 border-t border-surface-200-800 bg-surface-100-900 pb-[env(safe-area-inset-bottom,0px)]"
  >
    <Navigation layout="bar">
      <Navigation.Menu class="grid grid-cols-2 gap-2">
        {#each links as link (link.href)}
          {@const Icon = link.icon}
          <Navigation.TriggerAnchor
            href={link.href}
            class="no-underline"
            aria-current={pathname === link.href ? "page" : undefined}
          >
            <Icon class="size-5" aria-hidden="true" />
            <Navigation.TriggerText>{link.label}</Navigation.TriggerText>
          </Navigation.TriggerAnchor>
        {/each}
      </Navigation.Menu>
    </Navigation>
  </footer>
</div>
