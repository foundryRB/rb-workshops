"""The domain model: sessions with append-only revisions, runs with a capture, publications."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from enum import StrEnum
from typing import Any

__all__ = [
    "ShelfState",
    "RunKind",
    "RunState",
    "Door",
    "Session",
    "Revision",
    "Run",
    "Publication",
    "Finding",
    "ValidationReport",
    "Artifact",
]


class ShelfState(StrEnum):
    """The shelf lifecycle, forward only: ephemeral, draft, published."""

    EPHEMERAL = "ephemeral"
    DRAFT = "draft"
    PUBLISHED = "published"

    @property
    def rank(self) -> int:
        return ("ephemeral", "draft", "published").index(self.value)


class RunKind(StrEnum):
    REHEARSAL = "rehearsal"
    SESSION = "session"


class RunState(StrEnum):
    LIVE = "live"
    CLOSED = "closed"


class Door(StrEnum):
    UI = "ui"
    API = "api"
    MCP = "mcp"


@dataclass(frozen=True)
class Session:
    id: str
    title: str
    shelf_state: ShelfState
    created_at: datetime
    updated_at: datetime
    current_revision: int


@dataclass(frozen=True)
class Revision:
    session_id: str
    number: int
    dataset: dict[str, Any]
    note: str
    door: Door
    author: str
    created_at: datetime


@dataclass(frozen=True)
class Run:
    id: str
    session_id: str
    revision: int
    kind: RunKind
    state: RunState
    capture: dict[str, Any]
    started_at: datetime
    closed_at: datetime | None
    artifact_sha256: str | None
    renderer: str | None


@dataclass(frozen=True)
class Publication:
    id: str
    session_id: str
    revision: int
    repository: str
    ref: str
    path: str
    commit_sha: str
    sha256: str
    renderer: str
    published_at: datetime


@dataclass(frozen=True)
class Artifact:
    """A rendered standalone instrument: the bytes and the pin they were rendered by."""

    html: bytes
    sha256: str
    renderer: str
    session_id: str
    revision: int
    slug: str


@dataclass(frozen=True)
class Finding:
    """One row of the schema report: which rule, whether it held, and what it saw."""

    row: str
    label: str
    ok: bool
    detail: str


@dataclass(frozen=True)
class ValidationReport:
    rows: list[Finding] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return all(r.ok for r in self.rows)

    @property
    def errors(self) -> list[Finding]:
        return [r for r in self.rows if not r.ok]
