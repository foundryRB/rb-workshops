import { expect, test } from "@playwright/test";
import { intent } from "@psa-department-of-engineering/playwright-intent";
import { stage, stageFrame , rendererAvailable, RENDERER_SKIP } from "./helpers";

/** INT-WORKSHOPS-005: every REF-Workshop section 8 capability is reachable through the engine's own doors. */
intent("INT-WORKSHOPS-005", "producing a runnable workshop needs no standalone scaffolding step", async ({ page, request }) => {
  test.skip(!(await rendererAvailable(request)), RENDERER_SKIP);
  // Store and version a session, author it: the UI.
  await page.goto("/");
  await page.getByTestId("new-session").click();
  await expect(page).toHaveURL(/\/sessions\//);
  const id = page.url().split("/sessions/")[1];
  await page.getByTestId("meta-title").fill("Managed path");
  await page.getByTestId("save-revision").click();
  await expect(page.getByTestId("revision-status")).toHaveText(/rev 2, saved/);

  // Serve the dataset: the API door.
  const served = await request.get(`/api/sessions/${id}/revisions/2`);
  expect(served.ok()).toBeTruthy();
  expect((await served.json()).dataset.meta.title).toBe("Managed path");

  // Run both projections: the console.
  await page.getByTestId("rehearse").click();
  await expect(page).toHaveURL(/\/runs\/r_/);
  await stageFrame(page);
  await expect(stage(page).locator(".cover h1")).toContainText("Managed path");
  await page.getByTestId("reveal-script").click();
  await expect(page.getByTestId("script-view")).toBeVisible();

  // Land a capture and export the standalone artifact: the close and the download.
  page.once("dialog", (d) => d.accept());
  await page.getByTestId("close-run").click();
  await expect(page).toHaveURL(/\/capture$/);
  await expect(page.getByTestId("checksum")).toContainText("Checksum matched a fresh render");
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("download-export").click()]);
  expect(download.suggestedFilename()).toMatch(/\.html$/);
  const [plan] = await Promise.all([page.waitForEvent("download"), page.getByTestId("download-plan").click()]);
  expect(plan.suggestedFilename()).toMatch(/-plan\.json$/);

  // The export is the pinned renderer's document: no scaffolding step produced it.
  const artifact = await request.get(`/api/sessions/${id}/export`);
  expect(artifact.headers()["x-renderer"]).toMatch(/^sha256:[0-9a-f]{64}$/);
  expect(await artifact.text()).toContain('id="session-data"');
});
