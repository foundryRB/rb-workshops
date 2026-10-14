import { expect, test } from "@playwright/test";
import { intent } from "@psa-department-of-engineering/playwright-intent";
import { createSession, gotoActivity, stage, stageFrame, startRun , rendererAvailable, RENDERER_SKIP } from "./helpers";

/** INT-WORKSHOPS-031: no run's capture reaches another run of the same revision, in either order of arrival. */
intent("INT-WORKSHOPS-031", "a rehearsal's outcomes never reach the session that follows it, and a second live mount is refused", async ({ page, request, context }) => {
  test.skip(!(await rendererAvailable(request)), RENDERER_SKIP);
  const session = await createSession(request);

  // The rehearsal records an outcome and is left.
  const rehearsal = await startRun(request, session.id, "rehearsal");
  await page.goto(`/runs/${rehearsal.id}`);
  await stageFrame(page);
  await gotoActivity(page, 3);
  await stage(page).locator(".vbtn", { hasText: "We do not know" }).click();
  await expect.poll(async () => (await (await request.get(`/api/runs/${rehearsal.id}`)).json()).capture?.["STORE-001"]?.mark).toBe("unknown");
  await page.goto("/runs");

  // The session run over the same revision starts from its own, empty record.
  const live = await startRun(request, session.id, "session");
  await page.goto(`/runs/${live.id}`);
  const frame = await stageFrame(page);
  const seeded = await frame.evaluate(() => localStorage.getItem("ws-" + JSON.parse(document.getElementById("session-data")!.textContent!).meta.id + "-v1"));
  expect(JSON.parse(seeded || "{}")).toEqual({});
  await gotoActivity(page, 3);
  await expect(stage(page).locator(".vbtn.on")).toHaveCount(0);
  await expect(stage(page).locator(".wtrail .wt.hot")).toHaveCount(0);
  await stage(page).locator(".vbtn", { hasText: "True" }).click();
  await expect.poll(async () => (await (await request.get(`/api/runs/${live.id}`)).json()).capture?.["STORE-001"]?.mark).toBe("true");
  expect((await (await request.get(`/api/runs/${rehearsal.id}`)).json()).capture["STORE-001"].mark).toBe("unknown");

  // A second live mount of the same revision, in a second tab of the same browser, is refused.
  const second = await context.newPage();
  const other = await startRun(request, session.id, "rehearsal");
  await second.goto(`/runs/${other.id}`);
  await expect(second.getByRole("alert").filter({ hasText: "already open in another tab" })).toBeVisible();
  await expect(second.getByTestId("stage")).toHaveCount(0);
  // The first mount's slot is intact.
  await expect(stage(page).locator(".vbtn.on")).toContainText("True");
  await second.close();
});
