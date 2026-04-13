<script lang="ts">
  import type { Snippet } from "svelte";
  import { onMount } from "svelte";
  import { initializeBleSession } from "$lib/stores/bleSession";
  import { hydrateRememberedDevices } from "$lib/stores/devices";
  let { children }: { children: Snippet } = $props();

  onMount(() => {
    void initializeBleSession();
    void hydrateRememberedDevices();
  });
</script>

<div class="app-shell">
  <header class="topbar">
    <h1>Furu Companion</h1>
  </header>

  <main class="content">
    {@render children()}
  </main>

  <nav class="bottom-nav">
    <a href="/home">Home</a>
    <a href="/debug">Debug</a>
  </nav>
</div>

<style>
  .app-shell {
    min-height: 100dvh;
    max-width: 44rem;
    margin: 0 auto;
    background: #f7f7f7;
    color: #111;
    display: flex;
    flex-direction: column;
    font-family: system-ui, sans-serif;
  }

  .topbar {
    position: sticky;
    top: 0;
    z-index: 5;
    background: #ffffff;
    border-bottom: 1px solid #ddd;
    padding: 0.9rem 1rem;
  }

  .topbar h1 {
    margin: 0;
    font-size: 1.05rem;
  }

  .content {
    flex: 1;
    padding: 1rem;
    padding-bottom: 5rem;
  }

  .bottom-nav {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    max-width: 44rem;
    margin: 0 auto;
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 0.5rem;
    background: #ffffff;
    border-top: 1px solid #ddd;
    padding: 0.75rem 1rem calc(0.75rem + env(safe-area-inset-bottom));
  }

  .bottom-nav a {
    text-align: center;
    text-decoration: none;
    color: #0d47a1;
    font-weight: 600;
    padding: 0.4rem 0.2rem;
    border-radius: 0.5rem;
    background: #eef4ff;
  }
</style>
