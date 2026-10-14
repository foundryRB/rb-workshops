---
title: Deploy
id: DOC-GUIDE-DEPLOY-001
type: Guide
status: Active
updated: '2026-09-29'
summary: How a release reaches the install - the shared CI, the deploy branch, the grants the chart consumes, the two out-of-band secrets, and the smoke Job.
---

The engine deploys like every app on the Foundry: the shared CI releases three images (`rb-workshops-app`, `rb-workshops-smoke`, `rb-workshops-docs`) and the chart on every push to `main`; ArgoCD reconciles the install's `deploy-<install>` branch, where Image Updater advances the image tags; the chart pin on that branch is bumped by hand.

## When to use

Onboarding the engine on an install, wiring a granted capability, or seeding one of the two out-of-band secrets.

## Steps

1. Onboard the app, then the database and the identity realm, through the platform studio; each ships as a pull request the platform's CI merges. The chart names the grants' Secrets, `pg-app-rb-workshops` and `keycloak-rb-workshops`, and consumes neither optionally.
2. On the deploy branch's entry environment, set `host`, `auth.oidc.issuer`, `auth.oidc.enabled`, `database.enabled`, `database.user` (the grant's owner role), `renderer.url` (the playbook-studio door's public MCP URL) and `smoke.enabled`, and pin the released chart version in the environment's `Chart.yaml`, both `version` and the dependency's version. Image Updater moves image tags and never the chart pin.
3. Seed the publisher's credential: a fine-grained PAT with `contents: write` on the home repository alone, applied from `k8s/secrets/rb-workshops-githome.env` with the platform's `seed/apply-secrets.sh`. Until it exists the publish button is disabled and the export stays downloadable; the engine reads the mounted file at each publish, so a credential seeded after the pod started is picked up without a restart.
4. Seed the renderer's source credential: the playbook-studio door's Basic credential, applied from `k8s/secrets/rb-workshops-renderer-source.env`. Until it exists the doors page and the health route report the renderer unavailable, and exports and runs answer 503; the engine re-tries the source once a minute and at the next render, so the credential is picked up without a restart.
5. Let the sync run: the chart mints the machine door's key in the namespace, the app comes up behind its oauth2-proxy sidecar, and the PostSync smoke Job provisions the realm-local test user, runs the deployed suite against the public hostname, and publishes `smoke-result`, which the platform's reporter serves at `https://docs.<zone>/smoke/rb-workshops.json`.
6. Register the realm's callback with each broker the install declares, in that broker's console; the realm's own users sign in without it.

## Verify

- The studio's `app_status` reads synced, healthy, probe ok and smoke ok on the promoted tag.
- `GET https://<host>/api/health` answers `status: ok`, the build stamp of the promoted image, and `renderer_available: true` once the source credential is seeded.
- An agent connects to `/mcp` with the key the doors page shows a signed-in person.

## Read next

- [Configuration](../../reference/configuration/) - every value the engine reads.
