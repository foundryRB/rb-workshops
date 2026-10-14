import { defineConfig, devices } from "@playwright/test";

/**
 * The self-contained suite: Playwright against the app's own stack. The
 * backend serves the built document from app/ and the API on one port; the
 * gate is off and the renderer comes from WORKSHOPS_RENDERER_FILE (or the
 * playbook-studio door with a credential). One project, Chromium: the
 * four-browser matrix is the support bar the app is built to, not four CI
 * projects.
 */
const port = Number(process.env.E2E_PORT || 8765);

export default defineConfig({
  testDir: "./selfcontained",
  timeout: 60_000,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    viewport: { width: 1440, height: 900 },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `${process.env.PYTHON || "python"} -m backend.run`,
    cwd: "..",
    url: `http://127.0.0.1:${port}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    env: {
      PORT: String(port),
      WORKSHOPS_AUTH_DISABLED: "true",
      DATABASE_SCHEMA: process.env.DATABASE_SCHEMA || "e2e",
    },
  },
});
