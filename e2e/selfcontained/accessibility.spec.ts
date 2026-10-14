import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { intent } from "@psa-department-of-engineering/playwright-intent";
import { createSession, rendererAvailable, RENDERER_SKIP, startRun } from "./helpers";

/** INT-WORKSHOPS-026: every engine surface meets the locked bar - keyboard reachable with a visible ring, no serious or critical axe violation. Two halves: the chrome screens on every runner, the run screens where the engine can render. */

async function scanClean(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
  const results = await new AxeBuilder({ page }).exclude('[data-testid="stage"]').analyze();
  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious.map((v) => `${path}: ${v.id} ${v.nodes.map((n) => n.target.join(" ")).join("; ")}`)).toEqual([]);
}

intent("INT-WORKSHOPS-026", "the shelf, author, ledgers and doors scan clean and every control takes the focus ring", async ({ page, request }) => {
  const session = await createSession(request);
  for (const appearance of ["light", "dark"]) {
    await page.goto("/");
    await page.getByRole("combobox", { name: "Appearance" }).selectOption(appearance);
    await expect(page.locator("html")).toHaveAttribute("data-theme", appearance);
    for (const path of ["/", `/sessions/${session.id}`, `/sessions/${session.id}/revisions`, "/runs", "/exports", "/doors"]) await scanClean(page, path);
  }

  // Keyboard: the rail, the tabs and the actions are ordinary tab stops with a visible ring.
  await page.goto(`/sessions/${session.id}`);
  await page.waitForLoadState("networkidle");
  const visited: string[] = [];
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press("Tab");
    const info = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      const style = getComputedStyle(el);
      return { tag: el.tagName, text: (el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 30), outline: style.outlineStyle, width: style.outlineWidth };
    });
    if (info) {
      expect(info.outline, `${info.tag} ${info.text} shows no focus ring`).not.toBe("none");
      expect(parseFloat(info.width)).toBeGreaterThan(0);
      visited.push(`${info.tag}:${info.text}`);
      if (info.text.includes("Save revision")) break;
    }
  }
  expect(visited.some((v) => v.startsWith("A:Shelf"))).toBe(true);
  expect(visited.some((v) => v.includes("Save revision") || v.includes("Rehearse"))).toBe(true);
});

intent("INT-WORKSHOPS-026", "the run console and the capture screen scan clean and their controls take the focus ring", async ({ page, request }) => {
  test.skip(!(await rendererAvailable(request)), RENDERER_SKIP);
  const session = await createSession(request);
  const closed = await startRun(request, session.id, "session");
  await request.post(`/api/runs/${closed.id}/capture`, { data: { capture: { "STORE-001": { mark: "true" } }, close: true } });
  const live = await startRun(request, session.id, "rehearsal");
  for (const path of [`/runs/${closed.id}/capture`, `/runs/${live.id}`]) await scanClean(page, path);

  await page.goto(`/runs/${live.id}`);
  await page.waitForLoadState("networkidle");
  const visited: string[] = [];
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press("Tab");
    const info = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      const style = getComputedStyle(el);
      return { tag: el.tagName, text: (el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 30), outline: style.outlineStyle, width: style.outlineWidth };
    });
    if (info) {
      if (info.tag !== "IFRAME") {
        expect(info.outline, `${info.tag} ${info.text} shows no focus ring`).not.toBe("none");
        expect(parseFloat(info.width)).toBeGreaterThan(0);
      }
      visited.push(`${info.tag}:${info.text}`);
      if (info.text.includes("Close the run")) break;
    }
  }
  expect(visited.some((v) => v.includes("Close the run"))).toBe(true);
});
