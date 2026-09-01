import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  // GitHub Pages serves this repo at /faraday/
  base: process.env.FARADAY_BASE ?? "/faraday/",
  plugins: [react()],
  server: { port: 5273 },
  optimizeDeps: {
    include: ["@thegreataxios/webmcp-core", "@thegreataxios/webmcp-react"],
  },
});
