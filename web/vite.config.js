import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

function precacheAppShell() {
  return {
    name: "precache-app-shell",
    apply: "build",
    async writeBundle() {
      const dist = path.resolve("dist");
      const assetsDir = path.join(dist, "assets");
      const assetNames = await readdir(assetsDir);
      const assets = [...assetNames.map((name) => `/assets/${name}`), "/pdf.worker.min.mjs"];
      // PDF.js can need these files on pages that have never been viewed.
      for (const directory of ["cmaps", "standard_fonts", "wasm", "image_decoders"]) {
        const names = await readdir(path.join(dist, directory)).catch((error) => {
          if (error.code === "ENOENT") return [];
          throw error;
        });
        assets.push(...names.map((name) => `/${directory}/${name}`));
      }
      if (assetNames.length === 0) throw new Error("No built app assets found for offline cache");

      // Changing the cache name only after the new shell is built keeps the old
      // shell available if a service worker update cannot finish installing.
      const hash = createHash("sha256");
      for (const file of [
        "index.html", "manifest.json", "logo.svg", "logo.png",
        "logo-192.png", "logo-512.png", ...assets.map((name) => name.slice(1)),
      ]) {
        hash.update(await readFile(path.join(dist, file)));
      }
      const buildId = hash.digest("hex").slice(0, 12);
      const swPath = path.join(dist, "sw.js");
      const source = await readFile(swPath, "utf8");
      if (!source.includes("/*__PRECACHE_ASSETS__*/ []") || !source.includes("__BUILD_ID__")) {
        throw new Error("Service worker precache markers are missing");
      }
      await writeFile(swPath, source
        .replace("/*__PRECACHE_ASSETS__*/ []", JSON.stringify(assets))
        .replace("__BUILD_ID__", buildId));
    },
  };
}

export default defineConfig({
  plugins: [react(), precacheAppShell()],
  server: {
    host: "0.0.0.0",
    proxy: {
      "/api": {
        target: process.env.VITE_API_URL || "http://localhost:8080",
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: undefined,
      },
    },
  },
  // Copy service worker to dist
  publicDir: 'public',
});
