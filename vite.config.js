// Tauri doesn't have a Node.js server to do proper SSR, so the app uses
// adapter-static with a fallback to index.html (SPA mode).
// See: https://svelte.dev/docs/kit/single-page-apps
// See: https://v2.tauri.app/start/frontend/sveltekit/ for more info
import adapter from "@sveltejs/adapter-static";
import { sveltekit } from "@sveltejs/kit/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(async ({ mode }) => {
  const env = loadEnv(mode, ".", "");
  const remoteHost = env.TAURI_DEV_HOST || "";
  const bindHost = remoteHost ? "0.0.0.0" : false;

  return {
    plugins: [
      tailwindcss(),
      sveltekit({
        adapter: adapter({ fallback: "index.html" }),
        // SvelteKit 3 reads its configuration here rather than svelte.config.js.
        compilerOptions: {
          runes: true,
        },
      }),
    ],

    // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
    //
    // 1. prevent Vite from obscuring rust errors
    clearScreen: false,
    // 2. tauri expects a fixed port, fail if that port is not available
    server: {
      port: 1420,
      strictPort: true,
      host: bindHost,
      hmr: remoteHost
        ? {
            protocol: "ws",
            host: remoteHost,
            port: 1421,
          }
        : undefined,
      watch: {
        ignored: [
          "**/src-tauri/**",
          "**/.devenv/**",
          "**/.direnv/**",
          "**/.android/**",
        ],
      },
    },
  };
});
