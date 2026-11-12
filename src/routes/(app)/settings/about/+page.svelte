<script lang="ts">
  import { onMount } from "svelte";
  import { getVersion } from "@tauri-apps/api/app";
  import { openUrl } from "@tauri-apps/plugin-opener";
  import Card from "#lib/components/ui/Card.svelte";
  import PageHeading from "#lib/components/ui/PageHeading.svelte";

  let version = $state<string | null>(null);
  const links = [
    { label: "Source and issues", href: "https://github.com/petterhs/furu" },
    { label: "Kongle firmware", href: "https://github.com/petterhs/Kongle" },
    { label: "InfiniTime", href: "https://github.com/InfiniTimeOrg/InfiniTime" },
    { label: "Catppuccin palette", href: "https://github.com/catppuccin/palette" },
  ];

  onMount(() => {
    void getVersion().then((value) => { version = value; }).catch(() => {});
  });

  async function open(href: string): Promise<void> {
    await openUrl(href).catch(() => {});
  }
</script>

<div class="grid gap-4">
  <PageHeading title="About Furu" description="A companion app for the PineTime." />

  <Card>
    <div class="flex items-center gap-3">
      <img src="/furu-logo.png" alt="" class="size-12 rounded-lg" />
      <div>
        <p class="m-0 text-base font-semibold">Furu</p>
        <p class="m-0 text-sm text-surface-700-300">
          {version ? `Version ${version}` : "Version unavailable"}
        </p>
      </div>
    </div>
    <p class="m-0 mt-3 text-sm text-surface-700-300">
      Furu is experimental and unfinished. Firmware features depend on the watch and the
      profile you selected; a control appearing here does not mean your firmware supports it.
    </p>
  </Card>

  <Card title="Links">
    <div class="grid gap-1">
      {#each links as link (link.href)}
        <button
          class="flex w-full items-center justify-between gap-3 rounded-lg border border-surface-200-800 px-3 py-2 text-left text-sm hover:bg-surface-100-900"
          type="button"
          onclick={() => void open(link.href)}
        >
          <span class="truncate">{link.label}</span>
          <span class="shrink-0 font-mono text-xs text-surface-700-300">↗</span>
        </button>
      {/each}
    </div>
  </Card>

  <Card title="Credits">
    <p class="m-0 text-sm text-surface-700-300">
      Themes use the Catppuccin palette (MIT, © 2021 Catppuccin). Furu itself is MIT
      licensed.
    </p>
  </Card>
</div>
