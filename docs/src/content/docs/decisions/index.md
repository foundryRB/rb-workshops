---
title: Decisions
id: DOC-DECISIONS-INDEX-001
type: Reference
status: Active
updated: '2026-10-02'
summary: The architecture decision log for vf-workshops, current versus superseded.
---

Every significant, hard-to-reverse choice in vf-workshops is recorded as an architecture decision record: the context, the decision, why, and the alternatives rejected. This page is the log; the records carry the detail. The why lives here and nowhere else on the site.

## Current

| Id | Title | Status |
| --- | --- | --- |
| [ADR-001](../adr-001/) | Hexagonal core behind one inbound port set, three doors | Decided |
| [ADR-002](../adr-002/) | The canonical renderer is consumed at a content-hash pin, resolved at runtime, never forked | Decided |
| [ADR-003](../adr-003/) | The session store is append-only and the shelf state runs forward only | Decided |
| [ADR-004](../adr-004/) | A run is immutable after its close, in the core and at the database | Decided |
| [ADR-005](../adr-005/) | The git-backed home is configuration, defaulting to this repository's home branch | Decided |
| [ADR-006](../adr-006/) | The MCP door keeps its own chart-minted key, carved out of the interactive gate | Decided |
| [ADR-007](../adr-007/) | The capture bridge owns the renderer's storage slot per run | Decided |
| [ADR-008](../adr-008/) | Deployed attestation follows the platform's smoke contract | Decided |
| [ADR-009](../adr-009/) | The publisher refuses any ref but the configured home ref before a connection opens | Decided |
| [ADR-010](../adr-010/) | The API door mounts under /api and the port table's routes are relative to it | Decided |
| [ADR-011](../adr-011/) | Vodafone Portugal Digital identity for the application, documentation and canonical workshops | Decided |

## Superseded

| Id | Title | Superseded by |
| --- | --- | --- |
| none | | |
