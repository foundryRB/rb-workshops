import { defineConfig, devices } from "@playwright/test";

/**
 * The deployed suite: against the live install, from the in-cluster smoke Job
 * (ADR-008). SMOKE_TARGET is the app's public origin; the realm-local test
 * user's credential is read by the runner inside the cluster and never leaves
 * it. No webServer: the target is the deployment itself.
 */
export default defineConfig({
  testDir: "./deployed",
  timeout: 90_000,
  fullyParallel: false,
  retries: 2,
  workers: 1,
  reporter: [["list"], ["json", { outputFile: "results/deployed.json" }]],
  use: {
    baseURL: process.env.SMOKE_TARGET || "https://rb-workshops.rb-foundry.com",
    trace: "off",
    screenshot: "off",
    video: "off",
    viewport: { width: 1440, height: 900 },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
