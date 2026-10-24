import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";
import { fileURLToPath } from "node:url";

const content = fileURLToPath(new URL("../content", import.meta.url));

// `--mode single` builds one self-contained HTML file (demo/offline use).
export default defineConfig(({ mode }) => ({
  base: "./",
  plugins: [react(), ...(mode === "single" ? [viteSingleFile()] : [])],
  resolve: { alias: { "@content": content } },
  server: {
    fs: { allow: [".."] },
    proxy: { "/api": "http://127.0.0.1:8000" },
  },
  build: {
    outDir: mode === "single" ? "dist-single" : "dist",
    assetsInlineLimit: mode === "single" ? 100_000_000 : 4096,
  },
}));
