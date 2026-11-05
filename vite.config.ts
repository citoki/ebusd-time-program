import { defineConfig } from "vite";

// `vite build` -> one self-contained ES module for HACS (lit bundled in).
// `vite` (dev) serves dev/index.html with a mocked hass object.
export default defineConfig({
  build: {
    lib: {
      entry: "src/ebusd-time-program-card.ts",
      formats: ["es"],
      fileName: () => "ebusd-time-program-card.js",
    },
    outDir: "dist",
    target: "es2022",
    sourcemap: false,
    minify: true,
  },
  server: { open: false },
});
