/** What a run's capture says, per activity: the same rules the renderer keeps in its read-back. */
import type { Activity, Capture, Dataset, Tone } from "../types";

export interface Progress {
  activity: Activity;
  done: number;
  total: number;
  label: string;
  reached: boolean;
}

export interface ReadbackRow {
  id: string;
  text: string;
  note?: string;
  status: string;
  tone: Tone | "open";
  open: boolean;
}

export function poolOf(act: Activity, key: string | undefined) {
  const pools = act.verdicts || act.buckets || [];
  return key ? pools.find((p) => p.k === key) : undefined;
}

export function fieldsText(capture: Capture, id: string): string {
  const f = capture[id]?.fields || {};
  return Object.values(f)
    .filter(Boolean)
    .join(", ");
}

export function progress(dataset: Dataset, capture: Capture): Progress[] {
  return dataset.activities.map((act) => {
    switch (act.kind) {
      case "frame":
        return { activity: act, done: 0, total: 0, label: "no capture", reached: false };
      case "collect": {
        const slots = act.slots || [];
        const values = capture[act.id]?.slots || {};
        const done = slots.filter((s) => values[s.k]).length;
        return { activity: act, done, total: slots.length, label: `${done} of ${slots.length} slots`, reached: done > 0 };
      }
      case "walk": {
        const items = act.items || [];
        const done = items.filter((it) => capture[String(it.id)]?.mark).length;
        return { activity: act, done, total: items.length, label: `${done} of ${items.length} verdicts`, reached: done > 0 };
      }
      case "sort": {
        const items = act.items || [];
        const done = items.filter((it) => capture[String(it.id)]?.mark).length;
        return { activity: act, done, total: items.length, label: `${done} of ${items.length} landed`, reached: done > 0 };
      }
      case "assign": {
        const rows = (act.rows || []).filter((r) => r.editable);
        const done = rows.filter((r) => capture[r.id]?.closer).length;
        return { activity: act, done, total: rows.length, label: `${done} of ${rows.length} named`, reached: done > 0 };
      }
      case "close":
        return { activity: act, done: 0, total: 0, label: "the read-back", reached: false };
    }
  });
}

export function readback(dataset: Dataset, capture: Capture): { activity: Activity; rows: ReadbackRow[] }[] {
  const groups: { activity: Activity; rows: ReadbackRow[] }[] = [];
  for (const act of dataset.activities) {
    const rows: ReadbackRow[] = [];
    if (act.kind === "collect") {
      const values = capture[act.id]?.slots || {};
      for (const sl of act.slots || []) {
        const v = values[sl.k];
        rows.push({ id: act.item?.id || act.id, text: v ? `${sl.label}: ${v}` : sl.label, status: v ? "set" : "open", tone: v ? "ok" : "open", open: !v });
      }
    } else if (act.kind === "walk" || act.kind === "sort") {
      for (const it of act.items || []) {
        const id = String(it.id);
        const mark = capture[id]?.mark;
        const pool = poolOf(act, mark);
        const note = fieldsText(capture, id);
        rows.push({
          id,
          text: String(it.name || it.stmt || ""),
          note: note || undefined,
          status: pool ? pool.label : "open",
          tone: pool ? pool.tone : "open",
          open: !pool,
        });
      }
    } else if (act.kind === "assign") {
      for (const r of act.rows || []) {
        if (!r.editable) continue;
        const v = capture[r.id]?.closer;
        rows.push({ id: r.id, text: v ? `${r.name}: ${v}` : r.name, status: v ? "named" : "open", tone: v ? "ok" : "open", open: !v });
      }
    }
    if (rows.length) groups.push({ activity: act, rows });
  }
  return groups;
}

export function offsets(dataset: Dataset): number[] {
  const out: number[] = [];
  let off = 0;
  for (const a of dataset.activities) {
    out.push(off);
    off += Number(a.mins) || 0;
  }
  return out;
}

export function clock(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
