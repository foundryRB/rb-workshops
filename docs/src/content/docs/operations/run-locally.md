---
title: Run locally
id: DOC-GUIDE-RUN-LOCALLY-001
type: Guide
status: Active
updated: '2026-09-29'
summary: Run the engine on a workstation, with or without Docker, and run every suite.
---

A local run needs a PostgreSQL, the backend serving the built document from `app/`, and the renderer's bytes from one of the configured sources. The gate is turned off locally.

## When to use

Developing the engine, running the suites before a push, or reviewing a change in the real app.

## Steps

1. With Docker: `docker compose -f devops/docker-compose.yml up --build` serves the engine at http://localhost:8080 with a PostgreSQL beside it. Export `WORKSHOPS_RENDERER_URL`, `WORKSHOPS_RENDERER_USER` and `WORKSHOPS_RENDERER_PASSWORD` first so the engine fetches the pinned template from the playbook-studio door; without them exports and runs answer 503.
2. Without Docker: `pip install -e ".[test]"`, export `DATABASE_URL`, `WORKSHOPS_AUTH_DISABLED=true` and `WORKSHOPS_RENDERER_FILE` (a local copy of the template whose sha256 matches `renderer.lock`), then `python -m backend.run`.
3. For frontend work: `cd frontend && npm ci && npm run dev` serves the SPA at http://localhost:5173, proxying `/api` and `/mcp` to the backend. `npm run build` writes the served document into `app/`; commit it with the source.
4. Run the suites: `pytest tests` (needs `DATABASE_URL`; the store-backed tests never skip), `cd frontend && npm test`, `cd e2e && npm ci && npx playwright test`, `cd docs && npm ci && npm test`, and `csd-intent .` for the intent audit.

## Verify

- `GET http://localhost:8000/api/health` answers `status: ok` with `renderer_available: true`.
- The shelf opens, a session saves a revision, a rehearsal opens the console with the cover inside the Stage.

## Read next

- [Deploy](../deploy/) - how the engine reaches the install.
