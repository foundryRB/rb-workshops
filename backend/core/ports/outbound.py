"""The outbound ports: what the core needs from the world, as protocols the adapters satisfy."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Protocol

from backend.core.model import Publication, Revision, Run, Session

__all__ = ["SessionStore", "CaptureStore", "Renderer", "HomePublisher", "Clock", "IdGenerator"]


class SessionStore(Protocol):
    """Sessions and their append-only revisions. No update or delete of a revision exists."""

    def insert_session(self, session: Session) -> None: ...

    def get_session(self, session_id: str) -> Session | None: ...

    def list_sessions(self, state: str | None) -> list[Session]: ...

    def append_revision(self, revision: Revision) -> None: ...

    def get_revision(self, session_id: str, number: int) -> Revision | None: ...

    def list_revisions(self, session_id: str) -> list[Revision]: ...

    def advance_shelf_state(self, session_id: str, state: str, at: datetime) -> None: ...


class CaptureStore(Protocol):
    """Runs, their capture, and the frozen artifact of a closed run."""

    def insert_run(self, run: Run) -> None: ...

    def get_run(self, run_id: str) -> Run | None: ...

    def list_runs(self, session_id: str | None) -> list[Run]: ...

    def update_capture(self, run_id: str, capture: dict[str, Any]) -> None: ...

    def close_run(
        self, run_id: str, capture: dict[str, Any], artifact: bytes, sha256: str, renderer: str, at: datetime
    ) -> None: ...

    def get_artifact(self, run_id: str) -> bytes | None: ...

    def insert_publication(self, publication: Publication) -> None: ...

    def list_publications(self) -> list[Publication]: ...


class Renderer(Protocol):
    """The pinned canonical renderer: dataset in, standalone HTML out."""

    @property
    def pin(self) -> str: ...

    def render(self, dataset: dict[str, Any]) -> bytes: ...


class HomePublisher(Protocol):
    """The git-backed home: files in, a commit on the configured home ref out."""

    @property
    def repository(self) -> str: ...

    @property
    def ref(self) -> str: ...

    def publish(self, files: dict[str, bytes], message: str, ref: str) -> str: ...


class Clock(Protocol):
    def now(self) -> datetime: ...


class IdGenerator(Protocol):
    def new_id(self, prefix: str) -> str: ...
