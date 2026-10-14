"""Request and response shapes of the API door; the MCP door reuses the response mappers."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field

from backend.core.model import Publication, Revision, Run, Session, ValidationReport

__all__ = [
    "CreateSessionRequest",
    "ReviseSessionRequest",
    "StartRunRequest",
    "LandCaptureRequest",
    "PublishRequest",
    "ValidateRequest",
    "session_dto",
    "revision_dto",
    "run_dto",
    "publication_dto",
    "report_dto",
]


class CreateSessionRequest(BaseModel):
    title: str = Field(min_length=1)
    dataset: dict[str, Any] | None = None
    author: str = ""


class ReviseSessionRequest(BaseModel):
    dataset: dict[str, Any]
    note: str = ""
    author: str = ""


class StartRunRequest(BaseModel):
    kind: str = Field(pattern="^(rehearsal|session)$")
    revision: int | None = None


class LandCaptureRequest(BaseModel):
    capture: dict[str, Any]
    close: bool = False


class PublishRequest(BaseModel):
    revision: int | None = None


class ValidateRequest(BaseModel):
    dataset: Any


def session_dto(s: Session) -> dict[str, Any]:
    return {
        "id": s.id,
        "title": s.title,
        "shelf_state": s.shelf_state.value,
        "current_revision": s.current_revision,
        "created_at": s.created_at.isoformat(),
        "updated_at": s.updated_at.isoformat(),
    }


def revision_dto(r: Revision, *, with_dataset: bool = True) -> dict[str, Any]:
    out: dict[str, Any] = {
        "session_id": r.session_id,
        "number": r.number,
        "note": r.note,
        "door": r.door.value,
        "author": r.author,
        "created_at": r.created_at.isoformat(),
    }
    if with_dataset:
        out["dataset"] = r.dataset
    else:
        meta = r.dataset.get("meta") or {}
        out["summary"] = {
            "title": meta.get("title"),
            "duration": meta.get("duration"),
            "activities": len(r.dataset.get("activities") or []),
        }
    return out


def run_dto(r: Run) -> dict[str, Any]:
    return {
        "id": r.id,
        "session_id": r.session_id,
        "revision": r.revision,
        "kind": r.kind.value,
        "state": r.state.value,
        "capture": r.capture,
        "started_at": r.started_at.isoformat(),
        "closed_at": r.closed_at.isoformat() if r.closed_at else None,
        "artifact_sha256": r.artifact_sha256,
        "renderer": r.renderer,
    }


def publication_dto(p: Publication) -> dict[str, Any]:
    return {
        "id": p.id,
        "session_id": p.session_id,
        "revision": p.revision,
        "repository": p.repository,
        "ref": p.ref,
        "path": p.path,
        "commit_sha": p.commit_sha,
        "sha256": p.sha256,
        "renderer": p.renderer,
        "published_at": p.published_at.isoformat(),
    }


def report_dto(report: ValidationReport) -> dict[str, Any]:
    return {
        "ok": report.ok,
        "rows": [{"row": f.row, "label": f.label, "ok": f.ok, "detail": f.detail} for f in report.rows],
    }
