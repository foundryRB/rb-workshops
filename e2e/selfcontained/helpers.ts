import type { APIRequestContext, Frame, Page } from "@playwright/test";

/** A session carrying all six kinds, honest timeboxes, plan-shaped ids: the same shape the backend suites use. */
export function sixKindDataset(id = "kickoff", version = "v1") {
  return {
    meta: {
      id,
      title: "Delivery Kickoff",
      eyebrow: "SOFTWARE ENGINEERING",
      session: "Session 1",
      date: "2026-09-30",
      duration: 60,
      version,
      classification: "Internal",
      question: "What do we have to be right about before we build",
      objective: "Every assumption confirmed or owned.",
    },
    activities: [
      { id: "A1", kind: "frame", name: "Where we are", mins: 5, question: "Context first.", script: { goal: "Orient.", run: ["Point."], say: ["Here we are."], watch: "Move on." },
        panels: [{ name: "Now", phase: "active", line: "One line.", done: "nods" }, { name: "Later", phase: "background", line: "Context.", done: "not now", dim: true }] },
      { id: "A2", kind: "collect", name: "The engine", mins: 10, question: "Pin the facts.", script: { goal: "Facts.", run: ["Fill."], say: ["Three facts."], watch: "Scope." },
        item: { id: "ENG-001", badge: "decided", title: "The engine", known: "It exists." }, slots: [{ k: "owner", label: "Owner", hint: "a person" }, { k: "date", label: "First date", hint: "when" }] },
      { id: "A3", kind: "walk", name: "Is it true", mins: 15, question: "Does each hold?", prompt: "Does this hold?", script: { goal: "Stamp.", run: ["Read."], say: ["True or not."], watch: "No debate." },
        verdicts: [{ k: "true", label: "True", tone: "ok" }, { k: "notyet", label: "Not yet", tone: "mid", fields: [{ k: "action", ph: "what" }, { k: "who", ph: "who" }] }, { k: "unknown", label: "We do not know", tone: "hot" }],
        items: [{ id: "STORE-001", stmt: "Every revision is retrievable", detail: "Append only." }, { id: "EXP-002", stmt: "Never forked the renderer", detail: "Pinned." }, { id: "DOOR-003", stmt: "No door-only capability", detail: "Parity." }] },
      { id: "A4", kind: "sort", name: "Where it goes", mins: 15, question: "Each in a bucket.", script: { goal: "Land.", run: ["Walk the queue."], say: ["A name on each."], watch: "None merely dated." },
        buckets: [{ k: "now", label: "This phase", tone: "ok", fields: [{ k: "who", ph: "who" }] }, { k: "next", label: "Next phase", tone: "mid" }, { k: "drop", label: "Drop", tone: "hot" }],
        items: [{ id: "PLAN-001", name: "Plan export", ask: "Ship it?", owner: "R. Pires", when: "asked for 2026-09-18" }, { id: "ARCH-002", name: "Docs onboarded", ask: "This phase?", owner: "A. Ferreira", when: "asked for 2026-09-25" }] },
      { id: "A5", kind: "assign", name: "Who carries it", mins: 5, question: "Names against seats.", script: { goal: "Names.", run: ["Type each."], say: ["Each row is a person."], watch: "Authority." },
        rows: [{ id: "R1", name: "The first seat", evidence: "Signs.", editable: true, ph: "name" }, { id: "R2", name: "A fixed seat", evidence: "Held.", who: "held" }] },
      { id: "A6", kind: "close", name: "Read back", mins: 10, question: "Everything recorded.", script: { goal: "Replay.", run: ["Read."], say: ["This is what we decided."], watch: "Protect." } },
    ],
  };
}

export async function createSession(request: APIRequestContext, title = "Delivery Kickoff", dataset = sixKindDataset(`kickoff-${Date.now().toString(36)}`)) {
  const response = await request.post("/api/sessions", { data: { title, dataset }, headers: { "X-Door": "ui" } });
  if (!response.ok()) throw new Error(`create failed: ${response.status()} ${await response.text()}`);
  return (await response.json()) as { id: string; current_revision: number };
}

export async function startRun(request: APIRequestContext, sessionId: string, kind: "rehearsal" | "session") {
  const response = await request.post(`/api/sessions/${sessionId}/runs`, { data: { kind } });
  return (await response.json()) as { id: string };
}

/** The room's working surface inside the console's Stage. */
export function stage(page: Page) {
  return page.frameLocator('[data-testid="stage"]');
}

export async function stageFrame(page: Page): Promise<Frame> {
  const handle = await page.waitForSelector('[data-testid="stage"]');
  const frame = await handle.contentFrame();
  if (!frame) throw new Error("the stage iframe has no frame");
  await frame.waitForSelector(".cover, .shead", { timeout: 15_000 });
  return frame;
}

/** Step the room to activity n (1-based) through the renderer's own strip. */
export async function gotoActivity(page: Page, n: number) {
  await stage(page).locator("#scenes .scdot").nth(n).click();
}

/**
 * Whether the engine can render: the canonical template lives in a private corpus, and a
 * runner with no credential for it (the shared CI today) cannot exercise the artifact. A
 * spec that needs the stage skips with that reason rather than failing on a wall that is
 * not the app's (recorded in the build record as ASM-B01).
 */
export async function rendererAvailable(request: APIRequestContext): Promise<boolean> {
  const health = await request.get("/api/health");
  return health.ok() && (await health.json()).renderer_available === true;
}

export const RENDERER_SKIP = "the pinned renderer is not resolvable on this runner (no WORKSHOPS_RENDERER_FILE or playbook-studio credential); see the build record's ASM-B01";
