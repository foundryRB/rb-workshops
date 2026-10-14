"""The store: append-only revisions (006) and the forward-only shelf lifecycle (007)."""

from __future__ import annotations

import copy

import psycopg
import pytest
from pytest_intent import intent

from backend.core.errors import NotFound
from tests.conftest import six_kind_dataset


@intent("INT-WORKSHOPS-006")
def test_saving_a_revision_appends_and_no_write_path_mutates_a_stored_one(engine, store) -> None:
    session = engine.create_session("Kickoff", six_kind_dataset(), "api", "t")
    first = engine.get_revision(session.id, 1)["dataset"]
    second = copy.deepcopy(first)
    second["meta"]["title"] = "Kickoff, revised"
    engine.revise_session(session.id, second, "renamed", "api", "t")
    third = copy.deepcopy(second)
    third["activities"][2]["items"][0]["stmt"] = "Every revision we ever wrote is retrievable"
    engine.revise_session(session.id, third, "reworded", "api", "t")
    assert engine.get_session(session.id).current_revision == 3
    assert engine.get_revision(session.id, 1)["dataset"] == first
    assert engine.get_revision(session.id, 2)["dataset"] == second
    assert engine.get_revision(session.id, 3)["dataset"] == third
    # No write path exists: the store port has no update or delete of a revision...
    assert not any(name.startswith(("update_revision", "delete_revision", "replace_revision")) for name in dir(store))
    # ...and the database refuses one outright, even as the owner role.
    with store.connection() as conn, pytest.raises(psycopg.errors.RaiseException):
        conn.execute("UPDATE revisions SET note = 'rewritten' WHERE session_id = %s AND number = 1", (session.id,))
    with store.connection() as conn, pytest.raises(psycopg.errors.RaiseException):
        conn.execute("DELETE FROM revisions WHERE session_id = %s AND number = 2", (session.id,))
    assert engine.get_revision(session.id, 1)["note"] == "created"
    with pytest.raises(NotFound):
        engine.get_revision(session.id, 4)


@intent("INT-WORKSHOPS-007")
def test_the_shelf_state_starts_ephemeral_becomes_draft_and_never_runs_backwards(engine, store) -> None:
    session = engine.create_session("Kickoff", six_kind_dataset(), "api", "t")
    assert session.shelf_state.value == "ephemeral"
    revised = engine.revise_session(session.id, engine.get_revision(session.id, 1)["dataset"], "first save", "api", "t")
    assert revised.shelf_state.value == "draft"
    engine.revise_session(session.id, engine.get_revision(session.id, 1)["dataset"], "second save", "api", "t")
    assert engine.get_session(session.id).shelf_state.value == "draft"
    with store.connection() as conn, pytest.raises(psycopg.errors.RaiseException):
        conn.execute("UPDATE sessions SET shelf_state = 'ephemeral' WHERE id = %s", (session.id,))
    assert {s.shelf_state.value for s in engine.list_sessions(None)} <= {"ephemeral", "draft", "published"}


@intent("INT-WORKSHOPS-007")
def test_the_first_publish_moves_a_session_to_published_for_good(engine, store, fake_home, renderer_ready) -> None:
    session = engine.create_session("Kickoff", six_kind_dataset(), "api", "t")
    engine.revise_session(session.id, engine.get_revision(session.id, 1)["dataset"], "first save", "api", "t")
    engine.publish_export(session.id, None)
    assert engine.get_session(session.id).shelf_state.value == "published"
    engine.revise_session(session.id, engine.get_revision(session.id, 1)["dataset"], "after publish", "api", "t")
    assert engine.get_session(session.id).shelf_state.value == "published"
    for backwards in ("draft", "ephemeral"):
        with store.connection() as conn, pytest.raises(psycopg.errors.RaiseException):
            conn.execute("UPDATE sessions SET shelf_state = %s WHERE id = %s", (backwards, session.id))
    assert {s.shelf_state.value for s in engine.list_sessions(None)} <= {"ephemeral", "draft", "published"}
