import { expect } from "@playwright/test";
import { intent } from "@psa-department-of-engineering/playwright-intent";
import { createSession } from "./helpers";

/** INT-WORKSHOPS-027: the identity's system sans stack and system mono stack, with no font from another host. */
intent("INT-WORKSHOPS-027", "Each type role uses the approved identity's system stacks and no font comes from another host", async ({ page, request }) => {
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
    };
  });
  expect(applied.title).toMatch(/-apple-system.*Segoe UI.*sans-serif/);
  expect(applied.titleWeight).toBe("700");
  expect(applied.body).toMatch(/-apple-system.*Segoe UI.*sans-serif/);
  expect(applied.mono).toMatch(/Cascadia Code.*Consolas.*monospace/);
  const origin = new URL(page.url()).origin;
  for (const url of fontRequests) expect(url.startsWith(`${origin}/fonts/`)).toBe(true);
});
