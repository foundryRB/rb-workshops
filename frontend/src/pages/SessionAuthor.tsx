import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api, ApiError } from "../api/client";
import { Shell } from "../components/Shell";
import { Alert, Button, Crumbs, Field, SectionTitle, ShelfChip, Tabs, inputClass, textareaClass } from "../components/ui";
import { clock, offsets } from "../lib/capture";
import { KINDS, TONES, type Activity, type Dataset, type Kind, type Report, type Session } from "../types";

/** The author screen: the room and facilitator layers of one activity, the kind's content, and the schema panel re-evaluating on each change. */

const KIND_TEMPLATES: Record<Kind, Partial<Activity>> = {
  frame: { panels: [{ name: "Panel", phase: "active", line: "One line the room reads.", done: "what done means" }] },
  collect: { item: { id: "ITM-001", badge: "decided", title: "The decided thing", known: "What is agreed." }, slots: [{ k: "owner", label: "Owner", hint: "a person" }] },
  walk: { prompt: "Does this hold?", verdicts: [{ k: "holds", label: "Holds", tone: "ok" }, { k: "objection", label: "Objection", tone: "hot", fields: [{ k: "action", ph: "what resolves it" }, { k: "who", ph: "who owns it" }] }], items: [{ id: "STM-01", stmt: "A statement.", detail: "The detail." }] },
  sort: { buckets: [{ k: "agreed", label: "Agreed now", tone: "ok", fields: [{ k: "who", ph: "who executes" }] }, { k: "dated", label: "Dated", tone: "mid", fields: [{ k: "date", ph: "by when" }] }, { k: "escalate", label: "Escalate", tone: "hot" }], items: [{ id: "ITM-002", name: "The ask", ask: "What is asked.", owner: "owner", when: "asked for 2030-01-15" }] },
  assign: { rows: [{ id: "R1", name: "The first seat", evidence: "What this person signs.", editable: true, ph: "name the person" }] },
  close: {},
};

function retype(act: Activity, kind: Kind): Activity {
  const base: Activity = { id: act.id, kind, name: act.name, mins: act.mins, question: act.question, script: act.script };
  return { ...base, ...structuredClone(KIND_TEMPLATES[kind]) } as Activity;
}

