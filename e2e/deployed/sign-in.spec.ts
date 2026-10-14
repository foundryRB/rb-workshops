import { expect } from "@playwright/test";
import { intent } from "@psa-department-of-engineering/playwright-intent";

/** INT-WORKSHOPS-024: a realm-local test user signs in through the deployed realm and reaches the shelf. */
intent("INT-WORKSHOPS-024", "a realm-local user signs in through the rb-workshops realm and reaches the shelf", async ({ page, baseURL }) => {
  const user = process.env.SMOKE_USER;
  const password = process.env.SMOKE_PASSWORD;
  expect(user, "SMOKE_USER is set by the smoke runner").toBeTruthy();
  expect(password, "SMOKE_PASSWORD is set by the smoke runner").toBeTruthy();
  await page.goto(`${baseURL}/`);
  await expect(page).toHaveURL(/keycloak.*\/realms\/rb-workshops\//);
  await page.locator("#username").fill(user!);
  await page.locator("#password").fill(password!);
  await page.locator("#kc-login").click();
  await expect(page).toHaveURL(new RegExp(`^${baseURL!.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/`));
  await expect(page.getByRole("navigation", { name: "Destinations" })).toContainText("Shelf");
  await expect(page.getByTestId("new-session")).toBeVisible();
  // The signed-in session reaches the real store behind the proxy: one session created once
  // (the shelf keeps it; a smoke run finds it again) and read back at its revision.
  const sessions = await page.request.get(`${baseURL}/api/sessions`);
  expect(sessions.ok()).toBeTruthy();
  const shelf = (await sessions.json()) as { id: string; title: string; current_revision: number }[];
  const title = "Smoke: the deployed round trip";
  let smoke = shelf.find((s) => s.title === title);
  if (!smoke) {
    const created = await page.request.post(`${baseURL}/api/sessions`, { data: { title }, headers: { "X-Door": "ui" } });
    expect(created.status()).toBe(201);
    smoke = (await created.json()) as typeof smoke;
  }
  const revision = await page.request.get(`${baseURL}/api/sessions/${smoke!.id}/revisions/${smoke!.current_revision}`);
  expect(revision.ok()).toBeTruthy();
  expect((await revision.json()).dataset.meta.title).toBe(title);
});
