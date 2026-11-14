import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Production is served from vincentschall.com/quantumrisk/ (GitHub Pages).
export default defineConfig(({ command }) => ({
  root: __dirname,
  base: command === "build" ? "/quantumrisk/" : "/",
  plugins: [react()],
  build: { outDir: "../dist/web", emptyOutDir: true },
  server: { port: 5173 },
}));
