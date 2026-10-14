"""The inbound port set, authoritative (handoff section 2b): one core, three doors.

`INBOUND_PORTS` is the registry the parity claim (INT-WORKSHOPS-021) is
decided against: every door declares which of these it reaches, and a door
that reaches one the other two do not is a gap in its column.
"""

from __future__ import annotations

from typing import Any, Protocol

from backend.core.model import Artifact, Publication, Run, RunKind, Session, ValidationReport

__all__ = ["INBOUND_PORTS", "Engine"]

INBOUND_PORTS: tuple[str, ...] = (
    "CreateSession",
    "ReviseSession",
    "ReadSession",
    "StartRun",
    "LandCapture",
    "ReadRun",
    "ExportArtifact",
    "ExportPlan",
    "PublishExport",
)


class Engine(Protocol):
    """Every inbound port, as the one service the doors adapt."""

    # CreateSession
    def create_session(self, title: str, dataset: dict[str, Any] | None, door: str, author: str) -> Session: ...

    # ReviseSession
    def revise_session(
        self, session_id: str, dataset: dict[str, Any], note: str, door: str, author: str
    ) -> Session: ...

    def validate(self, dataset: Any) -> ValidationReport: ...

    # ReadSession
    def get_session(self, session_id: str) -> Session: ...

    def get_revision(self, session_id: str, number: int | None) -> dict[str, Any]: ...

    def list_sessions(self, state: str | None) -> list[Session]: ...

    # StartRun
    def start_run(self, session_id: str, kind: RunKind, revision: int | None) -> Run: ...

    # LandCapture
    def land_capture(self, run_id: str, capture: dict[str, Any], close: bool) -> Run: ...

    # ReadRun
    def get_run(self, run_id: str) -> Run: ...

    def list_runs(self, session_id: str | None) -> list[Run]: ...

    def run_artifact(self, run_id: str) -> Artifact: ...

    # ExportArtifact
    def export_artifact(self, session_id: str, revision: int | None) -> Artifact: ...

    # ExportPlan
    def export_plan(self, run_id: str) -> dict[str, Any]: ...

    # PublishExport
    def publish_export(self, session_id: str, revision: int | None) -> Publication: ...

    def list_publications(self) -> list[Publication]: ...
