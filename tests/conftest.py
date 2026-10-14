"""Shared fixtures: a real PostgreSQL under a throwaway schema, the pinned renderer, a fake git home.

DATABASE_URL is required by every integration test; a store-less test fails,
it never skips (a skipped claim is an unattested claim). The app under test
always builds; the renderer's bytes come from WORKSHOPS_RENDERER_FILE or the
playbook-studio door (the same resolution the engine runs), and only a test
that renders (`renderer_ready`) skips, with the reason named, when no source
is configured, because the corpus is private and CI holds no credential for
it (the build record's ASM-B01). Everything that does not render runs everywhere.
"""

from __future__ import annotations

import base64
import hashlib
import json
import os
import secrets
import socket
import threading
import time
from collections.abc import Iterator
from dataclasses import replace
from pathlib import Path
from typing import Any

import httpx
import pytest
import uvicorn
from fastapi.testclient import TestClient

from backend.adapters.renderer.pin import read_pin
from backend.adapters.renderer.source import resolve_template
from backend.config import Settings, load_settings
from backend.core.errors import RendererUnavailable

REPO = Path(__file__).resolve().parents[1]
PIN = read_pin(REPO / "renderer.lock")


def _base_settings() -> Settings:
    if not os.environ.get("DATABASE_URL"):
        raise RuntimeError("DATABASE_URL is unset: the integration suites need a real PostgreSQL and never skip")
    return load_settings()


RENDERER_SKIP = (
    "the pinned renderer is not resolvable here (no WORKSHOPS_RENDERER_FILE or playbook-studio credential); "
    "see the build record's ASM-B01"
)


def _resolved_template() -> bytes | None:
    s = load_settings()
    try:
        return resolve_template(
            PIN,
            file=s.renderer_file,
            cache_dir=s.renderer_cache_dir,
            url=s.renderer_url,
            user=s.renderer_user,
            password=s.renderer_password,
        )
    except RendererUnavailable:
        return None


@pytest.fixture(scope="session")
def template_bytes() -> bytes:
    """The template's bytes, for the tests that read or render them; skips where none resolve."""
    data = _resolved_template()
    if data is None:
        pytest.skip(RENDERER_SKIP)
    return data


@pytest.fixture
def renderer_ready(app) -> None:
    """Request this in a test that renders; it skips, naming the reason, when the app cannot."""
    container = app.state.container
    deadline = time.time() + 15
    while container.renderer_state == "unresolved" and time.time() < deadline:
        time.sleep(0.1)
    if container.renderer_state != "ready":
        pytest.skip(RENDERER_SKIP)


