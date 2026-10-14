/**
 * The two reference tables that mirror a source of truth, held to it (INT-WORKSHOPS-DOCS-001, -002).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect } from "vitest";
import { intent } from "@psa-department-of-engineering/vitest-intent";

const REPO = join(process.cwd(), "..");
const DOCS = join(process.cwd(), "src", "content", "docs");

function tableRows(markdown: string, heading: string): string[][] {
  const section = markdown.split(`## ${heading}`)[1]?.split("\n## ")[0] ?? "";
  return section
    .split("\n")
    .filter((l) => l.startsWith("|") && !/^\|\s*-/.test(l))
    .slice(1)
    .map((l) => l.split("|").slice(1, -1).map((c) => c.trim()));
}

const codes = (cell: string) => Array.from(cell.matchAll(/`([^`]+)`/g)).map((m) => m[1]);

intent("INT-WORKSHOPS-DOCS-001", "the doors page states exactly the ports, routes and tools the adapters declare", () => {
  const page = readFileSync(join(DOCS, "reference", "doors.md"), "utf8");
  const rows = tableRows(page, "The port set");
  const uiPorts = JSON.parse(readFileSync(join(REPO, "frontend", "src", "api", "ports.json"), "utf8")) as Record<string, string[]>;
  const routesSource = readFileSync(join(REPO, "backend", "adapters", "api", "routes.py"), "utf8");
  const mcpSource = readFileSync(join(REPO, "backend", "adapters", "mcp", "server.py"), "utf8");
  const declared = (source: string, name: string): Record<string, string[]> => {
    const block = source.split(`${name}: dict[str, list[str]] = {`)[1].split("\n}")[0];
    const out: Record<string, string[]> = {};
    for (const m of block.matchAll(/"([A-Za-z]+)":\s*\[([^\]]*)\]/gs)) {
      out[m[1]] = Array.from(m[2].matchAll(/"([^"]+)"/g)).map((x) => x[1]);
    }
    return out;
  };
  const apiPorts = declared(routesSource, "PORT_ROUTES");
  const mcpPorts = declared(mcpSource, "PORT_TOOLS");
  expect(rows.map((r) => r[0])).toEqual(Object.keys(apiPorts));
  expect(Object.keys(uiPorts).sort()).toEqual(Object.keys(apiPorts).sort());
  for (const [port, , api, mcp] of rows) {
    expect(codes(api).sort(), `${port}: API routes`).toEqual([...apiPorts[port]].sort());
    expect(codes(mcp).sort(), `${port}: MCP tools`).toEqual([...mcpPorts[port]].sort());
  }
});

intent("INT-WORKSHOPS-DOCS-002", "the configuration page names every documented environment key and no other", () => {
  const page = readFileSync(join(DOCS, "reference", "configuration.md"), "utf8");
  const documented = new Set(
    readFileSync(join(REPO, ".env.example"), "utf8")
      .split("\n")
      .filter((l) => /^[A-Z_]+=/.test(l))
      .map((l) => l.split("=")[0]),
  );
  const listed = new Set(tableRows(page, "Keys").flatMap((r) => codes(r[0])));
  expect([...listed].sort()).toEqual([...documented].sort());
});
