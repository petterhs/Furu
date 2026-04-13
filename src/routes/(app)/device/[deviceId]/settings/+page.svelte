<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { profiles } from "$lib/stores/bleSession";
  import {
    forgetRememberedDevice,
    rememberedDevices,
    updateRememberedDevice,
  } from "$lib/stores/devices";

  const deviceId = $derived(page.params.deviceId);
  const remembered = $derived($rememberedDevices.find((item) => item.id === deviceId));
  const profilePreference = $derived(remembered?.profilePreference ?? "auto");
  const notificationsEnabled = $derived(remembered?.notificationsEnabled ?? true);

  async function onPreferenceChange(value: string): Promise<void> {
    if (!remembered) return;
    await updateRememberedDevice(remembered.id, { profilePreference: value });
  }

  async function onNotificationsChange(event: Event): Promise<void> {
    if (!remembered) return;
    const target = event.currentTarget as HTMLInputElement;
    await updateRememberedDevice(remembered.id, { notificationsEnabled: target.checked });
  }

  async function onForget(): Promise<void> {
    if (!remembered) return;
    await forgetRememberedDevice(remembered.id);
    await goto("/home");
  }
</script>

<section class="stack">
  <article class="card">
    <h2>Device Settings</h2>
    {#if remembered}
      <p><strong>{remembered.name}</strong></p>
      <p class="mono">{remembered.address}</p>

      <label>
        Profile preference
        <select value={profilePreference} onchange={(e) => onPreferenceChange((e.currentTarget as HTMLSelectElement).value)}>
          <option value="auto">auto</option>
          {#each $profiles as profile (profile.id)}
            <option value={profile.id}>{profile.id}</option>
          {/each}
        </select>
      </label>

      <label class="row">
        <input
          type="checkbox"
          checked={notificationsEnabled}
          onchange={onNotificationsChange}
        />
        Notifications enabled
      </label>
    {:else}
      <p>Device not found.</p>
    {/if}
  </article>

  <button type="button" class="danger" onclick={onForget} disabled={!remembered}>Forget / Unbind Device</button>
  <a class="button" href="/home">Back to Home</a>
</section>

<style>
  .stack {
    display: grid;
    gap: 0.9rem;
  }
  .card {
    background: #fff;
    border: 1px solid #ddd;
    border-radius: 0.75rem;
    padding: 0.9rem;
  }
  h2 {
    margin: 0 0 0.6rem;
    font-size: 1rem;
  }
  label {
    display: grid;
    gap: 0.35rem;
    margin-top: 0.65rem;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 0.55rem;
  }
  .mono {
    font-family: ui-monospace, monospace;
    font-size: 0.82rem;
  }
  select,
  button,
  .button {
    border: 1px solid #c7c7c7;
    border-radius: 0.5rem;
    padding: 0.5rem 0.7rem;
    background: #f9f9f9;
    text-decoration: none;
    color: inherit;
  }
  .danger {
    background: #8b1e1e;
    border-color: #8b1e1e;
    color: #fff;
  }
</style>
