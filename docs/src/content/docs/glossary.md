---
title: Glossary
id: DOC-GLOSSARY-001
type: Reference
status: Active
updated: '2026-09-29'
summary: One line per word the engine uses.
---

The domain's words, as the engine and its documentation use them. A term here means the same thing on every page.

## Terms

| Term | Meaning |
| --- | --- |
| Session | One typed working-session instrument: a dataset of meta plus typed activities, stored with every revision kept |
| Revision | One stored version of a session's dataset, numbered from 1, never rewritten or deleted |
| Shelf state | Where a session stands: ephemeral, then draft on its first saved revision, then published on its first publish; never backwards |
| Activity | One block of a session, of one of six kinds: frame, collect, walk, sort, assign, close |
| Kind | The activity's type, a triple of contract, room surface and capture shape |
| Room | The participant-facing projection: the cover and the working surfaces |
| Script | The facilitator's projection: goal, spoken lines, watch-outs, reached deliberately and never the landing view |
| Run | One rehearsal or one session over one revision, live until it is closed |
| Capture | The outcomes recorded on the surface during a run, landed server-side as they happen |
| Close | The act that freezes a run: its capture and its artifact become immutable |
| Artifact | The standalone self-contained HTML of a revision, rendered by the pinned canonical renderer |
| Renderer | The `bootstrap-workshop` template, consumed at the sha256 in `renderer.lock`, never forked |
| Pin | The recorded sha256 the renderer's bytes must hash to |
| Plan export | A capture projected toward a plan: each item under its REF-Plan item id, verbatim |
| Publish | Writing an export to the git-backed home; the session store is left unchanged |
| Home | The git repository, ref and path exports are published to, all configuration |
| Door | An inbound adapter over the core: the UI, the HTTP API, the MCP door |
| Port | One capability of the core every door adapts; the port set is closed |
| Slot | The renderer's local-storage entry for a session revision, which the run console owns per run |

## Read next

- [The engine at a glance](../) - back to the overview.
