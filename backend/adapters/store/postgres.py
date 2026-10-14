"""The PostgreSQL adapter for the session store and the capture store (outbound ports)."""

from __future__ import annotations

import json
from contextlib import contextmanager
from datetime import datetime
from pathlib import Path
from typing import Any

import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Json, Jsonb
from psycopg_pool import ConnectionPool

from backend.core.model import (
    Door,
    Publication,
    Revision,
    Run,
    RunKind,
    RunState,
    Session,
    ShelfState,
)

__all__ = ["PostgresStore"]

_SCHEMA_SQL = Path(__file__).with_name("schema.sql")


class PostgresStore:
    """One adapter satisfying both store ports over one connection pool.

    `schema` scopes every table under a PostgreSQL schema: `public` in
    production, a throwaway one per test session.
    """

    def __init__(self, dsn: str, schema: str = "public", min_size: int = 1, max_size: int = 8) -> None:
        self._schema = schema
        self._pool = ConnectionPool(
            dsn,
            min_size=min_size,
            max_size=max_size,
            open=True,
            kwargs={"row_factory": dict_row},
            configure=self._configure,
        )

    def _configure(self, conn: psycopg.Connection) -> None:
        conn.execute(f'SET search_path TO "{self._schema}"')
        conn.commit()

    def migrate(self) -> None:
        with self._pool.connection() as conn:
            conn.execute(f'CREATE SCHEMA IF NOT EXISTS "{self._schema}"')
            conn.execute(f'SET search_path TO "{self._schema}"')
            conn.execute(_SCHEMA_SQL.read_text(encoding="utf-8"))
            conn.commit()

    def close(self) -> None:
        self._pool.close()

    @contextmanager
    def connection(self):
        with self._pool.connection() as conn:
            yield conn

    # --- SessionStore ---------------------------------------------------------

    def insert_session(self, session: Session) -> None:
        with self._pool.connection() as conn:
            conn.execute(
                "INSERT INTO sessions (id, title, shelf_state, created_at, updated_at) VALUES (%s, %s, %s, %s, %s)",
                (session.id, session.title, session.shelf_state.value, session.created_at, session.updated_at),
            )

    def get_session(self, session_id: str) -> Session | None:
        with self._pool.connection() as conn:
            row = conn.execute(
                "SELECT s.*, COALESCE((SELECT max(number) FROM revisions r WHERE r.session_id = s.id), 0) "
                "AS current_revision "
                "FROM sessions s WHERE s.id = %s",
                (session_id,),
            ).fetchone()
        return _session(row) if row else None

    def list_sessions(self, state: str | None) -> list[Session]:
        sql = (
            "SELECT s.*, COALESCE((SELECT max(number) FROM revisions r WHERE r.session_id = s.id), 0) "
            "AS current_revision "
            "FROM sessions s"
        )
        params: tuple[Any, ...] = ()
        if state:
            sql += " WHERE s.shelf_state = %s"
            params = (state,)
        sql += " ORDER BY s.updated_at DESC, s.id"
        with self._pool.connection() as conn:
            rows = conn.execute(sql, params).fetchall()
        return [_session(r) for r in rows]

    def append_revision(self, revision: Revision) -> None:
        with self._pool.connection() as conn:
            conn.execute(
                "INSERT INTO revisions (session_id, number, dataset, note, door, author, created_at) "
                "VALUES (%s, %s, %s, %s, %s, %s, %s)",
                (
                    revision.session_id,
                    revision.number,
                    Json(revision.dataset),
                    revision.note,
                    revision.door.value,
                    revision.author,
                    revision.created_at,
                ),
            )
            conn.execute(
                "UPDATE sessions SET updated_at = %s WHERE id = %s", (revision.created_at, revision.session_id)
            )

    def get_revision(self, session_id: str, number: int) -> Revision | None:
        with self._pool.connection() as conn:
            row = conn.execute(
                "SELECT * FROM revisions WHERE session_id = %s AND number = %s", (session_id, number)
            ).fetchone()
        return _revision(row) if row else None

    def list_revisions(self, session_id: str) -> list[Revision]:
        with self._pool.connection() as conn:
            rows = conn.execute(
                "SELECT * FROM revisions WHERE session_id = %s ORDER BY number DESC", (session_id,)
            ).fetchall()
        return [_revision(r) for r in rows]

    def advance_shelf_state(self, session_id: str, state: str, at: datetime) -> None:
        with self._pool.connection() as conn:
            conn.execute("UPDATE sessions SET shelf_state = %s, updated_at = %s WHERE id = %s", (state, at, session_id))

    # --- CaptureStore ---------------------------------------------------------

    def insert_run(self, run: Run) -> None:
        with self._pool.connection() as conn:
            conn.execute(
                "INSERT INTO runs (id, session_id, revision, kind, state, capture, started_at) "
                "VALUES (%s, %s, %s, %s, %s, %s, %s)",
                (
                    run.id,
                    run.session_id,
                    run.revision,
                    run.kind.value,
                    run.state.value,
                    Jsonb(run.capture),
                    run.started_at,
                ),
            )

    def get_run(self, run_id: str) -> Run | None:
        with self._pool.connection() as conn:
            row = conn.execute(
                "SELECT id, session_id, revision, kind, state, capture, started_at, closed_at, "
                "artifact_sha256, renderer "
                "FROM runs WHERE id = %s",
                (run_id,),
            ).fetchone()
        return _run(row) if row else None

    def list_runs(self, session_id: str | None) -> list[Run]:
        sql = (
            "SELECT id, session_id, revision, kind, state, capture, started_at, closed_at, "
            "artifact_sha256, renderer "
            "FROM runs"
        )
        params: tuple[Any, ...] = ()
        if session_id:
            sql += " WHERE session_id = %s"
            params = (session_id,)
        sql += " ORDER BY started_at DESC, id"
        with self._pool.connection() as conn:
            rows = conn.execute(sql, params).fetchall()
        return [_run(r) for r in rows]

    def update_capture(self, run_id: str, capture: dict[str, Any]) -> None:
        with self._pool.connection() as conn:
            conn.execute("UPDATE runs SET capture = %s WHERE id = %s AND state = 'live'", (Jsonb(capture), run_id))

    def close_run(
        self, run_id: str, capture: dict[str, Any], artifact: bytes, sha256: str, renderer: str, at: datetime
    ) -> None:
        with self._pool.connection() as conn:
            conn.execute(
                "UPDATE runs SET capture = %s, state = 'closed', closed_at = %s, artifact = %s, "
                "artifact_sha256 = %s, renderer = %s "
                "WHERE id = %s AND state = 'live'",
                (Jsonb(capture), at, artifact, sha256, renderer, run_id),
            )

    def get_artifact(self, run_id: str) -> bytes | None:
        with self._pool.connection() as conn:
            row = conn.execute("SELECT artifact FROM runs WHERE id = %s", (run_id,)).fetchone()
        return bytes(row["artifact"]) if row and row["artifact"] is not None else None

    def insert_publication(self, publication: Publication) -> None:
        with self._pool.connection() as conn:
            conn.execute(
                "INSERT INTO publications (id, session_id, revision, repository, ref, path, commit_sha, sha256, renderer, published_at) "  # noqa: E501
                "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)",
                (
                    publication.id,
                    publication.session_id,
                    publication.revision,
                    publication.repository,
                    publication.ref,
                    publication.path,
                    publication.commit_sha,
                    publication.sha256,
                    publication.renderer,
                    publication.published_at,
                ),
            )

    def list_publications(self) -> list[Publication]:
        with self._pool.connection() as conn:
            rows = conn.execute("SELECT * FROM publications ORDER BY published_at DESC, id").fetchall()
        return [_publication(r) for r in rows]

    # --- evidence reads (tests and the doors page) --------------------------------

    def counts(self) -> dict[str, int]:
        with self._pool.connection() as conn:
            return {
                table: conn.execute(f"SELECT count(*) AS n FROM {table}").fetchone()["n"]
                for table in ("sessions", "revisions", "runs", "publications")
            }

    def fingerprint(self) -> str:
        """A stable digest of every revision, run and capture row: what a publish must leave unchanged."""
        with self._pool.connection() as conn:
            revs = conn.execute(
                "SELECT session_id, number, dataset::text, note, door, author, created_at::text FROM revisions ORDER BY session_id, number"  # noqa: E501
            ).fetchall()
            runs = conn.execute(
                "SELECT id, session_id, revision, kind, state, capture::text, artifact_sha256 FROM runs ORDER BY id"
            ).fetchall()
        return json.dumps([revs, runs], sort_keys=True, default=str)


def _session(row: dict) -> Session:
    return Session(
        row["id"],
        row["title"],
        ShelfState(row["shelf_state"]),
        row["created_at"],
        row["updated_at"],
        int(row["current_revision"]),
    )


def _revision(row: dict) -> Revision:
    return Revision(
        row["session_id"],
        row["number"],
        row["dataset"],
        row["note"],
        Door(row["door"]),
        row["author"],
        row["created_at"],
    )


def _run(row: dict) -> Run:
    return Run(
        row["id"],
        row["session_id"],
        row["revision"],
        RunKind(row["kind"]),
        RunState(row["state"]),
        row["capture"] or {},
        row["started_at"],
        row["closed_at"],
        row["artifact_sha256"],
        row["renderer"],
    )


def _publication(row: dict) -> Publication:
    return Publication(
        row["id"],
        row["session_id"],
        row["revision"],
        row["repository"],
        row["ref"],
        row["path"],
        row["commit_sha"],
        row["sha256"],
        row["renderer"],
        row["published_at"],
    )