@pytest.fixture
def settings(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Settings:
    base = _base_settings()
    schema = f"t_{secrets.token_hex(4)}"
    return replace(
        base,
        database_schema=schema,
        auth_disabled=True,
        auth_scope="mcp",
        static_dir=str(REPO / "app"),
        githome_token="x" * 8,
        githome_api="http://home.invalid",
    )


class FakeGitHub:
    """A tiny in-memory GitHub git-data API, enough for the publisher's four calls."""

    def __init__(self) -> None:
        self.refs: dict[str, str] = {}
        self.commits: dict[str, dict] = {}
        self.trees: dict[str, list[dict]] = {}
        self.blobs: dict[str, bytes] = {}
        self.calls: list[str] = []

    def handler(self, request: httpx.Request) -> httpx.Response:
        path = request.url.path
        self.calls.append(f"{request.method} {path}")
        body = json.loads(request.content or b"{}") if request.content else {}
        if request.method == "GET" and "/git/ref/heads/" in path:
            ref = path.rsplit("/git/ref/heads/", 1)[1]
            if ref not in self.refs:
                return httpx.Response(404, json={"message": "Not Found"})
            return httpx.Response(200, json={"object": {"sha": self.refs[ref]}})
        if request.method == "GET" and "/git/commits/" in path:
            sha = path.rsplit("/", 1)[1]
            return httpx.Response(200, json={"sha": sha, "tree": {"sha": self.commits[sha]["tree"]}})
        if request.method == "POST" and path.endswith("/git/blobs"):
            data = base64.b64decode(body["content"])
            sha = hashlib.sha1(data).hexdigest()
            self.blobs[sha] = data
            return httpx.Response(201, json={"sha": sha})
        if request.method == "POST" and path.endswith("/git/trees"):
            entries = list(self.trees.get(body.get("base_tree", ""), [])) + body["tree"]
            sha = hashlib.sha1(json.dumps(entries, sort_keys=True).encode()).hexdigest()
            self.trees[sha] = entries
            return httpx.Response(201, json={"sha": sha})
        if request.method == "POST" and path.endswith("/git/commits"):
            sha = hashlib.sha1(json.dumps(body, sort_keys=True).encode() + secrets.token_bytes(4)).hexdigest()
            self.commits[sha] = body
            return httpx.Response(201, json={"sha": sha})
        if request.method == "POST" and path.endswith("/git/refs"):
            ref = body["ref"].split("refs/heads/", 1)[1]
            self.refs[ref] = body["sha"]
            return httpx.Response(201, json={"ref": body["ref"]})
        if request.method == "PATCH" and "/git/refs/heads/" in path:
            ref = path.rsplit("/git/refs/heads/", 1)[1]
            self.refs[ref] = body["sha"]
            return httpx.Response(200, json={"ref": ref})
        return httpx.Response(500, json={"message": f"unexpected {request.method} {path}"})

    def files_at(self, ref: str) -> dict[str, bytes]:
        sha = self.refs[ref]
        tree = self.trees[self.commits[sha]["tree"]]
        return {e["path"]: self.blobs[e["sha"]] for e in tree}


@pytest.fixture
def fake_home() -> FakeGitHub:
    return FakeGitHub()


def _build_app(settings: Settings, tmp_path: Path, fake_home: FakeGitHub):
    """The app over the throwaway schema; the renderer from the resolvable source, or unavailable."""
    from backend.app import create_app

    tmp_path.mkdir(parents=True, exist_ok=True)
    template = _resolved_template()
    if template is not None:
        tpl = tmp_path / "template.html"
        tpl.write_bytes(template)
        settings = replace(settings, renderer_file=str(tpl))
    else:
        settings = replace(settings, renderer_file="", renderer_url="", renderer_cache_dir="")
    application = create_app(settings)
    home = application.state.container.home
    home._factory = lambda: httpx.Client(
        base_url=f"http://home.invalid/repos/{home.repository}/", transport=httpx.MockTransport(fake_home.handler)
    )
    return application


@pytest.fixture
def app(settings: Settings, tmp_path: Path, fake_home: FakeGitHub):
    application = _build_app(settings, tmp_path, fake_home)
    yield application
    application.state.container.close()


@pytest.fixture
def client(app) -> Iterator[TestClient]:
    with TestClient(app) as c:
        yield c


@pytest.fixture
def engine(app):
    return app.state.container.engine


@pytest.fixture
def store(app):
    return app.state.container.store


def _free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


@pytest.fixture
def served(settings: Settings, tmp_path: Path, fake_home: FakeGitHub) -> Iterator[str]:
    """A second app instance over the same schema, on a real port: the MCP client needs true HTTP,
    and one app instance can run its lifespan only once."""
    application = _build_app(settings, tmp_path / "served", fake_home)
    port = _free_port()
    config = uvicorn.Config(application, host="127.0.0.1", port=port, log_level="warning")
    server = uvicorn.Server(config)
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    deadline = time.time() + 20
    while time.time() < deadline:
        try:
            httpx.get(f"http://127.0.0.1:{port}/api/health", timeout=1)
            break
        except httpx.TransportError:
            time.sleep(0.1)
    yield f"http://127.0.0.1:{port}"
    server.should_exit = True
    thread.join(timeout=10)
    application.state.container.close()


def six_kind_dataset(session_id: str = "kickoff", version: str = "v1") -> dict[str, Any]:
    """A session carrying all six kinds, honest timeboxes, plan-shaped ids."""
    return {
        "meta": {
            "id": session_id,
            "title": "Delivery Kickoff",
            "eyebrow": "SOFTWARE ENGINEERING",
            "session": "Session 1",
            "date": "2026-09-30",
            "duration": 60,
            "version": version,
            "classification": "Internal",
            "question": "What do we have to be right about before we build",
            "objective": "Every assumption confirmed or owned.",
        },
        "activities": [
            {
                "id": "A1",
                "kind": "frame",
                "name": "Where we are",
                "mins": 5,
                "question": "Context first.",
                "script": {"goal": "Orient.", "run": ["Point."], "say": ["Here we are."], "watch": "Move on."},
                "panels": [
                    {"name": "Now", "phase": "active", "line": "One line.", "done": "nods"},
                    {"name": "Later", "phase": "background", "line": "Context.", "done": "not now", "dim": True},
                ],
            },
            {
                "id": "A2",
                "kind": "collect",
                "name": "The engine",
                "mins": 10,
                "question": "Pin the facts.",
                "script": {"goal": "Facts.", "run": ["Fill."], "say": ["Three facts."], "watch": "Scope."},
                "item": {"id": "ENG-001", "badge": "decided", "title": "The engine", "known": "It exists."},
                "slots": [
                    {"k": "owner", "label": "Owner", "hint": "a person"},
                    {"k": "date", "label": "First date", "hint": "when"},
                ],
            },
            {
                "id": "A3",
                "kind": "walk",
                "name": "Is it true",
                "mins": 15,
                "question": "Does each hold?",
                "prompt": "Does this hold?",
                "script": {"goal": "Stamp.", "run": ["Read."], "say": ["True or not."], "watch": "No debate."},
                "verdicts": [
                    {"k": "true", "label": "True", "tone": "ok"},
                    {
                        "k": "notyet",
                        "label": "Not yet",
                        "tone": "mid",
                        "fields": [{"k": "action", "ph": "what"}, {"k": "who", "ph": "who"}],
                    },
                    {"k": "unknown", "label": "We do not know", "tone": "hot"},
                ],
                "items": [
                    {"id": "STORE-001", "stmt": "Every revision is retrievable", "detail": "Append only."},
                    {"id": "EXP-002", "stmt": "Never forked the renderer", "detail": "Pinned."},
                    {"id": "DOOR-003", "stmt": "No door-only capability", "detail": "Parity."},
                ],
            },
            {
                "id": "A4",
                "kind": "sort",
                "name": "Where it goes",
                "mins": 15,
                "question": "Each in a bucket.",
                "script": {
                    "goal": "Land.",
                    "run": ["Walk the queue."],
                    "say": ["A name on each."],
                    "watch": "None merely dated.",
                },
                "buckets": [
                    {"k": "now", "label": "This phase", "tone": "ok", "fields": [{"k": "who", "ph": "who"}]},
                    {"k": "next", "label": "Next phase", "tone": "mid"},
                    {"k": "drop", "label": "Drop", "tone": "hot"},
                ],
                "items": [
                    {
                        "id": "PLAN-001",
                        "name": "Plan export",
                        "ask": "Ship it?",
                        "owner": "R. Pires",
                        "when": "asked for 2026-09-18",
                    },
                    {
                        "id": "ARCH-002",
                        "name": "Docs onboarded",
                        "ask": "This phase?",
                        "owner": "A. Ferreira",
                        "when": "asked for 2026-09-25",
                    },
                ],
            },
            {
                "id": "A5",
                "kind": "assign",
                "name": "Who carries it",
                "mins": 5,
                "question": "Names against seats.",
                "script": {
                    "goal": "Names.",
                    "run": ["Type each."],
                    "say": ["Each row is a person."],
                    "watch": "Authority.",
                },
                "rows": [
                    {"id": "R1", "name": "The first seat", "evidence": "Signs.", "editable": True, "ph": "name"},
                    {"id": "R2", "name": "A fixed seat", "evidence": "Held.", "who": "held"},
                ],
            },
            {
                "id": "A6",
                "kind": "close",
                "name": "Read back",
                "mins": 10,
                "question": "Everything recorded.",
                "script": {
                    "goal": "Replay.",
                    "run": ["Read."],
                    "say": ["This is what we decided."],
                    "watch": "Protect.",
                },
            },
        ],
    }
