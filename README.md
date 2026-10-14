# rb-workshops

The workshops engine: typed working-session instruments (REF-Workshop), stored and versioned, authored and run in a browser with no agent, exported as the byte-identical standalone HTML the canonical `bootstrap-workshop` renderer produces, and published to a git-backed home. One application core behind one inbound port set, three doors over it: the UI, the HTTP API and the MCP door.

## Run with Docker

```bash
docker compose -f devops/docker-compose.yml up --build
```

The engine serves at http://localhost:8080 with the gate off and a PostgreSQL beside it. The renderer's bytes come from the playbook-studio door: export `WORKSHOPS_RENDERER_URL`, `WORKSHOPS_RENDERER_USER` and `WORKSHOPS_RENDERER_PASSWORD` first, or exports and runs answer 503 until they are set (the tree carries only the pin, `renderer.lock`).

## Develop without Docker

```bash
pip install -e ".[test]"                      # the backend and its test runtime
export DATABASE_URL=postgresql://user:pass@localhost:5432/workshops
export WORKSHOPS_AUTH_DISABLED=true WORKSHOPS_RENDERER_FILE=/path/to/template.html
python -m backend.run                         # serves app/ and the doors on :8000
cd frontend && npm ci && npm run dev          # the SPA on :5173, proxying /api and /mcp
```

Tests: `pytest tests` (a real PostgreSQL, never skipped), `cd frontend && npm test`, `cd e2e && npm ci && npx playwright test` (the self-contained suite, against `app/` and the backend), `cd docs && npm ci && npm test`, and `csd-intent .` for the intent audit. `npm run build` in `frontend/` writes the served document into `app/`, which is committed: CI refuses a bundle that is not the build of its source.

## Layout

- `backend/` - the Python package: `core/` (the model, the validator, the ports, the use cases), `adapters/` (the API and MCP doors, the PostgreSQL stores, the renderer, the git-home publisher), `config/`
- `frontend/` - the React + TypeScript + Vite source the build compiles into `app/`; the theme tokens under `src/styles/`, the fonts under `public/fonts/`
- `app/` - the built SPA document the image serves at `/`
- `e2e/` - Playwright specs: `selfcontained/` (CI, against the app's own stack) and `deployed/` (the in-cluster smoke Job)
- `tests/` - pytest suites (unit and integration) carrying the intent markers
- `devops/` - the app and smoke images, the compose file that is the released-image manifest, the promotion contract
- `k8s/` - the Helm chart: the app with its oauth2-proxy sidecar, the docs server, the machine-door key mint, the smoke Job; `secrets/*.env.example` for every out-of-band secret
- `docs/` - the Starlight site served under `/apps/rb-workshops`: the brand page, the modules, the flows, the operations guides, the decisions
- `renderer.lock` - the pinned sha256 of the canonical renderer
- `intent.yaml` - the app's CSD-INTENT-01 claims

## Commits

Every commit follows the platform's commit convention: a Conventional Commit subject and no co-author trailer. CI derives the version from the type and blocks release otherwise. The convention is documented on the platform portal's GitOps delivery page, under "Commit convention"; the committed `.pre-commit-config.yaml` checks it locally once installed (`pre-commit install`).
