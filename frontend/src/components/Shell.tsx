import { useEffect, useState, type ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { api } from "../api/client";
import { Appearance } from "../rb/Appearance";

// The one mark: the lockup as live text (the RB tile and the words). Static markup, no user input.
const LOCKUP = "<div class=\"lockup\"><svg class=\"lockup-tile\" viewBox=\"0 0 120 120\" aria-hidden=\"true\"><rect x=\"6\" y=\"6\" width=\"108\" height=\"108\" rx=\"18\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"8\"/><text x=\"60\" y=\"77\" text-anchor=\"middle\" font-family=\"system-ui,-apple-system,Segoe UI,sans-serif\" font-size=\"48\" font-weight=\"800\" fill=\"currentColor\">RB</text></svg><span class=\"lockup-words\"><b>Software Engineering</b><i>RB</i></span></div>";

/** The persistent left rail: Shelf, Runs, Exports, Doors, a secondary section, and the renderer pin. */

export function Mark({ className = "w-32 h-auto" }: { className?: string }) {
  return <img src="/brand/logo-mark.svg" className={className} alt="RB" />;
}

export interface Counts {
  sessions: number;
  runs: number;
  exports: number;
}

export function useCounts(): Counts | null {
  const [counts, setCounts] = useState<Counts | null>(null);
  useEffect(() => {
    let live = true;
    Promise.all([api.listSessions(), api.listRuns(), api.listPublications()])
      .then(([s, r, p]) => live && setCounts({ sessions: s.length, runs: r.length, exports: p.length }))
      .catch(() => live && setCounts({ sessions: 0, runs: 0, exports: 0 }));
    return () => {
      live = false;
    };
  }, []);
  return counts;
}

export function Shell({ children, section, header, active }: { children: ReactNode; section?: ReactNode; header: ReactNode; active: "shelf" | "runs" | "exports" | "doors" }) {
  const counts = useCounts();
  const [pin, setPin] = useState<string>("");
  useEffect(() => {
    api.doors().then((d) => setPin(d.renderer.pin)).catch(() => setPin(""));
  }, []);
  const item = (to: string, label: string, id: string, count?: number) => (
    <NavLink
      to={to}
      end={to === "/"}
      className={() =>
        `flex items-center justify-between rounded-md px-3 py-2 ${active === id ? "bg-accent font-medium text-accent-foreground" : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"}`
      }
    >
      {label}
      {count !== undefined && <span className="text-xs tabular-nums">{count}</span>}
    </NavLink>
  );
  return (
    <div className="app-ground flex min-h-screen text-foreground">
      <aside className="app-glass flex w-60 shrink-0 flex-col border-r border-border" aria-label="Rail">
        <div className="px-5 py-5">
          <div className="rb-lockup" role="img" aria-label="Software Engineering, RB" dangerouslySetInnerHTML={{ __html: LOCKUP }} />
          <div className="mt-4 font-semibold tracking-tight">Workshops</div>
        </div>
        <nav className="flex flex-col gap-0.5 px-3 text-sm" aria-label="Destinations">
          {item("/", "Shelf", "shelf", counts?.sessions)}
          {item("/runs", "Runs", "runs", counts?.runs)}
          {item("/exports", "Exports", "exports", counts?.exports)}
          {item("/doors", "Doors", "doors")}
        </nav>
        {section && <div className="mt-6 px-3">{section}</div>}
        <div className="mt-auto border-t border-border px-5 py-4">
          <div className="text-xs text-muted-foreground">Renderer</div>
          <div className="mt-0.5 font-mono text-xs" data-testid="renderer-pin">
            {pin ? `bootstrap-workshop ${pin.replace("sha256:", "").slice(0, 12)}` : " "}
          </div>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="app-header flex flex-wrap items-center gap-4 border-b border-border px-8 py-4">{header}<Appearance /></header>
        {children}
      </div>
    </div>
  );
}
