import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { api, ApiError } from "../api/client";
import { Shell } from "../components/Shell";
import { Alert, Button, Chip, Crumbs, SectionTitle, fmt, shortSha } from "../components/ui";
import { readback } from "../lib/capture";
import type { Dataset, Doors, Publication, Run, Session } from "../types";

/** A closed run: the read-back, the export with its checksum against a fresh render, the publish, and the plan export. */
export default function RunCapture() {
  const { id = "" } = useParams();
  const [run, setRun] = useState<Run | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [doors, setDoors] = useState<Doors | null>(null);
  const [check, setCheck] = useState<{ size: number; sha: string; matched: boolean } | null>(null);
  const [publication, setPublication] = useState<Publication | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.getRun(id).then(async (r) => {
      setRun(r);
      setSession(await api.getSession(r.session_id));
      setDataset((await api.getRevision(r.session_id, r.revision)).dataset);
      api.doors().then(setDoors);
      api.listPublications().then((ps) => setPublication(ps.find((p) => p.session_id === r.session_id && p.revision === r.revision) || null));
      // A fresh render of the same revision, hashed here: the checksum is checked, never assumed.
      const fresh = await fetch(api.exportUrl(r.session_id, r.revision), { headers: { "X-Door": "ui" } });
      const bytes = new Uint8Array(await fresh.arrayBuffer());
      const digest = await crypto.subtle.digest("SHA-256", bytes);
      const sha = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
      setCheck({ size: bytes.length, sha, matched: !r.artifact_sha256 || sha === r.artifact_sha256 });
    });
  }, [id]);

  const groups = useMemo(() => (dataset && run ? readback(dataset, run.capture) : []), [dataset, run]);
  const unresolved = groups.flatMap((g) => g.rows.filter((r) => r.open));
  const items = groups.reduce((n, g) => n + g.rows.length, 0);

  const publish = async () => {
    if (!run) return;
    setBusy(true);
    setPublishError(null);
    try {
      setPublication(await api.publish(run.session_id, run.revision));
    } catch (e) {
      setPublishError((e as ApiError).message);
    } finally {
      setBusy(false);
    }
  };

  if (!run || !session || !dataset) {
    return (
      <Shell active="runs" header={<Crumbs items={[{ label: "Runs", to: "/runs" }, { label: "Capture" }]} />}>
        <main className="flex-1 px-8 py-6" aria-busy="true"><div className="h-4 w-1/3 rounded-sm bg-muted" /></main>
      </Shell>
    );
  }

  return (
    <Shell
      active="runs"
      header={
        <>
          <Crumbs items={[{ label: "Runs", to: "/runs" }, { label: session.title, to: `/sessions/${session.id}` }, { label: "Capture" }]} />
          <Chip>{run.state === "closed" ? "Closed, immutable" : "Live"}</Chip>
          <span className="font-mono text-xs tabular-nums text-muted-foreground">
            rev {run.revision}, {run.kind}, {run.closed_at ? fmt(run.closed_at) : "live"}
          </span>
        </>
      }
    >
      <main className="flex-1 px-8 py-6">
        <div className="grid grid-cols-3 gap-6">
          <div className="col-span-2">
            <SectionTitle>Read back</SectionTitle>
            <div className="mt-3 flex flex-col gap-4" data-testid="readback">
              {groups.map((g) => (
                <div key={g.activity.id} className="overflow-hidden rounded-md border border-border">
                  <div className="border-b border-border bg-muted px-4 py-2 text-sm font-medium text-muted-foreground">
                    {g.activity.kind}, {g.activity.name}
                  </div>
                  <div className="divide-y divide-border bg-card text-sm">
                    {g.rows.map((r, i) => (
                      <div key={r.id + i} className={`flex items-baseline gap-4 px-4 py-3 ${r.open ? "text-destructive" : ""}`} data-readback={r.id}>
                        <span className={`w-24 shrink-0 font-mono text-xs ${r.open ? "" : "text-muted-foreground"}`}>{r.id}</span>
                        <span className="flex-1">
                          {r.text}
                          {r.note && <span className="mt-0.5 block text-xs text-muted-foreground">{r.note}</span>}
                        </span>
                        <span className="font-semibold">{r.open ? "open" : r.status}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              {groups.length === 0 && <p className="text-sm text-muted-foreground">This revision carries no capture shape: only frames and the close.</p>}
            </div>
            {unresolved.length > 0 && (
              <div className="mt-4">
                <Alert title={`${unresolved.length} item${unresolved.length > 1 ? "s" : ""} left the room unresolved`}>
                  {unresolved.map((r) => r.id).join(", ")} carr{unresolved.length > 1 ? "y" : "ies"} no outcome. It exports as open.
                </Alert>
              </div>
            )}
          </div>
          <div>
            <SectionTitle>Export</SectionTitle>
            <div className="mt-3 rounded-md border border-border bg-card p-4">
              <div className="text-sm font-medium">Standalone HTML</div>
              <div className="mt-1 text-sm text-muted-foreground">One self-contained file, rendered by the canonical template.</div>
              <div className="mt-3 flex flex-col gap-1.5 font-mono text-xs">
                <div className="flex justify-between"><span className="text-muted-foreground">renderer</span><span>{shortSha(run.renderer || doors?.renderer.pin)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">size</span><span className="tabular-nums">{check ? `${Math.round(check.size / 1024)} kB` : ""}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">sha256</span><span>{shortSha(run.artifact_sha256 || check?.sha)}</span></div>
              </div>
              {check && (
                <div className={`mt-3 flex items-center gap-2 rounded-md border px-3 py-2 text-sm ${check.matched ? "border-border bg-background" : "border-destructive text-destructive"}`} data-testid="checksum">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true"><path d="M5 12l5 5L20 7" /></svg>
                  <span>{check.matched ? "Checksum matched a fresh render" : "Checksum differs from a fresh render"}</span>
                </div>
              )}
              <a className="mt-4 inline-flex w-full items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90" href={api.runArtifactUrl(run.id)} download={`${dataset.meta.id}.html`} data-testid="download-export">
                Download
              </a>
            </div>
            <div className="mt-4 rounded-md border border-border bg-card p-4">
              <div className="text-sm font-medium">Publish</div>
              <div className="mt-1 text-sm text-muted-foreground">Writes the export to the git-backed home. The store is untouched.</div>
              <div className="mt-3 flex flex-col gap-1.5 font-mono text-xs">
                <div className="flex justify-between"><span className="text-muted-foreground">home</span><span>{doors?.home.repository}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">ref</span><span>{doors?.home.ref}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">path</span><span>{publication?.path || doors?.home.path.replace("{session}", session.id).replace("{revision}", String(run.revision))}</span></div>
              </div>
              {publication ? (
                <div className="mt-3 rounded-md border border-border bg-background px-3 py-2 text-sm" data-testid="published">
                  Published, commit <span className="font-mono">{shortSha(publication.commit_sha, 7)}</span> on {fmt(publication.published_at)}
                </div>
              ) : (
                <Button className="mt-4 w-full" onClick={publish} disabled={busy || !doors?.home.configured} data-testid="publish">
                  Publish to the home
                </Button>
              )}
              {doors && !doors.home.configured && !publication && (
                <p className="mt-2 text-xs text-muted-foreground">The publisher's credential is not seeded in this install; the export stays downloadable.</p>
              )}
              {publishError && <div className="mt-3"><Alert title="The publish failed">{publishError}. The capture is untouched; retry when the home answers.</Alert></div>}
            </div>
            <div className="mt-4 rounded-md border border-border bg-card p-4">
              <div className="text-sm font-medium">Toward the plan</div>
              <div className="mt-1 text-sm text-muted-foreground">Decisions and owners keyed by the plan item ids, verbatim.</div>
              <div className="mt-3 flex flex-col gap-1.5 font-mono text-xs">
                <div className="flex justify-between"><span className="text-muted-foreground">items</span><span className="tabular-nums">{items}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">unresolved</span><span className="tabular-nums">{unresolved.length}</span></div>
              </div>
              <a className="mt-4 inline-flex w-full items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent" href={api.planExportUrl(run.id)} download={`${run.id}-plan.json`} data-testid="download-plan">
                Download plan export
              </a>
            </div>
          </div>
        </div>
      </main>
    </Shell>
  );
}
