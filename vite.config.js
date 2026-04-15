import { defineConfig, loadEnv } from "vite";
import tailwindcss from "@tailwindcss/vite";
import { sveltekit } from "@sveltejs/kit/vite";

// https://vite.dev/config/
export default defineConfig(async ({ mode }) => {
  const env = loadEnv(mode, ".", "");
  const remoteHost = env.TAURI_DEV_HOST || "";
  const bindHost = remoteHost ? "0.0.0.0" : false;

  return {
    plugins: [tailwindcss(), sveltekit()],

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
