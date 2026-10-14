import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api/client";
import { Shell } from "../components/Shell";
import { Button, Crumbs, Loading, ShelfChip, Tabs, fmt, shortSha } from "../components/ui";
import type { Publication, RevisionSummary, Run, Session } from "../types";

/** Revisions, Runs and Exports are instances of the shelf ledger: the same table chrome, row opens the thing, differing in columns. */

export function SessionRevisions() {
  const { id = "" } = useParams();
  const [session, setSession] = useState<Session | null>(null);
  const [rows, setRows] = useState<RevisionSummary[] | null>(null);
  useEffect(() => {
    api.getSession(id).then(setSession);
    api.listRevisions(id).then(setRows);
  }, [id]);
  return (
    <Shell
      active="shelf"
      header={
        <>
          <Crumbs items={[{ label: "Shelf", to: "/" }, { label: session?.title || "", to: `/sessions/${id}` }, { label: "Revisions" }]} />
          <Tabs current="revisions" tabs={[{ id: "author", label: "Author", to: `/sessions/${id}` }, { id: "revisions", label: "Revisions", to: `/sessions/${id}/revisions` }, { id: "runs", label: "Runs", to: `/sessions/${id}/runs` }]} />
        </>
      }
    >
      <main className="flex-1 px-8 py-6">
        <div className="flex items-end justify-between">
          <div>
            <h1 className="display text-2xl font-bold tracking-tight">{session?.title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{rows ? `${rows.length} revisions kept, none discarded. Every one is retrievable and runnable.` : ""}</p>
          </div>
        </div>
        <div className="mt-6 overflow-hidden rounded-md border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted text-left text-muted-foreground">
                <th className="px-4 py-2.5 font-medium">Rev</th>
                <th className="px-4 py-2.5 font-medium">Written</th>
                <th className="px-4 py-2.5 font-medium">By</th>
                <th className="px-4 py-2.5 font-medium">Door</th>
                <th className="px-4 py-2.5 font-medium">Change</th>
                <th className="px-4 py-2.5 font-medium">Shelf</th>
                <th className="px-4 py-2.5 font-medium"></th>
              </tr>
            </thead>
            {rows === null ? (
              <Loading columns={7} />
            ) : (
              <tbody data-testid="revisions">
                {rows.map((r, i) => (
                  <tr key={r.number} className={`border-b border-border last:border-b-0 ${i === 0 ? "bg-accent" : "bg-card"}`}>
                    <td className={`px-4 py-3 font-mono tabular-nums ${i === 0 ? "font-semibold" : ""}`}>{r.number}</td>
                    <td className="px-4 py-3 font-mono tabular-nums">{fmt(r.created_at)}</td>
                    <td className="px-4 py-3">{r.author}</td>
                    <td className="px-4 py-3"><span className="rounded border border-border px-2 py-0.5 font-mono text-xs uppercase">{r.door}</span></td>
                    <td className="px-4 py-3">{r.note}</td>
                    <td className="px-4 py-3">{i === 0 && session ? <ShelfChip state={session.shelf_state} /> : <span className="text-muted-foreground" />}</td>
                    <td className="px-4 py-3 text-right">
                      <Link className="inline-flex items-center rounded-md px-3 py-1 text-sm font-medium hover:bg-background" to={`/sessions/${id}?revision=${r.number}`}>Open</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            )}
          </table>
        </div>
        <div className="mt-4 flex gap-3 rounded-md border border-border bg-card p-4 text-card-foreground">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true"><circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" /></svg>
          <div className="text-sm">
            <div className="font-medium">The store is append only</div>
            <div className="text-muted-foreground">Publishing writes an export to the git-backed home. It does not rewrite a revision here.</div>
          </div>
        </div>
      </main>
    </Shell>
  );
}

function RunsTable({ rows, sessions }: { rows: Run[] | null; sessions: Record<string, Session> }) {
  return (
    <div className="mt-6 overflow-hidden rounded-md border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted text-left text-muted-foreground">
            <th className="px-4 py-2.5 font-medium">Session</th>
            <th className="px-4 py-2.5 font-medium">Kind</th>
            <th className="px-4 py-2.5 font-medium">Rev</th>
            <th className="px-4 py-2.5 font-medium">Started</th>
            <th className="px-4 py-2.5 font-medium">Capture</th>
            <th className="px-4 py-2.5 font-medium">State</th>
          </tr>
        </thead>
        {rows === null ? (
          <Loading columns={6} />
        ) : (
          <tbody data-testid="runs">
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-border bg-card last:border-b-0">
                <td className="px-4 py-3">
                  <Link className="font-medium hover:underline" to={r.state === "closed" ? `/runs/${r.id}/capture` : `/runs/${r.id}`} data-testid="run-link">
                    {sessions[r.session_id]?.title || r.session_id}
                  </Link>
                  <div className="font-mono text-xs text-muted-foreground">{r.id}</div>
                </td>
                <td className="px-4 py-3">{r.kind}</td>
                <td className="px-4 py-3 font-mono tabular-nums">{r.revision}</td>
                <td className="px-4 py-3 font-mono tabular-nums">{fmt(r.started_at)}</td>
                <td className="px-4 py-3 tabular-nums">{Object.keys(r.capture || {}).length} recorded</td>
                <td className="px-4 py-3">{r.state}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr className="bg-card"><td className="px-4 py-6 text-center text-muted-foreground" colSpan={6}>No run yet. Rehearse a session from its author screen.</td></tr>
            )}
          </tbody>
        )}
      </table>
    </div>
  );
}

export function Runs() {
  const [rows, setRows] = useState<Run[] | null>(null);
  const [sessions, setSessions] = useState<Record<string, Session>>({});
  useEffect(() => {
    api.listRuns().then(setRows);
    api.listSessions().then((ss) => setSessions(Object.fromEntries(ss.map((s) => [s.id, s]))));
  }, []);
  return (
    <Shell active="runs" header={<Crumbs items={[{ label: "rb-workshops", to: "/" }, { label: "Runs" }]} />}>
      <main className="flex-1 px-8 py-6">
        <h1 className="display text-2xl font-bold tracking-tight">Runs</h1>
        <p className="mt-1 text-sm text-muted-foreground">Every rehearsal and session, each with its own capture and its own export.</p>
        <RunsTable rows={rows} sessions={sessions} />
      </main>
    </Shell>
  );
}

export function SessionRuns() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);
  const [rows, setRows] = useState<Run[] | null>(null);
  useEffect(() => {
    api.getSession(id).then(setSession);
    api.listRuns(id).then(setRows);
  }, [id]);
  const start = async (kind: "rehearsal" | "session") => {
    const run = await api.startRun(id, kind);
    navigate(`/runs/${run.id}`);
  };
  return (
    <Shell
      active="shelf"
      header={
        <>
          <Crumbs items={[{ label: "Shelf", to: "/" }, { label: session?.title || "", to: `/sessions/${id}` }, { label: "Runs" }]} />
          <Tabs current="runs" tabs={[{ id: "author", label: "Author", to: `/sessions/${id}` }, { id: "revisions", label: "Revisions", to: `/sessions/${id}/revisions` }, { id: "runs", label: "Runs", to: `/sessions/${id}/runs` }]} />
          <div className="flex gap-2">
            <Button onClick={() => start("rehearsal")} data-testid="start-rehearsal">Rehearse</Button>
            <Button variant="primary" onClick={() => start("session")} data-testid="start-session">Run the session</Button>
          </div>
        </>
      }
    >
      <main className="flex-1 px-8 py-6">
        <h1 className="display text-2xl font-bold tracking-tight">{session?.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">A rehearsal is thrown away without touching the session that follows it.</p>
        <RunsTable rows={rows} sessions={session ? { [session.id]: session } : {}} />
      </main>
    </Shell>
  );
}

export function Exports() {
  const [rows, setRows] = useState<Publication[] | null>(null);
  const [sessions, setSessions] = useState<Record<string, Session>>({});
  useEffect(() => {
    api.listPublications().then(setRows);
    api.listSessions().then((ss) => setSessions(Object.fromEntries(ss.map((s) => [s.id, s]))));
  }, []);
  return (
    <Shell active="exports" header={<Crumbs items={[{ label: "rb-workshops", to: "/" }, { label: "Exports" }]} />}>
      <main className="flex-1 px-8 py-6">
        <h1 className="display text-2xl font-bold tracking-tight">Exports</h1>
        <p className="mt-1 text-sm text-muted-foreground">The artifacts already published to the git-backed home, across all sessions.</p>
        <div className="mt-6 overflow-hidden rounded-md border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted text-left text-muted-foreground">
                <th className="px-4 py-2.5 font-medium">Session</th>
                <th className="px-4 py-2.5 font-medium">Rev</th>
                <th className="px-4 py-2.5 font-medium">Renderer</th>
                <th className="px-4 py-2.5 font-medium">Checksum</th>
                <th className="px-4 py-2.5 font-medium">Published path</th>
                <th className="px-4 py-2.5 font-medium">Published</th>
              </tr>
            </thead>
            {rows === null ? (
              <Loading columns={6} />
            ) : (
              <tbody data-testid="exports">
                {rows.map((p) => (
                  <tr key={p.id} className="border-b border-border bg-card last:border-b-0">
                    <td className="px-4 py-3"><Link className="font-medium hover:underline" to={`/sessions/${p.session_id}`}>{sessions[p.session_id]?.title || p.session_id}</Link></td>
                    <td className="px-4 py-3 font-mono tabular-nums">{p.revision}</td>
                    <td className="px-4 py-3 font-mono text-xs">{shortSha(p.renderer)}</td>
                    <td className="px-4 py-3 font-mono text-xs">{shortSha(p.sha256)}</td>
                    <td className="px-4 py-3 font-mono text-xs">{p.ref}:{p.path}</td>
                    <td className="px-4 py-3 font-mono tabular-nums">{fmt(p.published_at)}</td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr className="bg-card"><td className="px-4 py-6 text-center text-muted-foreground" colSpan={6}>Nothing published yet. A capture reaches here by being published from its run.</td></tr>
                )}
              </tbody>
            )}
          </table>
        </div>
      </main>
    </Shell>
  );
}
