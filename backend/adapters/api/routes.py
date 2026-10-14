"""The API door: every inbound port as a route, under the /api mount (handoff section 2b).

`PORT_ROUTES` declares which port each route adapts; the parity test reads it.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Header, Query, Request, Response
from fastapi.responses import JSONResponse

from backend.adapters.api.dto import (
    CreateSessionRequest,
    LandCaptureRequest,
    PublishRequest,
    ReviseSessionRequest,
    StartRunRequest,
    ValidateRequest,
    publication_dto,
    report_dto,
    revision_dto,
    run_dto,
    session_dto,
)
from backend.core.model import RunKind
from backend.core.ports.inbound import INBOUND_PORTS, Engine

__all__ = ["router", "PORT_ROUTES"]

router = APIRouter()

# port -> the routes that adapt it (method path)
PORT_ROUTES: dict[str, list[str]] = {
    "CreateSession": ["POST /api/sessions"],
    "ReviseSession": ["POST /api/sessions/{session_id}/revisions", "POST /api/validate"],
    "ReadSession": [
        "GET /api/sessions",
        "GET /api/sessions/{session_id}",
        "GET /api/sessions/{session_id}/revisions",
        "GET /api/sessions/{session_id}/revisions/{number}",
    ],
    "StartRun": ["POST /api/sessions/{session_id}/runs"],
    "LandCapture": ["POST /api/runs/{run_id}/capture"],
    "ReadRun": ["GET /api/runs", "GET /api/runs/{run_id}", "GET /api/runs/{run_id}/artifact"],
    "ExportArtifact": ["GET /api/sessions/{session_id}/export"],
    "ExportPlan": ["GET /api/runs/{run_id}/plan-export"],
    "PublishExport": ["POST /api/sessions/{session_id}/publish", "GET /api/publications"],
}
assert set(PORT_ROUTES) == set(INBOUND_PORTS)


def _engine(request: Request) -> Engine:
    return request.app.state.container.engine


def _door(x_door: str | None = Header(default=None)) -> str:
    """The door a write came through: the UI marks its calls; a bare API call is the API."""
    return "ui" if (x_door or "").strip().lower() == "ui" else "api"


def _html(artifact) -> Response:
    return Response(
        content=artifact.html,
        media_type="text/html; charset=utf-8",
        headers={
            "X-Renderer": artifact.renderer,
            "X-Artifact-SHA256": artifact.sha256,
            "Content-Disposition": f'inline; filename="{artifact.slug}.html"',
            "Cache-Control": "no-store",
        },
    )


@router.get("/sessions")
def list_sessions(state: str | None = Query(default=None), engine: Engine = Depends(_engine)) -> list[dict[str, Any]]:
    return [session_dto(s) for s in engine.list_sessions(state)]


@router.post("/sessions", status_code=201)
def create_session(
    body: CreateSessionRequest, door: str = Depends(_door), engine: Engine = Depends(_engine)
) -> dict[str, Any]:
    return session_dto(engine.create_session(body.title, body.dataset, door, body.author))


@router.get("/sessions/{session_id}")
def get_session(session_id: str, engine: Engine = Depends(_engine)) -> dict[str, Any]:
    session = engine.get_session(session_id)
    out = session_dto(session)
    out["revision"] = engine.get_revision(session_id, None)
    return out


@router.get("/sessions/{session_id}/revisions")
def list_revisions(session_id: str, engine: Engine = Depends(_engine)) -> list[dict[str, Any]]:
    return [revision_dto(r, with_dataset=False) for r in engine.list_revisions(session_id)]


@router.get("/sessions/{session_id}/revisions/{number}")
def get_revision(session_id: str, number: int, engine: Engine = Depends(_engine)) -> dict[str, Any]:
    return engine.get_revision(session_id, number)


@router.post("/sessions/{session_id}/revisions", status_code=201)
def revise_session(
    session_id: str, body: ReviseSessionRequest, door: str = Depends(_door), engine: Engine = Depends(_engine)
) -> dict[str, Any]:
    return session_dto(engine.revise_session(session_id, body.dataset, body.note, door, body.author))


@router.post("/validate")
def validate(body: ValidateRequest, engine: Engine = Depends(_engine)) -> dict[str, Any]:
    return report_dto(engine.validate(body.dataset))


@router.post("/sessions/{session_id}/runs", status_code=201)
def start_run(session_id: str, body: StartRunRequest, engine: Engine = Depends(_engine)) -> dict[str, Any]:
    return run_dto(engine.start_run(session_id, RunKind(body.kind), body.revision))


@router.get("/runs")
def list_runs(session_id: str | None = Query(default=None), engine: Engine = Depends(_engine)) -> list[dict[str, Any]]:
    return [run_dto(r) for r in engine.list_runs(session_id)]


@router.get("/runs/{run_id}")
def get_run(run_id: str, engine: Engine = Depends(_engine)) -> dict[str, Any]:
    return run_dto(engine.get_run(run_id))


@router.post("/runs/{run_id}/capture")
def land_capture(run_id: str, body: LandCaptureRequest, engine: Engine = Depends(_engine)) -> dict[str, Any]:
    return run_dto(engine.land_capture(run_id, body.capture, body.close))


@router.get("/runs/{run_id}/artifact")
def run_artifact(run_id: str, engine: Engine = Depends(_engine)) -> Response:
    return _html(engine.run_artifact(run_id))


@router.get("/runs/{run_id}/plan-export")
def export_plan(run_id: str, engine: Engine = Depends(_engine)) -> Response:
    return JSONResponse(
        engine.export_plan(run_id), headers={"Content-Disposition": f'attachment; filename="{run_id}-plan.json"'}
    )


@router.get("/sessions/{session_id}/export")
def export_artifact(
    session_id: str, revision: int | None = Query(default=None), engine: Engine = Depends(_engine)
) -> Response:
    return _html(engine.export_artifact(session_id, revision))


@router.post("/sessions/{session_id}/publish", status_code=201)
def publish_export(
    session_id: str, body: PublishRequest | None = None, engine: Engine = Depends(_engine)
) -> dict[str, Any]:
    return publication_dto(engine.publish_export(session_id, body.revision if body else None))


@router.get("/publications")
def list_publications(engine: Engine = Depends(_engine)) -> list[dict[str, Any]]:
    return [publication_dto(p) for p in engine.list_publications()]
