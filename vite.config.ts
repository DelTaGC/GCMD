/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import process from "node:process";
import { fileURLToPath } from "node:url";

const rawHost = process.env["TAURI_DEV_HOST"];
const host = rawHost !== undefined && rawHost.length > 0 ? rawHost : undefined;

// https://vite.dev/config/
export default defineConfig(() => ({
  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host ?? false,
    ...(host ? { hmr: { protocol: "ws", host, port: 1421 } } : {}),
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
  resolve: {
    alias: [
      // elkjs (EPL-2.0) is not GPL-compatible and is left out (ADR 0011);
      // mermaid's optional ELK layouts get a stub that reports an error.
      {
        find: /^elkjs\/lib\/elk\.bundled\.js$/,
        replacement: fileURLToPath(
          new URL("./src/editor/mermaid/elkUnavailable.ts", import.meta.url),
        ),
      },
    ],
  },
  build: {
    // Modern webviews only (WebView2, WKWebView, WebKitGTK); no legacy transforms.
    target: ["es2022", "chrome105", "safari16"],
    // Keep an eye on the startup bundle; heavy libraries must be dynamic imports.
    chunkSizeWarningLimit: 600,
    sourcemap: false,
  },
  test: {
    include: ["src/**/*.test.ts", "tests/**/*.test.ts", "tools/**/*.test.mjs"],
    environment: "node",
  },
}));
