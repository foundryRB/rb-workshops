"""Publish writes the export to the git-backed home and leaves the session store byte-unchanged (018)."""

from __future__ import annotations

import hashlib
import json

from pytest_intent import intent

from backend.core.model import RunKind
from tests.conftest import six_kind_dataset


@intent("INT-WORKSHOPS-018")
def test_a_publish_lands_on_the_home_ref_and_writes_no_revision_capture_or_run_row(
    client, engine, store, fake_home, renderer_ready
) -> None:
    session = engine.create_session("Kickoff", six_kind_dataset(), "api", "t")
    engine.revise_session(session.id, six_kind_dataset(), "saved", "api", "t")
    run = engine.start_run(session.id, RunKind.SESSION, None)
    engine.land_capture(run.id, {"STORE-001": {"mark": "true"}}, close=True)
    export = client.get(f"/api/sessions/{session.id}/export").content
    counts_before = store.counts()
    fingerprint_before = store.fingerprint()

    published = client.post(f"/api/sessions/{session.id}/publish", json={})
    assert published.status_code == 201, published.text
    body = published.json()
    assert body["ref"] == "home" and body["repository"] == engine._home.repository
    assert body["path"] == f"workshops/{session.id}/2/"
    files = fake_home.files_at("home")
    assert files[f"workshops/{session.id}/2/kickoff.html"] == export
    assert (
        hashlib.sha256(export).hexdigest()
        == body["sha256"]
        == json.loads(files[f"workshops/{session.id}/2/manifest.json"])["sha256"]
    )
    assert fake_home.commits[fake_home.refs["home"]]["message"].startswith("feat(home): publish ")
    assert not any(call.split()[1].endswith("/git/refs/heads/main") for call in fake_home.calls)

    counts_after = store.counts()
    assert counts_after["revisions"] == counts_before["revisions"]
    assert counts_after["runs"] == counts_before["runs"]
    assert counts_after["publications"] == counts_before["publications"] + 1
    assert store.fingerprint() == fingerprint_before
    assert engine.get_session(session.id).shelf_state.value == "published"

    # A second publish of a later revision commits on top of the first, in the same home ref.
    engine.revise_session(session.id, six_kind_dataset(), "again", "api", "t")
    client.post(f"/api/sessions/{session.id}/publish", json={})
    files = fake_home.files_at("home")
    assert {p for p in files if p.endswith(".html")} == {
        f"workshops/{session.id}/2/kickoff.html",
        f"workshops/{session.id}/3/kickoff.html",
    }
    assert len(client.get("/api/publications").json()) == 2
