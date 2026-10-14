#!/usr/bin/env node
/**
 * The in-cluster smoke runner (ADR-008, platform ADR-047): the PostSync hook Job's entrypoint.
 *
 * 1. Provision the realm-local test user, status-gated and idempotent (ASM-P10): read the
 *    realm-admin password from Secret keycloak-vf-workshops (key realmAdminPassword), log in
 *    through the realm's admin-cli client, create the user if absent, mint its password into
 *    Secret vf-workshops-smoke (create-if-absent, never rotating a live value).
 * 2. Run the deployed Playwright suite against the public hostname.
 * 3. Publish the verdict as ConfigMap smoke-result (label foundry.dev/smoke-result: "true",
 *    data key result.json). Nothing else leaves this pod.
 */
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Node reads NODE_EXTRA_CA_CERTS at start, never later: the cluster's CA must be in the
// environment before this process exists, or every call to the API server fails TLS and the
// verdict is never published. The chart sets it; when it is absent, re-run under it.
const CA_FILE = "/var/run/secrets/kubernetes.io/serviceaccount/ca.crt";
if (!process.env.NODE_EXTRA_CA_CERTS && existsSync(CA_FILE)) {
  const again = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], {
    stdio: "inherit",
    env: { ...process.env, NODE_EXTRA_CA_CERTS: CA_FILE },
  });
  process.exit(again.status ?? 1);
}

const NS = process.env.SMOKE_NAMESPACE || "vf-workshops";
const TARGET = process.env.SMOKE_TARGET || "https://vf-workshops.vodafone-foundry.com";
const ISSUER = process.env.SMOKE_ISSUER || "https://keycloak.vodafone-foundry.com/realms/vf-workshops";
const ISSUER_FALLBACK = process.env.SMOKE_ISSUER_FALLBACK || "";
const REALM = ISSUER.split("/realms/")[1];
const ADMIN_USER = process.env.SMOKE_REALM_ADMIN || `${REALM}-admin`;
const ADMIN_SECRET = process.env.SMOKE_REALM_ADMIN_SECRET || `keycloak-${REALM}`;
const USER_SECRET = process.env.SMOKE_USER_SECRET || `${REALM}-smoke`;
const TEST_USER = process.env.SMOKE_TEST_USER || `${REALM}-smoke`;
const TAG = process.env.SMOKE_TAG || "unknown";
// The docs portal is the install's own: docs.<zone>, the zone being the target host's, unless the chart names one.
const ZONE = new URL(TARGET).hostname.split(".").slice(1).join(".");
process.env.SMOKE_DOCS = process.env.SMOKE_DOCS || `https://docs.${ZONE}`;

const SA = "/var/run/secrets/kubernetes.io/serviceaccount";
const K8S = `https://${process.env.KUBERNETES_SERVICE_HOST}:${process.env.KUBERNETES_SERVICE_PORT || 443}`;
const token = existsSync(`${SA}/token`) ? readFileSync(`${SA}/token`, "utf8").trim() : "";

