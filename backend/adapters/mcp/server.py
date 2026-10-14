"""The MCP door: one tool per inbound port over streamable HTTP, the same use cases as the API.

`PORT_TOOLS` declares which port each tool adapts; the parity test reads it.
Serialization reuses the API door's mappers, so both doors answer one shape.
"""

from __future__ import annotations

from typing import Any

from mcp.server.fastmcp import FastMCP
from mcp.server.transport_security import TransportSecuritySettings

from backend.adapters.api.dto import publication_dto, report_dto, revision_dto, run_dto, session_dto
from backend.core.errors import EngineError
from backend.core.model import RunKind
from backend.core.ports.inbound import INBOUND_PORTS, Engine

__all__ = ["build_mcp_server", "PORT_TOOLS"]

PORT_TOOLS: dict[str, list[str]] = {
    "CreateSession": ["create_session"],
    "ReviseSession": ["revise_session", "validate_session"],
    "ReadSession": ["list_sessions", "get_session", "get_revision"],
    "StartRun": ["start_run"],
    "LandCapture": ["land_capture"],
    "ReadRun": ["list_runs", "get_run"],
    "ExportArtifact": ["export_artifact"],
    "ExportPlan": ["export_plan"],
    "PublishExport": ["publish_export", "list_publications"],
}
assert set(PORT_TOOLS) == set(INBOUND_PORTS)

_INSTRUCTIONS = (
    "vf-workshops: the workshops engine. A session is one REF-Workshop dataset (meta plus typed "
    "activities: frame, collect, walk, sort, assign, close), stored with every revision kept. "
    "create_session and revise_session validate against the whole section 3 schema and refuse an "
    "invalid dataset with the report. start_run opens a rehearsal or a session run over a revision; "
    "land_capture records the run's capture and, with close=true, freezes it. export_artifact returns "
    "the standalone HTML the pinned canonical renderer produces; export_plan projects a capture toward "
    "a plan by its item ids; publish_export writes an export to the git-backed home and never mutates "
    "the store. Every tool calls the identical use case the HTTP API does."
)


def _transport_security(allowed_hosts: list[str]) -> TransportSecuritySettings | None:
    if not allowed_hosts:
        return None
    return TransportSecuritySettings(allowed_hosts=allowed_hosts)


def build_mcp_server(engine: Engine, allowed_hosts: list[str]) -> FastMCP:
    server = FastMCP(
        "vf-workshops",
        instructions=_INSTRUCTIONS,
        streamable_http_path="/",
        stateless_http=True,
        transport_security=_transport_security(allowed_hosts),
    )

    def run(fn):
        try:
            return fn()
        except EngineError as exc:
            raise ValueError(str(exc)) from None

    @server.tool()
    def list_sessions(state: str | None = None) -> list[dict[str, Any]]:
        """List the shelf: every session with its shelf state and current revision; state filters
        on ephemeral, draft or published."""
        return run(lambda: [session_dto(s) for s in engine.list_sessions(state)])

    @server.tool()
    def get_session(session_id: str) -> dict[str, Any]:
        """Return one session with its current revision's dataset."""

        def go():
            out = session_dto(engine.get_session(session_id))
            out["revision"] = engine.get_revision(session_id, None)
            out["revisions"] = [revision_dto(r, with_dataset=False) for r in engine.list_revisions(session_id)]
            return out

        return run(go)

    @server.tool()
    def get_revision(session_id: str, number: int) -> dict[str, Any]:
        """Return one stored revision of a session, by number; every revision stays retrievable."""
        return run(lambda: engine.get_revision(session_id, number))

    @server.tool()
    def create_session(title: str, dataset: dict[str, Any] | None = None, author: str = "agent") -> dict[str, Any]:
        """Create a session (ephemeral) with revision 1: the dataset given, validated, or a valid
        starter when none is given."""
        return run(lambda: session_dto(engine.create_session(title, dataset, "mcp", author)))

    @server.tool()
    def revise_session(
        session_id: str, dataset: dict[str, Any], note: str = "", author: str = "agent"
    ) -> dict[str, Any]:
        """Append a revision (validated against the whole schema; an invalid dataset is refused with
        the report). The first saved revision moves the session from ephemeral to draft."""
        return run(lambda: session_dto(engine.revise_session(session_id, dataset, note, "mcp", author)))

    @server.tool()
    def validate_session(dataset: dict[str, Any]) -> dict[str, Any]:
        """Validate a dataset against the REF-Workshop section 3 contract without storing it."""
        return run(lambda: report_dto(engine.validate(dataset)))

    @server.tool()
    def start_run(session_id: str, kind: str = "rehearsal", revision: int | None = None) -> dict[str, Any]:
        """Start a run of a session revision: kind is rehearsal or session, immutable for the run's life."""
        return run(lambda: run_dto(engine.start_run(session_id, RunKind(kind), revision)))

    @server.tool()
    def list_runs(session_id: str | None = None) -> list[dict[str, Any]]:
        """List runs, optionally of one session."""
        return run(lambda: [run_dto(r) for r in engine.list_runs(session_id)])

    @server.tool()
    def get_run(run_id: str) -> dict[str, Any]:
        """Return one run with its landed capture."""
        return run(lambda: run_dto(engine.get_run(run_id)))

    @server.tool()
    def land_capture(run_id: str, capture: dict[str, Any], close: bool = False) -> dict[str, Any]:
        """Land a run's capture server-side; close=true freezes the run (capture and artifact
        immutable afterwards, every further write refused)."""
        return run(lambda: run_dto(engine.land_capture(run_id, capture, close)))

    @server.tool()
    def export_artifact(session_id: str, revision: int | None = None) -> dict[str, Any]:
        """The standalone self-contained HTML of a session revision, rendered by the pinned
        canonical renderer, with its sha256 and the renderer pin."""

        def go():
            a = engine.export_artifact(session_id, revision)
            return {
                "session_id": a.session_id,
                "revision": a.revision,
                "filename": f"{a.slug}.html",
                "sha256": a.sha256,
                "renderer": a.renderer,
                "html": a.html.decode("utf-8"),
            }

        return run(go)

    @server.tool()
    def export_plan(run_id: str) -> dict[str, Any]:
        """A run's capture projected toward a plan: each captured item under its REF-Plan item id, verbatim."""
        return run(lambda: engine.export_plan(run_id))

    @server.tool()
    def publish_export(session_id: str, revision: int | None = None) -> dict[str, Any]:
        """Publish a revision's export to the git-backed home; the session store is left unchanged."""
        return run(lambda: publication_dto(engine.publish_export(session_id, revision)))

    @server.tool()
    def list_publications() -> list[dict[str, Any]]:
        """The exports published to the git-backed home, across all sessions."""
        return run(lambda: [publication_dto(p) for p in engine.list_publications()])

    return server
