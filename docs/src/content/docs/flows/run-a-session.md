---
title: Run a session
id: DOC-FLOW-RUN-001
type: Flow
status: Active
updated: '2026-09-29'
summary: From the shelf to the close - a run started over a revision, the artifact embedded same-origin, the capture landed as it happens, the run frozen.
---

A person starts a run from a session's author screen or runs tab, works the room's surfaces inside the console's Stage, and closes the run. The end state is a closed run whose capture and artifact are frozen, ready for the capture screen and the exports.

## Sequence

```mermaid
sequenceDiagram
  participant P as person
  participant UI as run console
  participant API as API door
  participant C as core
  participant R as renderer (iframe)
  P->>UI: Rehearse, or Run the session
  UI->>API: POST /api/sessions/{id}/runs (kind)
  API->>C: StartRun
  C-->>UI: run (live, capture empty)
  UI->>UI: seed the slot from the run's capture, take the lease
  UI->>R: mount /api/runs/{run}/artifact same-origin
  R-->>P: the cover, then the surfaces
  loop every recorded change
    P->>R: type a slot, stamp a verdict, land an item, enter a name
    R->>R: save to the slot
    R-->>UI: storage event
    UI->>API: POST /api/runs/{run}/capture
    API->>C: LandCapture
  end
  P->>UI: Close the run
  UI->>API: POST /api/runs/{run}/capture (close)
  API->>C: LandCapture, close
  C->>C: render the artifact, freeze the run
  UI->>UI: clear the slot, release the lease
  UI-->>P: the capture screen
```

## Steps

1. The person starts a rehearsal or a session; the core records a live run over the chosen revision with an empty capture.
2. The console seeds the renderer's slot from that run's capture, takes the ownership lease, and only then mounts the artifact same-origin; a second live mount of the revision in the same browser is refused here.
3. The room works the surfaces; each recorded change the renderer saves fires a storage event at the console, which lands it through the API door as it happens.
4. A refresh re-seeds the slot from the server, which holds everything landed, so nothing recorded is lost.
5. The person closes the run: the core lands the final capture, renders the artifact, freezes the run, and every later write is refused through all three doors.

## Read next

- [Publish an export](../publish-an-export/) - what follows the close.
