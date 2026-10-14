import type { Activity, Capture, Dataset } from "../types";
import { clock, fieldsText, poolOf } from "../lib/capture";
import { SectionTitle } from "./ui";

/** The facilitator script projection in engine chrome: goal, say, watch, and the recorded state inline under each item. */
export function ScriptView({ dataset, capture, activity, offset }: { dataset: Dataset; capture: Capture; activity: Activity; offset: number }) {
  const rows = recorded(activity, capture);
  return (
    <div data-testid="script-view">
      <div className="font-mono text-xs tabular-nums text-muted-foreground">
        {clock(offset)} to {clock(offset + activity.mins)}, {activity.kind}, {activity.mins}m
      </div>
      <h3 className="display mt-2 text-lg font-semibold tracking-tight">{activity.name}</h3>
      <div className="mt-5">
        <SectionTitle>Goal</SectionTitle>
        <p className="mt-1 text-sm">{activity.script.goal}</p>
      </div>
      {activity.script.run?.length > 0 && (
        <div className="mt-5">
          <SectionTitle>Run</SectionTitle>
          <ol className="mt-1 flex list-decimal flex-col gap-1 pl-5 text-sm">
            {activity.script.run.map((s, i) => (<li key={i}>{s}</li>))}
          </ol>
        </div>
      )}
      {activity.script.say?.length > 0 && (
        <div className="mt-5">
          <SectionTitle>Say</SectionTitle>
          <ul className="mt-1 flex flex-col gap-1 text-sm">
            {activity.script.say.map((s, i) => (<li key={i}>{s}</li>))}
          </ul>
        </div>
      )}
      <div className="mt-5">
        <SectionTitle>Watch</SectionTitle>
        <p className="mt-1 text-sm">{activity.script.watch}</p>
      </div>
      {rows.length > 0 && (
        <>
          <div className="mt-6 h-px w-full bg-border" />
          <div className="mt-5 flex flex-col gap-4" data-testid="script-recorded">
            {rows.map((r) => (
              <div key={r.id + r.label}>
                <div className="flex items-baseline gap-3">
                  <span className="font-mono text-xs text-muted-foreground">{r.id}</span>
                  <span className="text-sm font-medium">{r.label}</span>
                </div>
                {r.recorded ? (
                  <div className="mt-1.5 rounded-md border border-border bg-background px-3 py-2 text-sm" data-recorded={r.id}>
                    <span className="font-semibold">{r.recorded}</span>
                    {r.note && <span className="text-muted-foreground">, {r.note}</span>}
                  </div>
                ) : (
                  <div className="mt-1.5 rounded-md border border-dashed border-input px-3 py-2 text-sm text-muted-foreground">Awaiting the room</div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
      <p className="sr-only">{dataset.meta.objective}</p>
    </div>
  );
}

function recorded(act: Activity, capture: Capture): { id: string; label: string; recorded?: string; note?: string }[] {
  if (act.kind === "collect") {
    const values = capture[act.id]?.slots || {};
    return (act.slots || []).map((sl) => ({ id: act.item?.id || act.id, label: sl.label, recorded: values[sl.k] || undefined }));
  }
  if (act.kind === "walk" || act.kind === "sort") {
    return (act.items || []).map((it) => {
      const id = String(it.id);
      const pool = poolOf(act, capture[id]?.mark);
      return { id, label: String(it.stmt || it.name || ""), recorded: pool?.label, note: fieldsText(capture, id) || undefined };
    });
  }
  if (act.kind === "assign") {
    return (act.rows || []).filter((r) => r.editable).map((r) => ({ id: r.id, label: r.name, recorded: capture[r.id]?.closer || undefined }));
  }
  return [];
}