async function k8s(method, path, body) {
  const res = await fetch(`${K8S}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": method === "PATCH" ? "application/merge-patch+json" : "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

const b64 = (s) => Buffer.from(s, "utf8").toString("base64");
const unb64 = (s) => Buffer.from(s, "base64").toString("utf8");

async function readSecret(name) {
  const r = await k8s("GET", `/api/v1/namespaces/${NS}/secrets/${name}`);
  if (r.status === 404) return null;
  if (r.status !== 200) throw new Error(`reading Secret ${name} answered ${r.status}: ${JSON.stringify(r.body)}`);
  return Object.fromEntries(Object.entries(r.body.data || {}).map(([k, v]) => [k, unb64(v)]));
}

async function readJson(res, what) {
  // A realm answer is JSON or it is not the realm: a proxy's HTML login page, an edge 302, a
  // WAF block. Name the door and the status rather than failing on the first "<".
  const text = await res.text();
  const type = res.headers.get("content-type") || "";
  if (!type.includes("json")) throw new Error(`${what} answered ${res.status} ${type || "(no content type)"}: ${text.slice(0, 120)}`);
  return JSON.parse(text);
}

async function adminToken(realmAdminPassword) {
  // The admin API is reached on the same base the token was minted on, so the issuer and the
  // audience always agree; the in-cluster address is tried first because an install's public
  // hostname commonly exposes the login pages and blocks /admin at its edge (this one does).
  const form = new URLSearchParams({ client_id: "admin-cli", grant_type: "password", username: ADMIN_USER, password: realmAdminPassword });
  const errors = [];
  for (const issuer of [ISSUER_FALLBACK, ISSUER].filter(Boolean)) {
    const base = issuer.replace(/\/realms\/.*$/, "");
    try {
      const res = await fetch(`${issuer}/protocol/openid-connect/token`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: form });
      if (!res.ok) {
        errors.push(`token endpoint at ${issuer} answered ${res.status}`);
        continue;
      }
      const token = (await readJson(res, `the token endpoint at ${issuer}`)).access_token;
      const probe = await fetch(`${base}/admin/realms/${REALM}/users/count`, { headers: { Authorization: `Bearer ${token}` }, redirect: "manual" });
      if (!probe.ok) {
        errors.push(`admin API at ${base} answered ${probe.status} ${probe.headers.get("content-type") || ""}`);
        continue;
      }
      await readJson(probe, `the admin API at ${base}`);
      console.log(`realm admin reached at ${base}`);
      return { token, base };
    } catch (e) {
      errors.push(`${issuer}: ${e.message}`);
    }
  }
  throw new Error(`could not reach the realm's admin API: ${errors.join("; ")}`);
}

async function provisionUser() {
  const admin = await readSecret(ADMIN_SECRET);
  if (!admin || !admin.realmAdminPassword) throw new Error(`Secret ${ADMIN_SECRET} carries no realmAdminPassword yet (the realm grant has not converged)`);
  const { token: at, base } = await adminToken(admin.realmAdminPassword);
  const headers = { Authorization: `Bearer ${at}`, "Content-Type": "application/json" };
  const admin_url = `${base}/admin/realms/${REALM}`;
  let smoke = await readSecret(USER_SECRET);
  let password = smoke?.password;
  if (!password) {
    password = randomBytes(24).toString("hex");
    const created = await k8s("POST", `/api/v1/namespaces/${NS}/secrets`, {
      apiVersion: "v1", kind: "Secret", type: "Opaque",
      metadata: { name: USER_SECRET, namespace: NS, labels: { "app.kubernetes.io/part-of": REALM } },
      data: { username: b64(TEST_USER), password: b64(password) },
    });
    if (created.status === 409) {
      smoke = await readSecret(USER_SECRET);
      password = smoke.password;
    } else if (created.status >= 300) {
      throw new Error(`creating Secret ${USER_SECRET} answered ${created.status}: ${JSON.stringify(created.body)}`);
    } else {
      console.log(`minted ${USER_SECRET}`);
    }
  }
  const found = await readJson(await fetch(`${admin_url}/users?username=${encodeURIComponent(TEST_USER)}&exact=true`, { headers }), "the realm's user lookup");
  let userId = Array.isArray(found) && found[0]?.id;
  if (!userId) {
    const res = await fetch(`${admin_url}/users`, {
      method: "POST", headers,
      body: JSON.stringify({ username: TEST_USER, enabled: true, emailVerified: true, email: `${TEST_USER}@${REALM}.invalid`, firstName: REALM, lastName: "smoke",
        credentials: [{ type: "password", value: password, temporary: false }] }),
    });
    if (res.status !== 201) throw new Error(`creating the realm user answered ${res.status}: ${await res.text()}`);
    console.log(`created realm user ${TEST_USER}`);
    const again = await readJson(await fetch(`${admin_url}/users?username=${encodeURIComponent(TEST_USER)}&exact=true`, { headers }), "the realm's user lookup");
    userId = again[0].id;
  }
  return { user: TEST_USER, password };
}

async function publish(result) {
  const cm = {
    apiVersion: "v1", kind: "ConfigMap",
    metadata: { name: "smoke-result", namespace: NS, labels: { "foundry.dev/smoke-result": "true" } },
    data: { "result.json": JSON.stringify(result) },
  };
  const existing = await k8s("GET", `/api/v1/namespaces/${NS}/configmaps/smoke-result`);
  const r = existing.status === 200
    ? await k8s("PATCH", `/api/v1/namespaces/${NS}/configmaps/smoke-result`, { data: cm.data, metadata: { labels: cm.metadata.labels } })
    : await k8s("POST", `/api/v1/namespaces/${NS}/configmaps`, cm);
  if (r.status >= 300) throw new Error(`publishing smoke-result answered ${r.status}: ${JSON.stringify(r.body)}`);
  console.log(`published smoke-result: ${result.status} (${result.failed} of ${result.total} failed)`);
}

function runSuite(user, password) {
  const res = spawnSync("npx", ["playwright", "test", "--config", "playwright.deployed.config.ts"], {
    stdio: "inherit",
    env: { ...process.env, SMOKE_TARGET: TARGET, SMOKE_USER: user, SMOKE_PASSWORD: password, CI: "1" },
  });
  let total = 0, failed = 0;
  try {
    const report = JSON.parse(readFileSync("results/deployed.json", "utf8"));
    const walk = (suites) => {
      for (const s of suites || []) {
        for (const spec of s.specs || []) {
          total += 1;
          if (!spec.ok) failed += 1;
        }
        walk(s.suites);
      }
    };
    walk(report.suites);
  } catch (e) {
    console.error(`no report: ${e.message}`);
  }
  return { code: res.status ?? 1, total, failed };
}

const finished = () => new Date().toISOString();
let result;
try {
  const { user, password } = await provisionUser();
  const { code, total, failed } = runSuite(user, password);
  result = { status: code === 0 && failed === 0 ? "passed" : "failed", tag: TAG, target: TARGET, total, failed, finished_at: finished() };
} catch (e) {
  console.error(e.message);
  result = { status: "failed", tag: TAG, target: TARGET, total: 0, failed: 0, error: e.message, finished_at: finished() };
}
console.log(`verdict: ${JSON.stringify(result)}`);
try {
  await publish(result);
} catch (e) {
  console.error(`the verdict could not be published: ${e.message}`);
  process.exit(1);
}
process.exit(result.status === "passed" ? 0 : 1);
