import { expect, test } from "@playwright/test";
import { intent } from "@psa-department-of-engineering/playwright-intent";
import { createSession, stage, stageFrame, startRun , rendererAvailable, RENDERER_SKIP } from "./helpers";

/** INT-WORKSHOPS-011: both projections of one revision open, the script reachable only deliberately. */
intent("INT-WORKSHOPS-011", "starting a run opens the room surfaces and the gated facilitator script", async ({ page, request }) => {
  test.skip(!(await rendererAvailable(request)), RENDERER_SKIP);
  const session = await createSession(request);
  await page.goto(`/sessions/${session.id}/runs`);
  await page.getByTestId("start-session").click();
  await expect(page).toHaveURL(/\/runs\/r_/);
  await expect(page.getByText("Session, live")).toBeVisible();

  // The landing view is the room's cover, inside the real artifact.
  const frame = await stageFrame(page);
  const room = stage(page);
  await expect(room.locator(".cover h1")).toContainText("Delivery Kickoff");
  expect(await frame.evaluate(() => document.body.classList.contains("stage"))).toBe(true);
  expect(await frame.evaluate(() => getComputedStyle(document.getElementById("script")!).display)).toBe("none");
  // The facilitator's objective is nowhere on the room surface.
  expect(await frame.evaluate(() => document.getElementById("room")!.textContent)).not.toContain("Every assumption confirmed or owned");

  // The engine's script panel is not on the landing view; it opens only deliberately.
  await expect(page.getByTestId("script-panel")).toHaveCount(0);
  await page.getByTestId("reveal-script").click();
  await expect(page.getByTestId("script-panel")).toBeVisible();
  await expect(page.getByTestId("script-panel")).toContainText("Internal, gated");
  await page.locator("[data-activity='A3']").click();
  await expect(page.getByTestId("script-view")).toContainText("Is it true");
  await expect(page.getByTestId("script-view")).toContainText("No debate.");

  // Both projections are of the same revision.
  await expect(page.getByTestId("run-status")).toContainText(`rev ${session.current_revision}`);
  await expect(room.locator(".cover .cm")).toContainText("6 working blocks");
});
