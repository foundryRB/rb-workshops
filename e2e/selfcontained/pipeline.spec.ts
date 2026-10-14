import { expect, test } from "@playwright/test";
import { intent } from "@psa-department-of-engineering/playwright-intent";
import { createSession, gotoActivity, stage, stageFrame, startRun , rendererAvailable, RENDERER_SKIP } from "./helpers";

/** INT-WORKSHOPS-004: all six kinds run end to end, each rendering its own surface and recording its own shape. */
intent("INT-WORKSHOPS-004", "a six-kind session runs end to end and every kind appears in the close read-back", async ({ page, request }) => {
  test.skip(!(await rendererAvailable(request)), RENDERER_SKIP);
  const session = await createSession(request);
  const run = await startRun(request, session.id, "session");
  await page.goto(`/runs/${run.id}`);
  await stageFrame(page);
  const room = stage(page);

  // frame: panels, no capture shape
  await gotoActivity(page, 1);
  await expect(room.locator(".spectrum .spec")).toHaveCount(2);
  await expect(page.locator("[data-activity='A1']")).toContainText("no capture");

  // collect: the spec sheet, typed into live
  await gotoActivity(page, 2);
  await expect(room.locator(".sheet")).toBeVisible();
  await room.locator(".slot input").nth(0).fill("R. Pires");
  await room.locator(".slot input").nth(0).press("Enter");
  await expect(page.locator("[data-activity='A2']")).toContainText("1 of 2 slots");

  // walk: one statement at a time, verdict buttons, a trail of stamps
  await gotoActivity(page, 3);
  await expect(room.locator(".wstmt")).toContainText("Every revision is retrievable");
  await room.locator(".vbtn", { hasText: "True" }).click();
  await expect(room.locator(".wtrail .wt.ok")).toHaveCount(1);
  await expect(page.locator("[data-activity='A3']")).toContainText("1 of 3 verdicts");
  await room.locator(".stepbtn", { hasText: "→" }).click();
  await room.locator(".vbtn", { hasText: "Not yet" }).click();
  await room.locator(".vfields input").nth(0).fill("pin the renderer");
  await room.locator(".vfields input").nth(0).press("Enter");
  await expect(page.locator("[data-activity='A3']")).toContainText("2 of 3 verdicts");

  // sort: a queue, the current item, buckets that items land in
  await gotoActivity(page, 4);
  await expect(room.locator(".queue .qrow")).toHaveCount(2);
  await room.locator(".bucket", { hasText: "This phase" }).click();
  await expect(room.locator(".bucket.hit")).toHaveCount(1);
  await expect(page.locator("[data-activity='A4']")).toContainText("1 of 2 landed");

  // assign: the roster, a typed name against an editable row
  await gotoActivity(page, 5);
  await expect(room.locator(".roster .grow")).toHaveCount(2);
  await room.locator(".grow input").fill("A. Ferreira");
  await room.locator(".grow input").press("Enter");
  await expect(page.locator("[data-activity='A5']")).toContainText("1 of 1 named");

  // close: the read-back generated from the recorded state
  await gotoActivity(page, 6);
  await expect(room.locator(".readback .rbgroup")).toHaveCount(4);
  await expect(room.locator(".rbrow", { hasText: "STORE-001" })).toContainText("True");
  await expect(room.locator(".rbrow", { hasText: "R1" })).toContainText("named");
  await expect(room.locator(".rbrow.openrow")).toHaveCount(3);

  // The engine's own read-back after the close carries the same recorded state.
  page.once("dialog", (d) => d.accept());
  await page.getByTestId("close-run").click();
  await expect(page).toHaveURL(/\/capture$/);
  const readback = page.getByTestId("readback");
  await expect(readback.locator("[data-readback='STORE-001']")).toContainText("True");
  await expect(readback.locator("[data-readback='EXP-002']")).toContainText("Not yet");
  await expect(readback.locator("[data-readback='PLAN-001']")).toContainText("This phase");
  await expect(readback.locator("[data-readback='R1']")).toContainText("A. Ferreira");
  await expect(readback.locator("[data-readback='ENG-001']").first()).toContainText("R. Pires");
});
