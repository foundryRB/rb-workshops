import { expect } from "@playwright/test";
import { intent } from "@psa-department-of-engineering/playwright-intent";

/** INT-WORKSHOPS-010: a person authors entirely in the UI, and the schema panel re-evaluates on each change. */
intent("INT-WORKSHOPS-010", "a person creates, edits and saves a session in the UI while the schema panel re-evaluates", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("new-session").click();
  await expect(page).toHaveURL(/\/sessions\/s_[0-9a-f]+$/);
  await expect(page.getByTestId("revision-status")).toHaveText(/rev 1, saved/);

  // Every schema row holds on the starter, before anything is touched.
  const rows = page.getByTestId("schema-rows");
  await expect(rows.locator("[data-ok='false']")).toHaveCount(0);

  // Editing the session title writes the draft.
  await page.getByTestId("meta-title").fill("Delivery Kickoff, authored by hand");
  await expect(page.getByTestId("revision-status")).toHaveText(/unsaved/);

  // Breaking the timeboxes is visible while it is being made, before any save.
  await page.getByTestId("meta-duration").fill("99");
  await expect(rows.locator("[data-row='timeboxes'][data-ok='false']")).toHaveCount(1);
  await expect(page.getByTestId("schema-errors")).toContainText("Timeboxes");
  await page.getByTestId("meta-duration").fill("15");
  await expect(rows.locator("[data-row='timeboxes'][data-ok='true']")).toHaveCount(1);

  // Edit an activity: the rail switches, the form writes to it.
  await page.getByRole("button", { name: /frame\s+The frame/ }).click();
  await page.getByTestId("activity-name").fill("Where we stand");
  await page.getByTestId("activity-mins").fill("7");
  await expect(rows.locator("[data-row='timeboxes'][data-ok='false']")).toHaveCount(1);
  await page.getByTestId("activity-mins").fill("5");
  await expect(rows.locator("[data-row='timeboxes'][data-ok='true']")).toHaveCount(1);

  await page.getByTestId("change-note").fill("titled and renamed the frame");
  await page.getByTestId("save-revision").click();
  await expect(page.getByTestId("revision-status")).toHaveText(/rev 2, saved/);

  await page.getByRole("tab", { name: "Revisions" }).click();
  const revisions = page.getByTestId("revisions").locator("tr");
  await expect(revisions).toHaveCount(2);
  await expect(revisions.first()).toContainText("titled and renamed the frame");
  await expect(revisions.first().locator("td").nth(3)).toHaveText("ui");
});
