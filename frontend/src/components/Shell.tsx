import { useEffect, useState, type ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { api } from "../api/client";
import { Appearance } from "../vodafone/Appearance";

// The one mark: the lockup as live text (speechmark, words, flag). Static markup, no user input.
const LOCKUP = "<div class=\"lockup\"><svg class=\"lockup-tile\" viewBox=\"0 0 120 120\" aria-hidden=\"true\"><path fill=\"#E60000\" d=\"M113.415 33.2927C107.561 21.2195 97.6829 11.7073 85.2439 5.85366C74.2683 8.04878 65.8536 18.2927 65.8536 29.6341C65.8536 30 65.8536 30.3659 65.8536 30.7317C84.1463 35.122 92.561 46.0976 92.561 61.4634C92.561 76.8293 80.4878 93.2927 60.3658 93.2927C43.9024 93.2927 26.7073 79.3902 26.7073 56.7073C26.7073 41.7073 34.7561 27.439 45 19.0244C54.878 10.6098 68.7805 5.4878 81.2195 5.4878C82.6829 5.4878 84.5122 5.4878 85.6097 5.85366C77.9268 2.19512 69.1463 0 60 0C46.0975 0 33.2927 4.7561 23.0488 12.8049C9.14634 23.7805 0 40.6098 0 60C0 92.9268 26.7073 120 60 120C93.2927 120 120 93.2927 120 60C119.634 50.122 117.439 41.3415 113.415 33.2927Z\"/><path fill=\"#FFFFFF\" d=\"M85.6097 5.4878C84.5121 5.12195 83.0487 5.12195 81.2195 5.12195C68.7805 5.12195 54.878 10.6098 45 18.6585C34.7561 27.0732 26.7073 41.7073 26.7073 56.3414C26.7073 79.0244 43.9024 92.9268 60.3658 92.9268C80.8536 92.9268 92.5609 76.0975 92.5609 61.0975C92.5609 45.7317 84.1463 34.7561 65.8536 30.3658C65.8536 30 65.8536 29.6341 65.8536 29.2683C65.8536 17.9268 74.6341 8.04878 85.6097 5.4878Z\"/></svg><span class=\"lockup-words\"><b>Digital Engineering</b><i>Vodafone Portugal</i></span><svg class=\"lockup-flag\" viewBox=\"0 0 28 19\" aria-hidden=\"true\"><defs><clipPath id=\"lockup-flag-clip\"><rect x=\"0\" y=\"0\" width=\"28\" height=\"19\" rx=\"3\"/></clipPath></defs><g clip-path=\"url(#lockup-flag-clip)\"><rect width=\"11.8\" height=\"19\" fill=\"#036A3A\"/><rect x=\"11.8\" width=\"16.2\" height=\"19\" fill=\"#DA020E\"/></g><g transform=\"translate(11.8,9.5)\"><circle r=\"5.7\" fill=\"#ffe14d\" fill-opacity=\"0.18\" stroke=\"#ffcf1f\" stroke-width=\"0.9\"/><ellipse rx=\"5.7\" ry=\"2.39\" fill=\"none\" stroke=\"#ffcf1f\" stroke-width=\"0.7\"/><ellipse rx=\"2.39\" ry=\"5.7\" fill=\"none\" stroke=\"#ffcf1f\" stroke-width=\"0.7\"/><rect x=\"-2.3\" y=\"-3.1\" width=\"4.6\" height=\"5.6\" rx=\"0.6\" fill=\"#DA020E\" stroke=\"#fff\" stroke-width=\"0.6\"/><rect x=\"-1.3\" y=\"-2\" width=\"2.6\" height=\"3.2\" rx=\"0.4\" fill=\"#fff\"/></g></svg></div>";

/** The persistent left rail: Shelf, Runs, Exports, Doors, a secondary section, and the renderer pin. */

export function Mark({ className = "w-32 h-auto" }: { className?: string }) {
  return <img src="/brand/logo-mark.svg" className={className} alt="Vodafone" />;
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
          <div className="vfd-lockup" role="img" aria-label="Digital Engineering, Vodafone Portugal" dangerouslySetInnerHTML={{ __html: LOCKUP }} />
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
