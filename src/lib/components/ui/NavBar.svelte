<script lang="ts" module>
  import type { Component } from "svelte";

  export type NavItem = {
    label: string;
    href: string;
    icon: Component;
    /** Matches nested routes so a tab stays active, e.g. `/settings/*`. */
    match?: (path: string) => boolean;
  };
</script>

<script lang="ts">
  import { Navigation } from "@skeletonlabs/skeleton-svelte";

  type Props = {
    items: NavItem[];
    pathname: string;
  };

  let { items, pathname }: Props = $props();

  const isCurrent = (item: NavItem): boolean =>
    item.match ? item.match(pathname) : pathname === item.href;
</script>

<!--
  Bottom tab bar. Diagnostics deliberately lives under Settings rather than
  taking a tab: it is a tool for the maintainer, not a daily destination.
-->
<div class="mx-auto w-full max-w-2xl px-3 pb-[max(0.5rem,env(safe-area-inset-bottom,0px))] pt-2">
  <Navigation layout="bar" class="rounded-xl bg-surface-100-900">
    <Navigation.Menu class="grid grid-cols-4 gap-1">
      {#each items as item (item.href)}
        {@const Icon = item.icon}
        {@const current = isCurrent(item)}
        <Navigation.TriggerAnchor
          href={item.href}
          class={[
            "no-underline transition-colors",
            current ? "preset-tonal-primary" : "hover:preset-tonal",
          ].join(" ")}
          aria-current={current ? "page" : undefined}
        >
          <Icon class="size-5" aria-hidden="true" />
          <Navigation.TriggerText>{item.label}</Navigation.TriggerText>
        </Navigation.TriggerAnchor>
      {/each}
    </Navigation.Menu>
  </Navigation>
</div>
