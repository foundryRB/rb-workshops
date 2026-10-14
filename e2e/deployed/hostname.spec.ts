import { expect, test } from "@playwright/test";
import { intent } from "@psa-department-of-engineering/playwright-intent";

const zone = new URL(process.env.SMOKE_TARGET || "https://rb-workshops.example").hostname.split(".").slice(1).join(".");
const docsHost = process.env.SMOKE_DOCS || `https://docs.${zone}`;

/** INT-WORKSHOPS-002: installed on the Foundry under the slug rb-workshops: the hostname answers, the docs mount. */
intent("INT-WORKSHOPS-002", "the browser surface answers at the app's hostname and its docs serve under /apps/rb-workshops", async ({ request, baseURL }) => {
  const app = await request.get(`${baseURL}/`, { maxRedirects: 0 });
  // A gated app answers past its auth proxy: a 302 to the realm, or a 200 for a session that holds.
  expect([200, 302, 401]).toContain(app.status());
  if (app.status() === 302) expect(app.headers()["location"]).toMatch(/keycloak.*\/realms\/rb-workshops\//);
  const health = await request.get(`${baseURL}/api/health`);
  expect(health.ok()).toBeTruthy();
  const body = await health.json();
  expect(body.status).toBe("ok");
  expect(body.database).toBe("postgresql");
  test.info().annotations.push({ type: "build", description: String(body.build) });
  const docs = await request.get(`${docsHost}/apps/rb-workshops/`);
  expect(docs.status()).toBe(200);
  expect(await docs.text()).toMatch(/rb-workshops|RB Workshops/);
});
