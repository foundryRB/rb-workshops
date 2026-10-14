import { expect, test } from "@playwright/test";
import { intent } from "@psa-department-of-engineering/playwright-intent";
import { createSession, gotoActivity, stage, stageFrame, startRun , rendererAvailable, RENDERER_SKIP } from "./helpers";

/** INT-WORKSHOPS-012: outcomes recorded on the surface appear inline in the script and survive a refresh. */
intent("INT-WORKSHOPS-012", "a verdict stamped on the surface shows in the script inline and survives a page refresh", async ({ page, request }) => {
  test.skip(!(await rendererAvailable(request)), RENDERER_SKIP);
  const session = await createSession(request);
  const run = await startRun(request, session.id, "session");
  await page.goto(`/runs/${run.id}`);
  await stageFrame(page);
  await page.getByTestId("reveal-script").click();
  await page.locator("[data-activity='A3']").click();
  await expect(page.getByTestId("script-recorded").locator("[data-recorded]")).toHaveCount(0);

  await gotoActivity(page, 3);
  await stage(page).locator(".vbtn", { hasText: "True" }).click();
  // Inline in the facilitator script, as it happens.
  await expect(page.getByTestId("script-recorded").locator("[data-recorded='STORE-001']")).toContainText("True");
  // Landed server-side on the storage event, before any refresh.
  await expect.poll(async () => (await (await request.get(`/api/runs/${run.id}`)).json()).capture?.["STORE-001"]?.mark).toBe("true");

  await page.reload();
  await stageFrame(page);
  await gotoActivity(page, 3);
  await expect(stage(page).locator(".wtrail .wt.ok")).toHaveCount(1);
  await expect(stage(page).locator(".vbtn.on")).toContainText("True");
  await page.getByTestId("reveal-script").click();
  await page.locator("[data-activity='A3']").click();
  await expect(page.getByTestId("script-recorded").locator("[data-recorded='STORE-001']")).toContainText("True");

  // And in the close read-back.
  await gotoActivity(page, 6);
  await expect(stage(page).locator(".rbrow", { hasText: "STORE-001" })).toContainText("True");
});
