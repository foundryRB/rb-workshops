import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The built document lands in app/ at the repo root: the path the image serves
// at / and the walking skeleton's claim reads (INT-WORKSHOPS-001).
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "../app",
    emptyOutDir: true,
    sourcemap: false,
  },
  server: {
    port: 5173,
    proxy: { "/api": "http://127.0.0.1:8000", "/mcp": "http://127.0.0.1:8000" },
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    globals: false,
  },
});
