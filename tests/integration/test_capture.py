"""Runs: a landed capture is the engine's record (013), each run its own (014), a closed run frozen (015)."""

from __future__ import annotations

import psycopg
import pytest
from mcp import ClientSession
from mcp.client.streamable_http import streamable_http_client
from pytest_intent import intent

from backend.core.errors import RunClosed
from backend.core.model import RunKind
from tests.conftest import six_kind_dataset

CAPTURE = {"STORE-001": {"mark": "true"}, "EXP-002": {"mark": "notyet", "fields": {"action": "pin it", "who": "A. F."}}}


@pytest.fixture
def anyio_backend():
    return "asyncio"


@intent("INT-WORKSHOPS-013")
@pytest.mark.anyio
async def test_a_landed_capture_is_readable_through_the_api_and_mcp_doors(client, served, engine) -> None:
    session = engine.create_session("Kickoff", six_kind_dataset(), "api", "t")
    run = engine.start_run(session.id, RunKind.SESSION, None)
    landed = client.post(f"/api/runs/{run.id}/capture", json={"capture": CAPTURE, "close": False})
    assert landed.status_code == 200, landed.text
    # Read back with no browser context: the API door...
    assert client.get(f"/api/runs/{run.id}").json()["capture"] == CAPTURE
    # ...and the MCP door.
    async with streamable_http_client(f"{served}/mcp/") as (read, write, _), ClientSession(read, write) as mcp:
        await mcp.initialize()
        got = await mcp.call_tool("get_run", {"run_id": run.id})
        assert not got.isError
        assert (
            got.structuredContent["capture"] == CAPTURE
            if got.structuredContent
            else CAPTURE["STORE-001"]["mark"] in got.content[0].text
        )


@intent("INT-WORKSHOPS-014")
def test_a_rehearsal_and_a_session_are_separate_runs_with_separate_captures_and_exports(client, engine) -> None:
    session = engine.create_session("Kickoff", six_kind_dataset(), "api", "t")
    rehearsal = engine.start_run(session.id, RunKind.REHEARSAL, None)
    assert rehearsal.kind.value == "rehearsal"
    engine.land_capture(rehearsal.id, {"STORE-001": {"mark": "unknown"}}, close=False)
    live = engine.start_run(session.id, RunKind.SESSION, None)
    assert live.kind.value == "session" and live.id != rehearsal.id
    assert engine.get_run(live.id).capture == {}
    engine.land_capture(live.id, CAPTURE, close=False)
    assert engine.get_run(rehearsal.id).capture == {"STORE-001": {"mark": "unknown"}}
    assert engine.get_run(live.id).capture == CAPTURE
    kinds = {r["id"]: r["kind"] for r in client.get(f"/api/runs?session_id={session.id}").json()}
    assert kinds == {rehearsal.id: "rehearsal", live.id: "session"}
    # Each produces its own export; neither is the other's.
    plan_r = client.get(f"/api/runs/{rehearsal.id}/plan-export").json()
    plan_s = client.get(f"/api/runs/{live.id}/plan-export").json()
    assert plan_r["run"]["kind"] == "rehearsal" and plan_s["run"]["kind"] == "session"
    assert plan_r["items"] != plan_s["items"]


@intent("INT-WORKSHOPS-014")
def test_each_kind_of_run_freezes_its_own_artifact_at_its_close(client, engine, renderer_ready) -> None:
    session = engine.create_session("Kickoff", six_kind_dataset(), "api", "t")
    rehearsal = engine.start_run(session.id, RunKind.REHEARSAL, None)
    live = engine.start_run(session.id, RunKind.SESSION, None)
    engine.land_capture(rehearsal.id, {"STORE-001": {"mark": "unknown"}}, close=True)
    engine.land_capture(live.id, CAPTURE, close=True)
    assert client.get(f"/api/runs/{rehearsal.id}/artifact").status_code == 200
    assert client.get(f"/api/runs/{live.id}/artifact").status_code == 200
    assert engine.get_run(rehearsal.id).capture != engine.get_run(live.id).capture


@intent("INT-WORKSHOPS-015")
@pytest.mark.anyio
async def test_closing_a_run_freezes_it_through_all_three_doors(client, served, engine, store, renderer_ready) -> None:
    session = engine.create_session("Kickoff", six_kind_dataset(), "api", "t")
    run = engine.start_run(session.id, RunKind.SESSION, None)
    engine.land_capture(run.id, CAPTURE, close=False)
    closed = client.post(f"/api/runs/{run.id}/capture", json={"capture": CAPTURE, "close": True})
    assert closed.status_code == 200 and closed.json()["state"] == "closed"
    artifact_before = client.get(f"/api/runs/{run.id}/artifact").content
    sha_before = closed.json()["artifact_sha256"]
    # The core (the UI's door is the API with the UI header).
    with pytest.raises(RunClosed):
        engine.land_capture(run.id, {"STORE-001": {"mark": "unknown"}}, close=False)
    for headers in ({"X-Door": "ui"}, {}):
        again = client.post(f"/api/runs/{run.id}/capture", json={"capture": {"x": 1}, "close": False}, headers=headers)
        assert again.status_code == 409
    async with streamable_http_client(f"{served}/mcp/") as (read, write, _), ClientSession(read, write) as mcp:
        await mcp.initialize()
        refused = await mcp.call_tool("land_capture", {"run_id": run.id, "capture": {"x": 1}, "close": True})
        assert refused.isError
    # Even a direct write as the owner role is refused at the database.
    with store.connection() as conn, pytest.raises(psycopg.errors.RaiseException):
        conn.execute("UPDATE runs SET capture = '{}'::jsonb WHERE id = %s", (run.id,))
    after = client.get(f"/api/runs/{run.id}").json()
    assert after["capture"] == CAPTURE and after["artifact_sha256"] == sha_before
    assert client.get(f"/api/runs/{run.id}/artifact").content == artifact_before
