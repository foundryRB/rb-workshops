import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import { Shell } from "../components/Shell";
import { Button, Crumbs, Loading, ShelfChip } from "../components/ui";
import type { Publication, Run, Session } from "../types";

export default function Shelf() {
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [pubs, setPubs] = useState<Publication[]>([]);
  const [filter, setFilter] = useState("");
  const [params, setParams] = useSearchParams();
  const state = params.get("state") || "";
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.listSessions().then(setSessions);
    api.listRuns().then(setRuns);
    api.listPublications().then(setPubs);
  }, []);

  const rows = useMemo(
    () => (sessions || []).filter((s) => (!state || s.shelf_state === state) && s.title.toLowerCase().includes(filter.toLowerCase())),
    [sessions, state, filter],
  );
  const counts = {
    published: (sessions || []).filter((s) => s.shelf_state === "published").length,
    draft: (sessions || []).filter((s) => s.shelf_state === "draft").length,
    ephemeral: (sessions || []).filter((s) => s.shelf_state === "ephemeral").length,
  };
  const revisions = (sessions || []).reduce((n, s) => n + s.current_revision, 0);
  const lastRun = (id: string) => {
    const r = runs.find((x) => x.session_id === id);
    return r ? `${r.kind === "session" ? "Session" : "Rehearsal"}, ${r.started_at.slice(0, 10)}` : "Never run";
  };

  const create = async () => {
    setBusy(true);
    try {
      const s = await api.createSession("Untitled session");
      navigate(`/sessions/${s.id}`);
    } finally {
      setBusy(false);
    }
  };

  const stateLink = (value: string, label: string, count: number) => (
    <button
      type="button"
      onClick={() => setParams(value ? { state: value } : {})}
      aria-pressed={state === value}
      className={`flex w-full items-center justify-between rounded-md px-3 py-1.5 text-sm ${state === value ? "bg-accent font-medium text-accent-foreground" : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"}`}
    >
      {label}
      <span className="text-xs tabular-nums">{count}</span>
    </button>
  );

  return (
    <Shell
      active="shelf"
      section={
        <>
          <div className="px-3 pb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Shelf state</div>
          <nav className="flex flex-col gap-0.5" aria-label="Shelf state">
            {stateLink("published", "Published", counts.published)}
            {stateLink("draft", "Draft", counts.draft)}
            {stateLink("ephemeral", "Ephemeral", counts.ephemeral)}
          </nav>
        </>
      }
      header={
        <>
          <Crumbs items={[{ label: "rb-workshops", to: "/" }, { label: "Shelf" }]} />
          <input aria-label="Filter sessions" placeholder="Filter sessions" value={filter} onChange={(e) => setFilter(e.target.value)} className={`ml-4 h-9 w-64 rounded-md border border-input bg-transparent px-3 py-1 text-sm placeholder:text-muted-foreground`} />
          <Button variant="primary" className="ml-auto" onClick={create} disabled={busy} data-testid="new-session">
            New session
          </Button>
        </>
      }
    >
      <main className="flex-1 px-8 py-6">
        {sessions && sessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
            <Button variant="primary" onClick={create} disabled={busy}>
              New session
            </Button>
            <p className="text-sm text-muted-foreground">A session is one typed working instrument: activities the room works, with the capture recorded on the surface.</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-4 gap-4">
              <Tile label="On the shelf" value={sessions?.length ?? 0} note={`${counts.published} published, ${counts.draft} draft, ${counts.ephemeral} ephemeral`} />
              <Tile label="Revisions kept" value={revisions} note="Append only, none discarded" />
              <Tile label="Runs recorded" value={runs.length} note={`${runs.filter((r) => r.kind === "rehearsal").length} rehearsal, ${runs.filter((r) => r.kind === "session").length} session`} />
              <Tile label="Exports published" value={pubs.length} note="Checksum matched the renderer" />
            </div>
            <div className="mt-6 overflow-hidden rounded-md border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted text-left text-muted-foreground">
                    <th className="px-4 py-2.5 font-medium">Session</th>
                    <th className="px-4 py-2.5 font-medium">State</th>
                    <th className="px-4 py-2.5 font-medium">Rev</th>
                    <th className="px-4 py-2.5 font-medium">Updated</th>
                    <th className="px-4 py-2.5 font-medium">Last run</th>
                  </tr>
                </thead>
                {sessions === null ? (
                  <Loading columns={5} />
                ) : (
                  <tbody>
                    {rows.map((s) => (
                      <tr key={s.id} className="border-b border-border bg-card last:border-b-0">
                        <td className="px-4 py-3">
                          <Link to={`/sessions/${s.id}`} className="font-medium hover:underline" data-testid="session-link">
                            {s.title}
                          </Link>
                          <div className="font-mono text-xs text-muted-foreground">{s.id}</div>
                        </td>
                        <td className="px-4 py-3">
                          <ShelfChip state={s.shelf_state} />
                        </td>
                        <td className="px-4 py-3 font-mono tabular-nums">{s.current_revision}</td>
                        <td className="px-4 py-3 font-mono tabular-nums text-muted-foreground">{s.updated_at.slice(0, 10)}</td>
                        <td className="px-4 py-3 text-muted-foreground">{lastRun(s.id)}</td>
                      </tr>
                    ))}
                  </tbody>
                )}
              </table>
            </div>
          </>
        )}
      </main>
    </Shell>
  );
}

function Tile({ label, value, note }: { label: string; value: number; note: string }) {
  return (
    <div className="rounded-md border border-border bg-card p-4">
      <div className="text-sm font-medium text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{note}</div>
    </div>
  );
}
