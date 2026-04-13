<script lang="ts">
  import { goto } from "$app/navigation";
  import { onMount } from "svelte";

  onMount(() => {
    void goto("/home", { replaceState: true });
  });
</script>

<p>Redirecting to home...</p>
