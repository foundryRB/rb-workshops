/** The session dataset (REF-Workshop section 3) and the engine's records, as the API answers them. */

export type Kind = "frame" | "collect" | "walk" | "sort" | "assign" | "close";
export const KINDS: Kind[] = ["frame", "collect", "walk", "sort", "assign", "close"];
export type Tone = "ok" | "mid" | "hot";
export const TONES: Tone[] = ["ok", "mid", "hot"];

export interface Meta {
  id: string;
  title: string;
  eyebrow: string;
  session: string;
  date: string;
  duration: number;
  version: string;
  classification: string;
  question: string;
  objective: string;
}

export interface Script {
  goal: string;
  run: string[];
  say: string[];
  watch: string;
}

export interface Field {
  k: string;
  ph: string;
}

export interface Activity {
  id: string;
  kind: Kind;
  name: string;
  mins: number;
  question: string;
  script: Script;
  panels?: { name: string; phase: string; line: string; done: string; dim?: boolean }[];
  item?: { id: string; badge: string; title: string; known: string };
  slots?: { k: string; label: string; hint: string }[];
  prompt?: string;
  verdicts?: { k: string; label: string; tone: Tone; fields?: Field[] }[];
  items?: Record<string, unknown>[];
  buckets?: { k: string; label: string; tone: Tone; fields?: Field[] }[];
  rows?: { id: string; name: string; evidence: string; editable?: boolean; ph?: string; who?: string }[];
}

export interface Dataset {
  meta: Meta;
  activities: Activity[];
}

export type Capture = Record<string, { mark?: string; fields?: Record<string, string>; slots?: Record<string, string>; closer?: string }>;

export interface Session {
  id: string;
  title: string;
  shelf_state: "ephemeral" | "draft" | "published";
  current_revision: number;
  created_at: string;
  updated_at: string;
}

export interface RevisionSummary {
  session_id: string;
  number: number;
  note: string;
  door: "ui" | "api" | "mcp";
  author: string;
  created_at: string;
  summary?: { title: string; duration: number; activities: number };
}

export interface Revision extends RevisionSummary {
  dataset: Dataset;
}

export interface Run {
  id: string;
  session_id: string;
  revision: number;
  kind: "rehearsal" | "session";
  state: "live" | "closed";
  capture: Capture;
  started_at: string;
  closed_at: string | null;
  artifact_sha256: string | null;
  renderer: string | null;
}

export interface Publication {
  id: string;
  session_id: string;
  revision: number;
  repository: string;
  ref: string;
  path: string;
  commit_sha: string;
  sha256: string;
  renderer: string;
  published_at: string;
}

export interface ReportRow {
  row: string;
  label: string;
  ok: boolean;
  detail: string;
}

export interface Report {
  ok: boolean;
  rows: ReportRow[];
}

export interface Doors {
  ports: { port: string; api: string[]; mcp: string[] }[];
  renderer: { pin: string; source: string; pinned: string; available: boolean; state: string };
  home: { repository: string; ref: string; path: string; configured: boolean };
  mcp: { path: string; configured: boolean };
}
