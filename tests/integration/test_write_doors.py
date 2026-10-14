"""Every write door validates through the same validator; an invalid revision is stored by none (009)."""

from __future__ import annotations

import copy

import pytest
from mcp import ClientSession
from mcp.client.streamable_http import streamable_http_client
from pytest_intent import intent

from tests.conftest import six_kind_dataset


def _broken() -> dict:
    data = six_kind_dataset()
    data["activities"][2]["kind"] = "debate"
    data["activities"][5]["mins"] = 99
    return data


@intent("INT-WORKSHOPS-009")
def test_the_api_door_and_the_ui_door_refuse_the_same_invalid_revision(client, engine) -> None:
    created = client.post(
        "/api/sessions", json={"title": "Kickoff", "dataset": six_kind_dataset()}, headers={"X-Door": "ui"}
    )
    assert created.status_code == 201, created.text
    sid = created.json()["id"]
    before = len(engine.list_revisions(sid))
    for door in ({"X-Door": "ui"}, {}):
        refused = client.post(
            f"/api/sessions/{sid}/revisions", json={"dataset": _broken(), "note": "bad"}, headers=door
        )
        assert refused.status_code == 422
        rows = {r["row"]: r for r in refused.json()["report"]["rows"]}
        assert not rows["kinds"]["ok"] and not rows["timeboxes"]["ok"]
    assert len(engine.list_revisions(sid)) == before
    # The validator the UI re-evaluates on each change is the same one, through the same door.
    live = client.post("/api/validate", json={"dataset": _broken()}, headers={"X-Door": "ui"})
    assert live.status_code == 200 and not live.json()["ok"]
    good = client.post(
        f"/api/sessions/{sid}/revisions", json={"dataset": six_kind_dataset(), "note": "ok"}, headers={"X-Door": "ui"}
    )
    assert good.status_code == 201
    assert engine.get_revision(sid, None)["door"] == "ui"


@intent("INT-WORKSHOPS-009")
@pytest.mark.anyio
async def test_the_mcp_door_refuses_the_same_invalid_revision_and_stores_nothing(served, engine) -> None:
    session = engine.create_session("Kickoff", six_kind_dataset(), "api", "t")
    before = len(engine.list_revisions(session.id))
    async with streamable_http_client(f"{served}/mcp/") as (read, write, _), ClientSession(read, write) as mcp:
        await mcp.initialize()
        result = await mcp.call_tool("revise_session", {"session_id": session.id, "dataset": _broken(), "note": "bad"})
        assert result.isError, result
        text = " ".join(c.text for c in result.content if hasattr(c, "text"))
        assert "Kind contracts" in text or "kind" in text
        created = await mcp.call_tool("create_session", {"title": "Bad", "dataset": _broken()})
        assert created.isError
        ok = await mcp.call_tool(
            "revise_session", {"session_id": session.id, "dataset": copy.deepcopy(six_kind_dataset()), "note": "ok"}
        )
        assert not ok.isError, ok
    assert len(engine.list_revisions(session.id)) == before + 1
    assert engine.get_revision(session.id, None)["door"] == "mcp"


@pytest.fixture
def anyio_backend():
    return "asyncio"
