import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api/client";
import { mountBridge, type Bridge } from "../bridge/bridge";
import { ScriptView } from "../components/ScriptView";
import { Shell } from "../components/Shell";
import { Alert, Button, Chip, Crumbs, SectionTitle } from "../components/ui";
import { offsets, progress } from "../lib/capture";
import type { Capture, Dataset, Run, Session } from "../types";

/** The run console: the Stage embeds the real artifact same-origin; the Script is engine-rendered and gated. */
export default function RunConsole() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [run, setRun] = useState<Run | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [capture, setCapture] = useState<Capture>({});
  const [bridge, setBridge] = useState<Bridge | null>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [selected, setSelected] = useState<number>(0);
  const [scriptOpen, setScriptOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bridgeRef = useRef<Bridge | null>(null);

  useEffect(() => {
    let live = true;
    api.getRun(id).then(async (r) => {
      if (!live) return;
      if (r.state === "closed") {
        navigate(`/runs/${r.id}/capture`, { replace: true });
        return;
      }
      const s = await api.getSession(r.session_id);
      const rev = await api.getRevision(r.session_id, r.revision);
      if (!live) return;
      setRun(r);
      setSession(s);
      setDataset(rev.dataset);
      setCapture(r.capture || {});
      const b = mountBridge(rev.dataset.meta, r.id, r.capture || {}, (c) => api.landCapture(r.id, c, false).then(() => undefined), (c) => setCapture(c));
      bridgeRef.current = b;
      setBridge(b);
      if (b.owner) setSrc(api.runArtifactUrl(r.id));
    });
    const onLeave = () => bridgeRef.current?.release();
    window.addEventListener("pagehide", onLeave);
    return () => {
      live = false;
      window.removeEventListener("pagehide", onLeave);
      bridgeRef.current?.release();
      bridgeRef.current = null;
    };
  }, [id, navigate]);

  const rows = useMemo(() => (dataset ? progress(dataset, capture) : []), [dataset, capture]);
  const offs = useMemo(() => (dataset ? offsets(dataset) : []), [dataset]);

  const close = async () => {
    if (!run || !bridge) return;
    if (!window.confirm("Close the run? The capture and the artifact freeze; this cannot be undone.")) return;
    setClosing(true);
    setError(null);
    try {
      await bridge.landNow();
      const current = bridge.current();
      await api.landCapture(run.id, current, true);
      bridge.release();
      navigate(`/runs/${run.id}/capture`);
    } catch (e) {
      setError((e as Error).message);
      setClosing(false);
    }
  };

  if (!run || !session || !dataset) {
    return (
      <Shell active="runs" header={<Crumbs items={[{ label: "Runs", to: "/runs" }, { label: "Run" }]} />}>
        <main className="flex-1 px-8 py-6" aria-busy="true"><div className="h-4 w-1/3 rounded-sm bg-muted" /></main>
      </Shell>
    );
  }

  const kindLabel = run.kind === "session" ? "Session, live" : "Rehearsal, live";
  return (
    <Shell
      active="runs"
      section={
        <>
          <div className="px-3 pb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Captured</div>
          <div className="flex flex-col gap-0.5 text-sm" data-testid="capture-progress">
            {rows.map((p, i) => (
              <button
                key={p.activity.id}
                type="button"
                onClick={() => setSelected(i)}
                aria-pressed={selected === i}
                className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-left ${selected === i ? "bg-accent font-medium text-accent-foreground" : ""}`}
                data-activity={p.activity.id}
              >
                <span className={`w-14 shrink-0 font-mono text-xs ${selected === i ? "" : "text-muted-foreground"}`}>{p.activity.kind}</span>
                <span className={p.reached ? "" : "text-muted-foreground"}>{p.label}</span>
              </button>
            ))}
          </div>
        </>
      }
      header={
        <>
          <Crumbs items={[{ label: "Runs", to: "/runs" }, { label: session.title }]} />
          <Chip tone="primary">{kindLabel}</Chip>
          <span className="font-mono text-xs tabular-nums text-muted-foreground" data-testid="run-status">
            rev {run.revision}, started {run.started_at.slice(11, 16)}, {dataset.meta.duration}m
          </span>
          <div className="ml-auto flex gap-2">
            <a className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent" href={api.runArtifactUrl(run.id)} target="_blank" rel="noreferrer">
              Open on the room screen
            </a>
            <Button onClick={() => setScriptOpen((v) => !v)} aria-pressed={scriptOpen} data-testid="reveal-script">
              {scriptOpen ? "Hide the script" : "Reveal the script"}
            </Button>
            <Button variant="destructive" onClick={close} disabled={closing || !bridge?.owner} data-testid="close-run">
              Close the run
            </Button>
          </div>
        </>
      }
    >
      <main className={`grid flex-1 gap-6 px-8 py-6 ${scriptOpen ? "grid-cols-2" : "grid-cols-1"}`}>
        {error && <div className="col-span-full"><Alert title="The run could not be closed">{error}</Alert></div>}
        {bridge && !bridge.owner && (
          <div className="col-span-full">
            <Alert title="This revision is already open">{bridge.refusal}</Alert>
            <div className="mt-3 flex gap-2">
              <Button onClick={() => window.location.reload()}>Try again</Button>
              <Link to="/runs" className="inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium hover:bg-accent">Back to runs</Link>
            </div>
          </div>
        )}
        <section className="flex min-h-[60vh] flex-col">
          <div className="flex items-center gap-2">
            <SectionTitle>Stage</SectionTitle>
            <span className="rounded border border-border px-2 py-0.5 font-mono text-xs text-muted-foreground">the room sees this</span>
          </div>
          <div className="mt-3 flex-1 overflow-hidden rounded-md border border-border">
            {src && (
              <iframe title="The room's working surface" src={src} className="h-[60vh] min-h-[400px] w-full" data-testid="stage" sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-modals" />
            )}
          </div>
        </section>
        {scriptOpen && (
          <section className="flex flex-col" data-testid="script-panel">
            <div className="flex items-center gap-2">
              <SectionTitle>Script</SectionTitle>
              <Chip>Internal, gated</Chip>
            </div>
            <div className="mt-3 flex-1 overflow-auto rounded-md border border-border bg-card p-6">
              {dataset.activities[selected] && (
                <ScriptView dataset={dataset} capture={capture} activity={dataset.activities[selected]} offset={offs[selected] || 0} />
              )}
            </div>
          </section>
        )}
      </main>
    </Shell>
  );
}
