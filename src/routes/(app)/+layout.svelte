<script lang="ts">
  import type { Snippet } from "svelte";
  import { onMount } from "svelte";
  import { page } from "$app/state";
  import { Navigation } from "@skeletonlabs/skeleton-svelte";
  import { initializeBleSession } from "$lib/stores/bleSession";
  import { hydrateRememberedDevices } from "$lib/stores/devices";

  let { children }: { children: Snippet } = $props();

  const pathname = $derived(page.url.pathname);

  const links = [
    { label: "Home", href: "/home", icon: "home" as const },
    { label: "Debug", href: "/debug", icon: "debug" as const },
  ];

  onMount(() => {
    void initializeBleSession();
    void hydrateRememberedDevices();
  });
</script>

{#snippet navIconHome()}
  <svg class="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
    <path d="M3 9.5 12 3l9 6.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1Z" stroke-linecap="round" stroke-linejoin="round" />
  </svg>
{/snippet}

{#snippet navIconDebug()}
  <svg class="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
    <path d="m14 3 1.5 1.5" stroke-linecap="round" />
    <path d="M9 9 6.5 6.5a2.12 2.12 0 0 0-3 3L6 12" stroke-linecap="round" stroke-linejoin="round" />
    <path d="m15 15 2.5 2.5a2.12 2.12 0 0 0 3-3L18 12" stroke-linecap="round" stroke-linejoin="round" />
    <path d="M12 22v-4" stroke-linecap="round" />
    <path d="M12 8V2" stroke-linecap="round" />
    <circle cx="12" cy="12" r="2" />
  </svg>
{/snippet}

<div class="mx-auto flex min-h-dvh max-w-2xl flex-col">
  <header
    class="sticky top-0 z-10 border-b border-surface-200-800 bg-surface-50-950 px-4 py-3 backdrop-blur-sm"
  >
    <h1 class="m-0 text-base font-semibold">Furu Companion</h1>
  </header>

  <main class="flex-1 px-4 py-4 pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))]">
    {@render children()}
  </main>

  <div class="pointer-events-none fixed inset-x-0 bottom-0 z-20 flex justify-center px-0">
    <div
      class="pointer-events-auto w-full max-w-2xl border-t border-surface-200-800 pb-[max(env(safe-area-inset-bottom),0.5rem)]"
    >
      <Navigation layout="bar">
        <Navigation.Menu class="grid grid-cols-2 gap-2">
          {#each links as link (link.href)}
            <Navigation.TriggerAnchor
              href={link.href}
              class="no-underline"
              aria-current={pathname === link.href ? "page" : undefined}
            >
              {#if link.icon === "home"}
                {@render navIconHome()}
              {:else}
                {@render navIconDebug()}
              {/if}
              <Navigation.TriggerText>{link.label}</Navigation.TriggerText>
            </Navigation.TriggerAnchor>
          {/each}
        </Navigation.Menu>
      </Navigation>
    </div>
  </div>
</div>
