<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { Switch } from "@skeletonlabs/skeleton-svelte";
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

  async function onForget(): Promise<void> {
    if (!remembered) return;
    await forgetRememberedDevice(remembered.id);
    await goto("/home");
  }
</script>

<section class="grid gap-4">
  <article class="card border border-[color:var(--color-surface-200-800)] p-4 preset-tonal-surface">
    <h2 class="m-0 mb-3 text-base font-semibold">Device Settings</h2>
    {#if remembered}
      <p class="m-0"><strong>{remembered.name}</strong></p>
      <p class="m-0 mt-2 font-mono text-sm">{remembered.address}</p>

      <label class="label mt-4">
        <span class="label-text">Profile preference</span>
        <select
          class="select"
          value={profilePreference}
          onchange={(e) => onPreferenceChange((e.currentTarget as HTMLSelectElement).value)}
        >
          <option value="auto">auto</option>
          {#each $profiles as profile (profile.id)}
            <option value={profile.id}>{profile.id}</option>
          {/each}
        </select>
      </label>

      <Switch
        class="mt-4 flex w-full items-center justify-between gap-4"
        checked={notificationsEnabled}
        disabled={!remembered}
        onCheckedChange={({ checked }) => {
          if (!remembered) return;
          void updateRememberedDevice(remembered.id, { notificationsEnabled: checked });
        }}
      >
        <Switch.Label class="text-sm">Notifications enabled</Switch.Label>
        <Switch.Control class="preset-filled-primary-500">
          <Switch.Thumb />
        </Switch.Control>
      </Switch>
    {:else}
      <p class="m-0 text-sm text-[color:var(--color-surface-700-300)]">Device not found.</p>
    {/if}
  </article>

  <div class="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
    <button class="btn btn-sm preset-filled-error-500" type="button" onclick={onForget} disabled={!remembered}>
      Forget / Unbind Device
    </button>
    <a class="btn btn-sm preset-tonal-surface no-underline sm:ml-auto" href="/home">Back to Home</a>
  </div>
</section>
