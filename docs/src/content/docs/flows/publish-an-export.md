---
title: Publish an export
id: DOC-FLOW-PUBLISH-001
type: Flow
status: Active
updated: '2026-09-29'
summary: From a closed run to the git-backed home - the artifact rendered and checked, the publish committed on the home ref, the store untouched.
---

Publishing starts on a closed run's capture screen and ends with the revision's export committed on the home ref, the session moved to published, and every revision, run and capture row exactly as it was.

## Sequence

```mermaid
sequenceDiagram
  participant P as person
  participant UI as capture screen
  participant API as API door
  participant C as core
  participant R as renderer
  participant H as git-backed home
  P->>UI: open the closed run
  UI->>API: GET /api/sessions/{id}/export?revision=n
  API->>C: ExportArtifact
  C->>R: render the revision
  R-->>UI: the artifact bytes
  UI->>UI: sha256 the bytes, compare with the run's frozen sha256
  P->>UI: Publish to the home
  UI->>API: POST /api/sessions/{id}/publish
  API->>C: PublishExport
  C->>R: render the revision
  C->>H: refuse any ref but the home ref, then blob, tree, commit, ref update
  H-->>C: the commit
  C->>C: record the publication, move the session to published
  C-->>UI: the publication
```

## Steps

1. The capture screen fetches a fresh render of the revision and hashes it in the browser; the export card says whether the checksum matched the run's frozen artifact.
2. The person publishes; the core renders the revision again and hands the publisher the artifact and its manifest.
3. The publisher decides the ref guard before any connection opens, then writes the files as one commit on the home ref, creating the orphan ref on the first publish.
4. The core records the publication and moves the session to published; no revision, capture or run row is written.
5. The exports ledger lists the publication with its path, commit and checksum.

## Read next

- [Deploy](../../operations/deploy/) - where the publisher's credential comes from.
