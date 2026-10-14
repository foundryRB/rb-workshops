import { expect } from "@playwright/test";
import { intent } from "@psa-department-of-engineering/playwright-intent";

/** INT-WORKSHOPS-025: unauthenticated traffic is refused on every human surface, and the MCP door refuses a bare request. */
intent("INT-WORKSHOPS-025", "the deployed engine refuses the unauthenticated on every human surface and the credential-less on the machine door", async ({ request, baseURL }) => {
  for (const path of ["/", "/sessions/anything", "/runs", "/doors"]) {
    const r = await request.get(`${baseURL}${path}`, { maxRedirects: 0 });
    expect([302, 401, 403], `${path} answered ${r.status()}`).toContain(r.status());
    expect(await r.text()).not.toContain('id="root"');
  }
  // The API door behind the proxy: a machine answer, never the shelf's data.
  const api = await request.get(`${baseURL}/api/sessions`, { maxRedirects: 0 });
  expect([302, 401, 403]).toContain(api.status());
  // The machine door keeps its own gate: 401 with the key provisioned, 503 before it.
  const mcp = await request.post(`${baseURL}/mcp/`, {
    headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
    data: { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "smoke", version: "0" } } },
    maxRedirects: 0,
  });
  expect([401, 503]).toContain(mcp.status());
  expect(mcp.status()).not.toBe(200);
});
