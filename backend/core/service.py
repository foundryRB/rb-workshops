"""The use cases behind the inbound port set: the one path every door takes."""

from __future__ import annotations

import hashlib
import json
import re
from typing import Any

from backend.core import plan_export as _plan
from backend.core.errors import InvalidSession, NotFound, RunClosed
from backend.core.model import (
    Artifact,
    Door,
    Publication,
    Revision,
    Run,
    RunKind,
    RunState,
    Session,
    ShelfState,
    ValidationReport,
)
from backend.core.ports.outbound import (
    CaptureStore,
    Clock,
    HomePublisher,
    IdGenerator,
    Renderer,
    SessionStore,
)
from backend.core.schema import validate as _validate
from backend.core.starter import starter_dataset

__all__ = ["WorkshopsEngine"]


class WorkshopsEngine:
    """The core service: every inbound port as a method, every dependency an outbound port."""

    def __init__(
        self,
        sessions: SessionStore,
        captures: CaptureStore,
        renderer: Renderer,
        home: HomePublisher,
        clock: Clock,
        ids: IdGenerator,
    ) -> None:
        self._sessions = sessions
        self._captures = captures
        self._renderer = renderer
        self._home = home
        self._clock = clock
        self._ids = ids

    # --- CreateSession / ReviseSession --------------------------------------

    def validate(self, dataset: Any) -> ValidationReport:
        return _validate(dataset)

    def create_session(self, title: str, dataset: dict[str, Any] | None, door: str, author: str) -> Session:
        now = self._clock.now()
        session_id = self._ids.new_id("s")
        data = dataset if dataset is not None else starter_dataset(title, session_id, now.date().isoformat())
        report = _validate(data)
        if not report.ok:
            raise InvalidSession(report)
        session = Session(session_id, title, ShelfState.EPHEMERAL, now, now, 1)
        self._sessions.insert_session(session)
        self._sessions.append_revision(Revision(session_id, 1, data, "created", Door(door), author, now))
        return self._sessions.get_session(session_id) or session

    def revise_session(self, session_id: str, dataset: dict[str, Any], note: str, door: str, author: str) -> Session:
        session = self._require_session(session_id)
        report = _validate(dataset)
        if not report.ok:
            raise InvalidSession(report)
        now = self._clock.now()
        number = session.current_revision + 1
        self._sessions.append_revision(Revision(session_id, number, dataset, note, Door(door), author, now))
        if session.shelf_state == ShelfState.EPHEMERAL:
            self._sessions.advance_shelf_state(session_id, ShelfState.DRAFT.value, now)
        return self._require_session(session_id)

    # --- ReadSession ---------------------------------------------------------

    def get_session(self, session_id: str) -> Session:
        return self._require_session(session_id)

    def get_revision(self, session_id: str, number: int | None) -> dict[str, Any]:
        session = self._require_session(session_id)
        rev = self._sessions.get_revision(session_id, number or session.current_revision)
        if rev is None:
            raise NotFound(f"revision {number} of {session_id}")
        return {
            "session_id": rev.session_id,
            "number": rev.number,
            "dataset": rev.dataset,
            "note": rev.note,
            "door": rev.door.value,
            "author": rev.author,
            "created_at": rev.created_at.isoformat(),
        }

    def list_revisions(self, session_id: str) -> list[Revision]:
        self._require_session(session_id)
        return self._sessions.list_revisions(session_id)

    def list_sessions(self, state: str | None) -> list[Session]:
        return self._sessions.list_sessions(state)

    # --- StartRun / LandCapture / ReadRun -----------------------------------

    def start_run(self, session_id: str, kind: RunKind, revision: int | None) -> Run:
        session = self._require_session(session_id)
        number = revision or session.current_revision
        if self._sessions.get_revision(session_id, number) is None:
            raise NotFound(f"revision {number} of {session_id}")
        run = Run(
            self._ids.new_id("r"), session_id, number, kind, RunState.LIVE, {}, self._clock.now(), None, None, None
        )
        self._captures.insert_run(run)
        return run

    def land_capture(self, run_id: str, capture: dict[str, Any], close: bool) -> Run:
        run = self._require_run(run_id)
        if run.state == RunState.CLOSED:
            raise RunClosed(f"run {run_id} is closed: the workshop stands as run")
        if not isinstance(capture, dict):
            raise InvalidSession(ValidationReport([]))
        if close:
            artifact = self._render(run.session_id, run.revision)
            self._captures.close_run(
                run_id, capture, artifact.html, artifact.sha256, artifact.renderer, self._clock.now()
            )
        else:
            self._captures.update_capture(run_id, capture)
        return self._require_run(run_id)

    def get_run(self, run_id: str) -> Run:
        return self._require_run(run_id)

    def list_runs(self, session_id: str | None) -> list[Run]:
        return self._captures.list_runs(session_id)

    def run_artifact(self, run_id: str) -> Artifact:
        run = self._require_run(run_id)
        if run.state == RunState.CLOSED:
            frozen = self._captures.get_artifact(run_id)
            if frozen is not None:
                rev = self._sessions.get_revision(run.session_id, run.revision)
                slug = _slug(str(((rev.dataset if rev else {}).get("meta") or {}).get("id") or ""), run.session_id)
                return Artifact(
                    frozen,
                    run.artifact_sha256 or _sha(frozen),
                    run.renderer or self._renderer.pin,
                    run.session_id,
                    run.revision,
                    slug,
                )
        return self._render(run.session_id, run.revision)

    # --- ExportArtifact / ExportPlan / PublishExport -------------------------

    def export_artifact(self, session_id: str, revision: int | None) -> Artifact:
        session = self._require_session(session_id)
        return self._render(session_id, revision or session.current_revision)

    def export_plan(self, run_id: str) -> dict[str, Any]:
        run = self._require_run(run_id)
        rev = self._sessions.get_revision(run.session_id, run.revision)
        if rev is None:
            raise NotFound(f"revision {run.revision} of {run.session_id}")
        return _plan.plan_export(
            rev.dataset,
            run.capture,
            session_id=run.session_id,
            revision=run.revision,
            run_id=run.id,
            run_kind=run.kind.value,
            closed_at=run.closed_at.isoformat() if run.closed_at else None,
            renderer=run.renderer or self._renderer.pin,
        )

    def publish_export(self, session_id: str, revision: int | None) -> Publication:
        session = self._require_session(session_id)
        number = revision or session.current_revision
        artifact = self._render(session_id, number)
        path = self._home_path(session_id, number)
        manifest = {
            "session": session_id,
            "revision": number,
            "sha256": artifact.sha256,
            "renderer": artifact.renderer,
            "file": f"{artifact.slug}.html",
        }
        files = {
            f"{path}{artifact.slug}.html": artifact.html,
            f"{path}manifest.json": (json.dumps(manifest, indent=2) + "\n").encode("utf-8"),
        }
        message = f"feat(home): publish {session_id} revision {number}"
        commit = self._home.publish(files, message, self._home.ref)
        now = self._clock.now()
        publication = Publication(
            self._ids.new_id("p"),
            session_id,
            number,
            self._home.repository,
            self._home.ref,
            path,
            commit,
            artifact.sha256,
            artifact.renderer,
            now,
        )
        self._captures.insert_publication(publication)
        if session.shelf_state != ShelfState.PUBLISHED:
            self._sessions.advance_shelf_state(session_id, ShelfState.PUBLISHED.value, now)
        return publication

    def list_publications(self) -> list[Publication]:
        return self._captures.list_publications()

    # --- helpers ---------------------------------------------------------------

    def _home_path(self, session_id: str, revision: int) -> str:
        template = getattr(self._home, "path_template", "workshops/{session}/{revision}/")
        path = template.format(session=session_id, revision=revision)
        return path if path.endswith("/") else path + "/"

    def _render(self, session_id: str, revision: int) -> Artifact:
        rev = self._sessions.get_revision(session_id, revision)
        if rev is None:
            raise NotFound(f"revision {revision} of {session_id}")
        html = self._renderer.render(rev.dataset)
        slug = _slug(str((rev.dataset.get("meta") or {}).get("id") or ""), session_id)
        return Artifact(html, _sha(html), self._renderer.pin, session_id, revision, slug)

    def _require_session(self, session_id: str) -> Session:
        session = self._sessions.get_session(session_id)
        if session is None:
            raise NotFound(f"session {session_id}")
        return session

    def _require_run(self, run_id: str) -> Run:
        run = self._captures.get_run(run_id)
        if run is None:
            raise NotFound(f"run {run_id}")
        return run


def _sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _slug(value: str, fallback: str) -> str:
    """A file-safe stem: letters, digits, dot, dash and underscore, never a path or a header break."""
    stem = re.sub(r"[^A-Za-z0-9._-]+", "-", value).strip(".-_")
    return stem or fallback