export default function SessionAuthor() {
  const { id = "" } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [baseRevision, setBaseRevision] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [selected, setSelected] = useState<string>("meta");
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    const wanted = params.get("revision");
    api.getSession(id).then(async (s) => {
      setSession(s);
      const rev = wanted ? await api.getRevision(id, Number(wanted)) : s.revision;
      setDataset(rev.dataset);
      setBaseRevision(rev.number);
      setReport(await api.validate(rev.dataset));
    });
  }, [id, params]);

  // The schema panel re-evaluates on each change: the same validator, through the same door.
  const revalidate = useCallback((data: Dataset) => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      api.validate(data).then(setReport).catch(() => undefined);
    }, 150);
  }, []);

  const update = (fn: (d: Dataset) => void) => {
    setDataset((prev) => {
      if (!prev) return prev;
      const next = structuredClone(prev);
      fn(next);
      revalidate(next);
      return next;
    });
    setDirty(true);
  };

  const activity = dataset?.activities.find((a) => a.id === selected);
  const rundown = useMemo(() => (dataset ? offsets(dataset) : []), [dataset]);

  const save = async () => {
    if (!dataset) return;
    setBusy(true);
    setError(null);
    try {
      const s = await api.reviseSession(id, dataset, note || "saved from the author screen");
      setSession({ ...s });
      setBaseRevision(s.current_revision);
      setDirty(false);
      setNote("");
      navigate(`/sessions/${id}`, { replace: true });
    } catch (e) {
      const err = e as ApiError;
      setError(err.message);
      if (err.body && typeof err.body === "object" && "report" in err.body) setReport((err.body as { report: Report }).report);
    } finally {
      setBusy(false);
    }
  };

  const rehearse = async () => {
    const run = await api.startRun(id, "rehearsal", baseRevision);
    navigate(`/runs/${run.id}`);
  };

  const addActivity = () => {
    update((d) => {
      const n = d.activities.length + 1;
      d.activities.splice(Math.max(0, d.activities.length - 1), 0, {
        id: `A${n}`,
        kind: "walk",
        name: `Activity ${n}`,
        mins: 5,
        question: "The question the room sees.",
        script: { goal: "The goal.", run: ["Read, ask, wait."], say: ["One breath."], watch: "What to watch for." },
        ...structuredClone(KIND_TEMPLATES.walk),
      } as Activity);
    });
  };

  if (!dataset || !session) {
    return (
      <Shell active="shelf" header={<Crumbs items={[{ label: "Shelf", to: "/" }, { label: "Session" }]} />}>
        <main className="flex-1 px-8 py-6" aria-busy="true">
          <div className="h-4 w-1/3 rounded-sm bg-muted" />
        </main>
      </Shell>
    );
  }

  const railItem = (key: string, kind: string, label: string) => (
    <button
      key={key}
      type="button"
      onClick={() => setSelected(key)}
      aria-pressed={selected === key}
      className={`flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left text-sm ${selected === key ? "bg-accent font-medium text-accent-foreground" : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"}`}
    >
      <span className="w-14 shrink-0 font-mono text-xs">{kind}</span>
      <span className="truncate">{label}</span>
    </button>
  );

  return (
    <Shell
      active="shelf"
      section={
        <>
          <div className="px-3 pb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Activities</div>
          <nav className="flex flex-col gap-0.5" aria-label="Activities">
            {railItem("meta", "meta", "The session")}
            {dataset.activities.map((a) => railItem(a.id, a.kind, a.name))}
            <button type="button" onClick={addActivity} className="mt-1 rounded-md px-3 py-1.5 text-left text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground">
              Add activity
            </button>
          </nav>
        </>
      }
      header={
        <>
          <Crumbs items={[{ label: "Shelf", to: "/" }, { label: session.title, to: `/sessions/${id}` }, { label: "Author" }]} />
          <ShelfChip state={session.shelf_state} />
          <span className="font-mono text-xs tabular-nums text-muted-foreground" data-testid="revision-status">
            rev {baseRevision}{dirty ? ", unsaved" : ", saved"}
          </span>
          <Tabs current="author" tabs={[{ id: "author", label: "Author", to: `/sessions/${id}` }, { id: "revisions", label: "Revisions", to: `/sessions/${id}/revisions` }, { id: "runs", label: "Runs", to: `/sessions/${id}/runs` }]} />
          <div className="flex gap-2">
            <Button onClick={rehearse} data-testid="rehearse">Rehearse</Button>
            <Button variant="primary" onClick={save} disabled={busy || !dirty} data-testid="save-revision">
              Save revision
            </Button>
          </div>
        </>
      }
    >
      <div className="flex min-h-0 flex-1">
        <main className="flex-1 overflow-auto px-8 py-6">
          {error && (
            <div className="mb-4">
              <Alert title="The revision was not saved">{error}</Alert>
            </div>
          )}
          {selected === "meta" ? (
            <MetaEditor dataset={dataset} update={update} />
          ) : activity ? (
            <ActivityEditor activity={activity} update={update} dataset={dataset} onRemove={() => { update((d) => { d.activities = d.activities.filter((a) => a.id !== activity.id); }); setSelected("meta"); }} />
          ) : null}
          <section className="mt-8">
            <Field label="Change note for this revision">
              <input className={inputClass} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What changed, in one line" data-testid="change-note" />
            </Field>
          </section>
        </main>
        <aside className="w-80 shrink-0 overflow-auto border-l border-border px-6 py-6" aria-label="Schema">
          <SectionTitle>Schema</SectionTitle>
          <div className="mt-3 flex flex-col gap-3" data-testid="schema-errors">
            {report?.rows.filter((r) => !r.ok).map((r) => (
              <Alert key={r.row} title={r.label}>{r.detail}</Alert>
            ))}
          </div>
          <div className="mt-4 divide-y divide-border rounded-md border border-border bg-card text-sm" data-testid="schema-rows">
            {(report?.rows || []).map((r) => (
              <div key={r.row} className="flex items-center justify-between gap-3 p-3" data-row={r.row} data-ok={String(r.ok)}>
                <span>{r.label}</span>
                <span className={r.ok ? "text-muted-foreground" : "font-medium text-destructive"}>{r.ok ? r.detail : "violated"}</span>
              </div>
            ))}
          </div>
          <SectionTitle className="mt-8">Rundown</SectionTitle>
          <div className="mt-3 divide-y divide-border rounded-md border border-border bg-card font-mono text-xs tabular-nums">
            {dataset.activities.map((a, i) => (
              <div key={a.id} className="flex justify-between p-2.5">
                <span>{clock(rundown[i] || 0)}</span>
                <span className="text-muted-foreground">{a.kind}</span>
                <span>{a.mins}m</span>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </Shell>
  );
}

function MetaEditor({ dataset, update }: { dataset: Dataset; update: (fn: (d: Dataset) => void) => void }) {
  const m = dataset.meta;
  const set = (k: keyof Dataset["meta"], v: string | number) => update((d) => { (d.meta as unknown as Record<string, string | number>)[k] = v; });
  return (
    <>
      <section>
        <SectionTitle>Room</SectionTitle>
        <div className="mt-3 grid grid-cols-2 gap-4">
          <Field label="Session title" className="col-span-2"><input className={`${inputClass} display`} value={m.title} onChange={(e) => set("title", e.target.value)} data-testid="meta-title" /></Field>
          <Field label="Question the room sees" className="col-span-2"><input className={inputClass} value={m.question} onChange={(e) => set("question", e.target.value)} /></Field>
          <Field label="Eyebrow"><input className={inputClass} value={m.eyebrow} onChange={(e) => set("eyebrow", e.target.value)} /></Field>
          <Field label="Session"><input className={inputClass} value={m.session} onChange={(e) => set("session", e.target.value)} /></Field>
          <Field label="Date"><input className={`${inputClass} font-mono`} value={m.date} onChange={(e) => set("date", e.target.value)} /></Field>
          <Field label="Duration, minutes"><input className={`${inputClass} font-mono tabular-nums`} type="number" value={m.duration} onChange={(e) => set("duration", Number(e.target.value))} data-testid="meta-duration" /></Field>
          <Field label="Id"><input className={`${inputClass} font-mono`} value={m.id} onChange={(e) => set("id", e.target.value)} /></Field>
          <Field label="Version"><input className={`${inputClass} font-mono`} value={m.version} onChange={(e) => set("version", e.target.value)} /></Field>
          <Field label="Classification"><input className={inputClass} value={m.classification} onChange={(e) => set("classification", e.target.value)} /></Field>
        </div>
      </section>
      <section className="mt-8">
        <div className="flex items-center gap-3">
          <SectionTitle>Facilitator</SectionTitle>
          <span className="inline-flex items-center rounded-full border border-input px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">Internal, never on the stage</span>
        </div>
        <div className="mt-3 grid gap-4">
          <Field label="Objective"><input className={inputClass} value={m.objective} onChange={(e) => set("objective", e.target.value)} /></Field>
        </div>
      </section>
    </>
  );
}

function ActivityEditor({ activity, update, dataset, onRemove }: { activity: Activity; update: (fn: (d: Dataset) => void) => void; dataset: Dataset; onRemove: () => void }) {
  const idx = dataset.activities.findIndex((a) => a.id === activity.id);
  const setA = (fn: (a: Activity) => void) => update((d) => { fn(d.activities[idx]); });
  const lines = (arr: string[] | undefined) => (arr || []).join("\n");
  const fromLines = (s: string) => s.split("\n").map((l) => l.trim()).filter(Boolean);
  return (
    <>
      <section>
        <SectionTitle>Room</SectionTitle>
        <div className="mt-3 grid grid-cols-2 gap-4">
          <Field label="Activity name" className="col-span-2"><input className={`${inputClass} display`} value={activity.name} onChange={(e) => setA((a) => { a.name = e.target.value; })} data-testid="activity-name" /></Field>
          <Field label="Question the room sees" className="col-span-2"><input className={inputClass} value={activity.question} onChange={(e) => setA((a) => { a.question = e.target.value; })} /></Field>
          <Field label="Kind">
            <select className={inputClass} value={activity.kind} onChange={(e) => update((d) => { d.activities[idx] = retype(d.activities[idx], e.target.value as Kind); })} data-testid="activity-kind">
              {KINDS.map((k) => (<option key={k} value={k}>{k}</option>))}
            </select>
          </Field>
          <Field label="Timebox, minutes"><input className={`${inputClass} font-mono tabular-nums`} type="number" value={activity.mins} onChange={(e) => setA((a) => { a.mins = Number(e.target.value); })} data-testid="activity-mins" /></Field>
          <Field label="Id"><input className={`${inputClass} font-mono`} value={activity.id} onChange={(e) => setA((a) => { a.id = e.target.value; })} /></Field>
        </div>
      </section>
      <section className="mt-8">
        <div className="flex items-center gap-3">
          <SectionTitle>Facilitator</SectionTitle>
          <span className="inline-flex items-center rounded-full border border-input px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">Internal, never on the stage</span>
        </div>
        <div className="mt-3 grid gap-4">
          <Field label="Goal"><input className={inputClass} value={activity.script.goal} onChange={(e) => setA((a) => { a.script.goal = e.target.value; })} /></Field>
          <Field label="Run, one step per line"><textarea className={textareaClass} value={lines(activity.script.run)} onChange={(e) => setA((a) => { a.script.run = fromLines(e.target.value); })} /></Field>
          <Field label="Spoken openers, one per line"><textarea className={textareaClass} value={lines(activity.script.say)} onChange={(e) => setA((a) => { a.script.say = fromLines(e.target.value); })} /></Field>
          <Field label="Watch out for"><input className={inputClass} value={activity.script.watch} onChange={(e) => setA((a) => { a.script.watch = e.target.value; })} /></Field>
        </div>
      </section>
      <KindEditor activity={activity} setA={setA} />
      <div className="mt-8">
        <Button variant="ghost" onClick={onRemove}>Remove activity</Button>
      </div>
    </>
  );
}

type RowSpec = { key: string; label: string; kind?: "text" | "number" | "bool" | "tone" };

function RowsEditor({ title, rows, spec, onChange, blank }: { title: string; rows: Record<string, unknown>[]; spec: RowSpec[]; onChange: (rows: Record<string, unknown>[]) => void; blank: () => Record<string, unknown> }) {
  const setCell = (i: number, key: string, value: unknown) => {
    const next = rows.map((r, j) => (j === i ? { ...r, [key]: value } : r));
    onChange(next);
  };
  return (
    <section className="mt-8">
      <SectionTitle>{title}</SectionTitle>
      <div className="mt-3 divide-y divide-border rounded-md border border-border bg-card">
        {rows.map((row, i) => (
          <div key={i} className="grid gap-3 p-3" style={{ gridTemplateColumns: `repeat(${spec.length}, minmax(0, 1fr)) auto` }}>
            {spec.map((s) => (
              <label key={s.key} className="grid gap-1">
                <span className="text-xs text-muted-foreground">{s.label}</span>
                {s.kind === "bool" ? (
                  <input type="checkbox" checked={Boolean(row[s.key])} onChange={(e) => setCell(i, s.key, e.target.checked)} className="h-4 w-4" />
                ) : s.kind === "tone" ? (
                  <select className={inputClass} value={String(row[s.key] || "ok")} onChange={(e) => setCell(i, s.key, e.target.value)}>
                    {TONES.map((t) => (<option key={t} value={t}>{t}</option>))}
                  </select>
                ) : (
                  <input className={`${inputClass} ${s.key === "id" || s.key === "k" ? "font-mono" : ""}`} type={s.kind === "number" ? "number" : "text"} value={String(row[s.key] ?? "")} onChange={(e) => setCell(i, s.key, s.kind === "number" ? Number(e.target.value) : e.target.value)} />
                )}
              </label>
            ))}
            <button type="button" className="self-end rounded-md px-2 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground" onClick={() => onChange(rows.filter((_, j) => j !== i))} aria-label={`Remove row ${i + 1}`}>
              Remove
            </button>
          </div>
        ))}
        <div className="p-3">
          <Button variant="ghost" onClick={() => onChange([...rows, blank()])}>Add row</Button>
        </div>
      </div>
    </section>
  );
}

function KindEditor({ activity, setA }: { activity: Activity; setA: (fn: (a: Activity) => void) => void }) {
  const a = activity;
  switch (a.kind) {
    case "frame":
      return <RowsEditor title="Panels" rows={(a.panels || []) as Record<string, unknown>[]} spec={[{ key: "name", label: "Name" }, { key: "phase", label: "Phase" }, { key: "line", label: "Line" }, { key: "done", label: "Done means" }, { key: "dim", label: "Dim", kind: "bool" }]} onChange={(rows) => setA((x) => { x.panels = rows as Activity["panels"]; })} blank={() => ({ name: "", phase: "active", line: "", done: "" })} />;
    case "collect":
      return (
        <>
          <section className="mt-8">
            <SectionTitle>The decided thing</SectionTitle>
            <div className="mt-3 grid grid-cols-2 gap-4">
              <Field label="Item id"><input className={`${inputClass} font-mono`} value={a.item?.id || ""} onChange={(e) => setA((x) => { x.item = { ...(x.item || { badge: "", title: "", known: "" }), id: e.target.value }; })} /></Field>
              <Field label="Badge"><input className={inputClass} value={a.item?.badge || ""} onChange={(e) => setA((x) => { x.item = { ...(x.item || { id: "", title: "", known: "" }), badge: e.target.value }; })} /></Field>
              <Field label="Title" className="col-span-2"><input className={inputClass} value={a.item?.title || ""} onChange={(e) => setA((x) => { x.item = { ...(x.item || { id: "", badge: "", known: "" }), title: e.target.value }; })} /></Field>
              <Field label="Known" className="col-span-2"><input className={inputClass} value={a.item?.known || ""} onChange={(e) => setA((x) => { x.item = { ...(x.item || { id: "", badge: "", title: "" }), known: e.target.value }; })} /></Field>
            </div>
          </section>
          <RowsEditor title="Slots" rows={(a.slots || []) as Record<string, unknown>[]} spec={[{ key: "k", label: "Key" }, { key: "label", label: "Label" }, { key: "hint", label: "Hint" }]} onChange={(rows) => setA((x) => { x.slots = rows as Activity["slots"]; })} blank={() => ({ k: "", label: "", hint: "" })} />
        </>
      );
    case "walk":
      return (
        <>
          <section className="mt-8">
            <Field label="Prompt"><input className={inputClass} value={a.prompt || ""} onChange={(e) => setA((x) => { x.prompt = e.target.value; })} /></Field>
          </section>
          <RowsEditor title="Verdicts" rows={(a.verdicts || []) as Record<string, unknown>[]} spec={[{ key: "k", label: "Key" }, { key: "label", label: "Label" }, { key: "tone", label: "Tone", kind: "tone" }]} onChange={(rows) => setA((x) => { x.verdicts = rows as Activity["verdicts"]; })} blank={() => ({ k: "", label: "", tone: "ok" })} />
          <RowsEditor title="Statements" rows={(a.items || []) as Record<string, unknown>[]} spec={[{ key: "id", label: "Id" }, { key: "stmt", label: "Statement" }, { key: "detail", label: "Detail" }]} onChange={(rows) => setA((x) => { x.items = rows; })} blank={() => ({ id: "", stmt: "", detail: "" })} />
        </>
      );
    case "sort":
      return (
        <>
          <RowsEditor title="Buckets" rows={(a.buckets || []) as Record<string, unknown>[]} spec={[{ key: "k", label: "Key" }, { key: "label", label: "Label" }, { key: "tone", label: "Tone", kind: "tone" }]} onChange={(rows) => setA((x) => { x.buckets = rows as Activity["buckets"]; })} blank={() => ({ k: "", label: "", tone: "ok" })} />
          <RowsEditor title="The queue" rows={(a.items || []) as Record<string, unknown>[]} spec={[{ key: "id", label: "Id" }, { key: "name", label: "Name" }, { key: "ask", label: "Ask" }, { key: "owner", label: "Owner" }, { key: "when", label: "When" }]} onChange={(rows) => setA((x) => { x.items = rows; })} blank={() => ({ id: "", name: "", ask: "", owner: "", when: "" })} />
        </>
      );
    case "assign":
      return <RowsEditor title="The roster" rows={(a.rows || []) as Record<string, unknown>[]} spec={[{ key: "id", label: "Id" }, { key: "name", label: "Name" }, { key: "evidence", label: "Evidence" }, { key: "editable", label: "Editable", kind: "bool" }, { key: "ph", label: "Placeholder" }, { key: "who", label: "Held by" }]} onChange={(rows) => setA((x) => { x.rows = rows as Activity["rows"]; })} blank={() => ({ id: "", name: "", evidence: "", editable: true, ph: "" })} />;
    case "close":
      return (
        <section className="mt-8">
          <SectionTitle>Read-back</SectionTitle>
          <p className="mt-3 text-sm text-muted-foreground">The close derives everything from the recorded state; it carries no content of its own.</p>
        </section>
      );
  }
}
