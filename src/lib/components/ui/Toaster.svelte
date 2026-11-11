<script lang="ts">
  import { Toast } from "@skeletonlabs/skeleton-svelte";
  import { toaster } from "#lib/stores/toast";
</script>

<!--
  Single mount point for app-wide toasts. Positioned above the bottom navigation
  and inset for the safe area so it never collides with the tab bar.
-->
<Toast.Group {toaster}>
  {#snippet children(toast)}
    <Toast {toast}>
      <Toast.Message>
        <Toast.Title />
        <Toast.Description />
      </Toast.Message>
      <Toast.CloseTrigger aria-label="Dismiss notification" />
    </Toast>
  {/snippet}
</Toast.Group>
