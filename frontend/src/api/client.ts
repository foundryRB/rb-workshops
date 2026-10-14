/** The UI door: every call is one of the API door's declared routes (ports.json), marked X-Door: ui. */
import type { Capture, Dataset, Doors, Publication, Report, Revision, RevisionSummary, Run, Session } from "../types";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body?: unknown,
  ) {
    super(message);
  }
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json", "X-Door": "ui", Accept: "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  const parsed = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const detail = parsed && typeof parsed === "object" && "detail" in parsed ? String(parsed.detail) : response.statusText;
    throw new ApiError(response.status, detail, parsed);
  }
  return parsed as T;
}

export const api = {
  listSessions: (state?: string) => call<Session[]>("GET", `/api/sessions${state ? `?state=${state}` : ""}`),
  createSession: (title: string, dataset?: Dataset) => call<Session>("POST", "/api/sessions", { title, dataset }),
  getSession: (id: string) => call<Session & { revision: Revision }>("GET", `/api/sessions/${id}`),
  listRevisions: (id: string) => call<RevisionSummary[]>("GET", `/api/sessions/${id}/revisions`),
  getRevision: (id: string, number: number) => call<Revision>("GET", `/api/sessions/${id}/revisions/${number}`),
  reviseSession: (id: string, dataset: Dataset, note: string) =>
    call<Session>("POST", `/api/sessions/${id}/revisions`, { dataset, note }),
  validate: (dataset: unknown) => call<Report>("POST", "/api/validate", { dataset }),
  startRun: (id: string, kind: "rehearsal" | "session", revision?: number) =>
    call<Run>("POST", `/api/sessions/${id}/runs`, { kind, revision }),
  listRuns: (sessionId?: string) => call<Run[]>("GET", `/api/runs${sessionId ? `?session_id=${sessionId}` : ""}`),
  getRun: (id: string) => call<Run>("GET", `/api/runs/${id}`),
  landCapture: (id: string, capture: Capture, close = false) => call<Run>("POST", `/api/runs/${id}/capture`, { capture, close }),
  runArtifactUrl: (id: string) => `/api/runs/${id}/artifact`,
  planExportUrl: (id: string) => `/api/runs/${id}/plan-export`,
  exportUrl: (id: string, revision?: number) => `/api/sessions/${id}/export${revision ? `?revision=${revision}` : ""}`,
  publish: (id: string, revision?: number) => call<Publication>("POST", `/api/sessions/${id}/publish`, { revision }),
  listPublications: () => call<Publication[]>("GET", "/api/publications"),
  doors: () => call<Doors>("GET", "/api/doors"),
  mcpCredential: () => call<{ user: string; password: string; url: string; connect: string }>("GET", "/api/doors/mcp-credential"),
};
