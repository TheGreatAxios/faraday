import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: { port: 5273 },
  // The webmcp packages are file: links to a sibling checkout during the
  // hackathon; Vite needs them pre-bundled like any other dependency.
  optimizeDeps: {
    include: ["@thegreataxios/webmcp-core", "@thegreataxios/webmcp-react"],
  },
});
