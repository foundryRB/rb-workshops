import { expect, test } from "@playwright/test";
import { intent } from "@psa-department-of-engineering/playwright-intent";
import { createSession, stageFrame, startRun, rendererAvailable, RENDERER_SKIP } from "./helpers";

/** INT-WORKSHOPS-028: the room and script own fixed projections across engine and OS themes. */
intent("INT-WORKSHOPS-028", "the embedded room stays Dark and its script stays Light across appearances", async ({ page, request }) => {
  test.skip(!(await rendererAvailable(request)), RENDERER_SKIP);
  const session = await createSession(request);
  const run = await startRun(request, session.id, "session");
  let fixed: { room: string; paper: string } | undefined;
  for (const appearance of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: appearance });
    await page.goto(`/runs/${run.id}`);
    await page.getByRole("combobox", { name: "Appearance" }).selectOption(appearance);
    await expect(page.locator("html")).toHaveAttribute("data-theme", appearance);
    const frame = await stageFrame(page);
    const artifact = await frame.evaluate(() => {
      const room = getComputedStyle(document.querySelector(".room")!);
      const script = getComputedStyle(document.querySelector(".script")!);
      const resolve = (token: string) => {
        const el = document.createElement("div");
        el.style.background = token;
        document.body.appendChild(el);
        const value = getComputedStyle(el).backgroundColor;
        el.remove();
        return value;
      };
      return {
        room: room.backgroundColor, paper: script.backgroundColor,
        roomToken: resolve(room.getPropertyValue("--bg").trim()),
        paperToken: resolve(script.getPropertyValue("--paper").trim()),
        roomScheme: room.colorScheme, paperScheme: script.colorScheme,
      };
    });
    expect(artifact.roomScheme).toBe("dark");
    expect(artifact.paperScheme).toBe("light");
    expect(artifact.room).toBe(artifact.roomToken);
    expect(artifact.paper).toBe(artifact.paperToken);
    expect(artifact.room).not.toBe(artifact.paper);
    if (fixed) expect({ room: artifact.room, paper: artifact.paper }).toEqual(fixed);
    else fixed = { room: artifact.room, paper: artifact.paper };
  }
});
