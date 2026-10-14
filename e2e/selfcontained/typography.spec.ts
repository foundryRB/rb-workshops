import { expect } from "@playwright/test";
import { intent } from "@psa-department-of-engineering/playwright-intent";
import { createSession } from "./helpers";

/** INT-WORKSHOPS-027: the identity's sans face is self-hosted and the mono role uses its system stack. */
intent("INT-WORKSHOPS-027", "The Vodafone face is loaded from beside the app and each type role uses the approved identity", async ({ page, request }) => {
  const session = await createSession(request);
  const fontRequests: string[] = [];
  page.on("request", (r) => {
    if (r.resourceType() === "font") fontRequests.push(r.url());
  });
  await page.goto(`/sessions/${session.id}/revisions`);
  await expect(page.locator("h1")).toContainText("Delivery Kickoff");
  await page.evaluate(() => document.fonts.ready);

  const applied = await page.evaluate(() => {
    const family = (el: Element | null) => (el ? getComputedStyle(el).fontFamily : "");
    const loaded = Array.from(document.fonts).filter((f) => f.status === "loaded").map((f) => f.family.replace(/"/g, ""));
    return {
      title: family(document.querySelector("h1")),
      titleWeight: getComputedStyle(document.querySelector("h1")!).fontWeight,
      body: family(document.body),
      mono: family(document.querySelector("td.font-mono")),
      loaded: Array.from(new Set(loaded)),
      display: document.fonts.check('700 16px "Vodafone"'),
      text: document.fonts.check('400 16px "Vodafone"'),
    };
  });
  expect(applied.title).toMatch(/Vodafone/);
  expect(applied.titleWeight).toBe("700");
  expect(applied.body).toMatch(/Vodafone/);
  expect(applied.mono).toMatch(/Cascadia Code.*Consolas.*monospace/);
  expect(applied.display && applied.text).toBe(true);
  expect(applied.loaded).toContain("Vodafone");
  const origin = new URL(page.url()).origin;
  expect(fontRequests.length).toBeGreaterThan(0);
  for (const url of fontRequests) expect(url.startsWith(`${origin}/fonts/`)).toBe(true);
});
