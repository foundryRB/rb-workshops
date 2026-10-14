import { useEffect, useState } from "react";
import { api } from "../api/client";
import { Shell } from "../components/Shell";
import { Button, Chip, Crumbs, shortSha } from "../components/ui";
import ports from "../api/ports.json";
import type { Doors as DoorsT } from "../types";

const UI_LABELS: Record<string, string> = {
  CreateSession: "New session",
  ReviseSession: "Save revision",
  ReadSession: "Shelf, Revisions",
  StartRun: "Rehearse, Run",
  LandCapture: "Close the run",
  ReadRun: "Runs, Capture",
  ExportArtifact: "Download",
  ExportPlan: "Download plan export",
  PublishExport: "Publish to the home",
};

export default function Doors() {
  const [doors, setDoors] = useState<DoorsT | null>(null);
  const [credential, setCredential] = useState<{ connect: string; url: string; user: string } | null>(null);
  const [credentialError, setCredentialError] = useState<string | null>(null);
  useEffect(() => {
    api.doors().then(setDoors);
  }, []);
  const reveal = async () => {
    try {
      setCredential(await api.mcpCredential());
    } catch (e) {
      setCredentialError((e as Error).message);
    }
  };
  return (
    <Shell active="doors" header={<Crumbs items={[{ label: "vf-workshops", to: "/" }, { label: "Doors" }]} />}>
      <main className="flex-1 px-8 py-6">
        <div className="flex items-end justify-between">
          <div>
            <h1 className="display text-2xl font-bold tracking-tight">One inbound port set, three doors</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Every row is one inbound port on the core. A door that carried a capability the other two could not would show as a gap in its column.</p>
          </div>
          <Chip>No door-only capability</Chip>
        </div>
        <div className="mt-6 overflow-hidden rounded-md border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted text-left text-muted-foreground">
                <th className="px-4 py-2.5 font-medium">Inbound port</th>
                <th className="px-4 py-2.5 font-medium">UI</th>
                <th className="px-4 py-2.5 font-medium">API</th>
                <th className="px-4 py-2.5 font-medium">MCP</th>
              </tr>
            </thead>
            <tbody data-testid="ports">
              {(doors?.ports || Object.keys(ports).map((port) => ({ port, api: (ports as Record<string, string[]>)[port], mcp: [] }))).map((row) => (
                <tr key={row.port} className="border-b border-border bg-card last:border-b-0">
                  <td className="px-4 py-3 font-mono">{row.port}</td>
                  <td className="px-4 py-3">{UI_LABELS[row.port]}</td>
                  <td className="px-4 py-3 font-mono text-xs">{row.api.join(", ")}</td>
                  <td className="px-4 py-3 font-mono text-xs">{row.mcp.join(", ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-6 grid grid-cols-3 gap-6">
          <div className="rounded-md border border-border bg-card p-4">
            <div className="text-sm font-medium">Renderer</div>
            <div className="mt-1 text-sm text-muted-foreground">Consumed at a pin, never copied into this tree.</div>
            <div className="mt-3 flex flex-col gap-1.5 font-mono text-xs">
              <div className="flex justify-between"><span className="text-muted-foreground">template</span><span>bootstrap-workshop</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">pinned</span><span>{shortSha(doors?.renderer.pin)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">available</span><span data-testid="renderer-available">{doors ? (doors.renderer.available ? "yes" : "no") : ""}</span></div>
            </div>
          </div>
          <div className="rounded-md border border-border bg-card p-4">
            <div className="text-sm font-medium">Git-backed home</div>
            <div className="mt-1 text-sm text-muted-foreground">Publish writes here. The session store is never mutated by a publish.</div>
            <div className="mt-3 flex flex-col gap-1.5 font-mono text-xs">
              <div className="flex justify-between"><span className="text-muted-foreground">repository</span><span>{doors?.home.repository}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">ref</span><span>{doors?.home.ref}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">credential</span><span>{doors ? (doors.home.configured ? "seeded" : "not seeded") : ""}</span></div>
            </div>
          </div>
          <div className="rounded-md border border-border bg-card p-4">
            <div className="text-sm font-medium">Connect an agent</div>
            <div className="mt-1 text-sm text-muted-foreground">The MCP door takes the engine's own key; a signed-in person reads it here.</div>
            <div className="mt-3 flex flex-col gap-1.5 font-mono text-xs">
              <div className="flex justify-between"><span className="text-muted-foreground">path</span><span>/mcp</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">key</span><span>{doors ? (doors.mcp.configured ? "provisioned" : "not provisioned") : ""}</span></div>
            </div>
            {credential ? (
              <pre className="mt-3 overflow-auto rounded-md border border-border bg-background p-2 font-mono text-xs">{credential.connect}</pre>
            ) : (
              <Button className="mt-4 w-full" onClick={reveal} disabled={!doors?.mcp.configured}>Show the connect command</Button>
            )}
            {credentialError && <p className="mt-2 text-xs text-destructive">{credentialError}</p>}
          </div>
        </div>
      </main>
    </Shell>
  );
}
