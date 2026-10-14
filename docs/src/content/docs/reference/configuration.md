---
title: Configuration
id: DOC-REF-CONFIG-001
type: Reference
status: Active
updated: '2026-09-29'
summary: Every value the engine reads from its environment, held to the repository's .env.example by an intent test.
---

The engine reads its configuration from the environment; the chart sets what the install pins and a local run exports what it needs. The keys below are the ones `.env.example` documents, and an intent test holds the two in step.

## Keys

| Key | Meaning |
| --- | --- |
| `DATABASE_URL` | the store's connection string; wins over the discrete values |
| `DATABASE_HOST`, `DATABASE_PORT`, `DATABASE_NAME`, `DATABASE_USER`, `DATABASE_PASSWORD` | the discrete coordinates; an empty user refuses to start |
| `DATABASE_SCHEMA` | the PostgreSQL schema the tables live under, `public` by default |
| `WORKSHOPS_AUTH_SCOPE` | `mcp`: the human surfaces serve open behind the sidecar, the machine door keeps its key; any other value answers 503 on the human surfaces |
| `WORKSHOPS_AUTH_USER`, `WORKSHOPS_AUTH_PASSWORD` | the machine door's key, minted in-cluster by the chart |
| `WORKSHOPS_AUTH_DISABLED` | `true` turns the gate off for a local run |
| `WORKSHOPS_MCP_ALLOWED_HOSTS` | the Host header values the MCP transport admits |
| `WORKSHOPS_PUBLIC_HOST` | the public host the connect command names |
| `WORKSHOPS_RENDERER_FILE` | a file holding the template's bytes |
| `WORKSHOPS_RENDERER_CACHE_DIR` | where a fetched template is cached |
| `WORKSHOPS_RENDERER_URL`, `WORKSHOPS_RENDERER_USER`, `WORKSHOPS_RENDERER_PASSWORD` | the playbook-studio door and its credential |
| `WORKSHOPS_RENDERER_LOCK` | the path of `renderer.lock` |
| `GITHOME_REPOSITORY`, `GITHOME_REF`, `GITHOME_PATH` | the git-backed home |
| `GITHOME_TOKEN` | the publisher's fine-grained PAT |
| `GITHOME_API` | the GitHub API root |
| `PORT` | the port the engine listens on |
| `WORKSHOPS_STATIC_DIR` | the directory holding the built document |
| `WORKSHOPS_BUILD` | the build stamp the health route reports |
| `WORKSHOPS_BUILD_FILE` | the file the image writes its build moment into; the file's stamp is what the health route reports when the file exists |

A credential key may also be read from a file named by the same key with a `_FILE` suffix, which is how a mounted Secret arrives; the direct value is used when both are set.

## Read next

- [Deploy](../../operations/deploy/) - which of these the install sets, and where.
