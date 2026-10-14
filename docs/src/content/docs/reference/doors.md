---
title: Doors
id: DOC-REF-DOORS-001
type: Reference
status: Active
updated: '2026-09-29'
summary: The inbound port set and the three doors over it - the UI's surfaces, the API's routes, the MCP door's tools - held to the adapters' own declarations.
---

One core, one inbound port set, three adapters. Every row is one port; a door that carried a capability the other two could not would show as a gap in its column. The table is held to the adapters' declarations by an intent test, so a port, route or tool shipped without its row fails the docs build.

## The port set

| Inbound port | UI | API | MCP tool |
| --- | --- | --- | --- |
| CreateSession | New session | `POST /api/sessions` | `create_session` |
| ReviseSession | Save revision | `POST /api/sessions/{session_id}/revisions`, `POST /api/validate` | `revise_session`, `validate_session` |
| ReadSession | Shelf, Revisions | `GET /api/sessions`, `GET /api/sessions/{session_id}`, `GET /api/sessions/{session_id}/revisions`, `GET /api/sessions/{session_id}/revisions/{number}` | `list_sessions`, `get_session`, `get_revision` |
| StartRun | Rehearse, Run | `POST /api/sessions/{session_id}/runs` | `start_run` |
| LandCapture | Close the run | `POST /api/runs/{run_id}/capture` | `land_capture` |
| ReadRun | Runs, Capture | `GET /api/runs`, `GET /api/runs/{run_id}`, `GET /api/runs/{run_id}/artifact` | `list_runs`, `get_run` |
| ExportArtifact | Download | `GET /api/sessions/{session_id}/export` | `export_artifact` |
| ExportPlan | Download plan export | `GET /api/runs/{run_id}/plan-export` | `export_plan` |
| PublishExport | Publish to the home | `POST /api/sessions/{session_id}/publish`, `GET /api/publications` | `publish_export`, `list_publications` |

## The gates

People reach the UI and the API through the oauth2-proxy sidecar against the `vf-workshops` realm; an unauthenticated browse redirects to the realm's sign-in, an unauthenticated API call answers 401. The MCP door at `/mcp` is skipped by the proxy with its auth header kept, and takes the engine's own HTTP Basic key: 503 until the key exists, 401 on a wrong one. The doors page hands the key to a signed-in person as a ready connect command. `/api/health` answers without credentials.

## Read next

- [Configuration](../configuration/) - the values behind the gates and the doors.
