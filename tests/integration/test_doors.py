"""The API door serves every port (019), the MCP door mirrors it (020), and all three doors adapt one
port set with no door-only capability (021)."""

from __future__ import annotations

import json
import re

import pytest
from mcp import ClientSession
from mcp.client.streamable_http import streamable_http_client
from pytest_intent import intent

from backend.adapters.api.routes import PORT_ROUTES
from backend.adapters.mcp.server import PORT_TOOLS
from backend.core.ports.inbound import INBOUND_PORTS
from tests.conftest import REPO, six_kind_dataset


@pytest.fixture
def anyio_backend():
    return "asyncio"


@intent("INT-WORKSHOPS-019")
def test_the_api_door_serves_the_dataset_and_the_export_at_the_pinned_routes(client, app) -> None:
    served = {
        f"{m.upper()} {path}" for path, ops in app.openapi()["paths"].items() for m in ops if path.startswith("/api/")
    }
    for port in INBOUND_PORTS:
        for route in PORT_ROUTES[port]:
            assert route in served, f"{port}: {route} is not served"
    created = client.post("/api/sessions", json={"title": "Kickoff", "dataset": six_kind_dataset()})
    sid = created.json()["id"]
    got = client.get(f"/api/sessions/{sid}")
    assert got.status_code == 200 and got.json()["revision"]["dataset"]["meta"]["title"] == "Delivery Kickoff"
    assert client.get(f"/api/sessions/{sid}/revisions/1").json()["dataset"] == six_kind_dataset()
    run = client.post(f"/api/sessions/{sid}/runs", json={"kind": "rehearsal"}).json()
    assert client.get(f"/api/runs/{run['id']}").json()["kind"] == "rehearsal"
    assert client.get("/api/health").json()["status"] == "ok"


@intent("INT-WORKSHOPS-019")
def test_the_api_door_serves_the_exported_artifact(client, renderer_ready) -> None:
    sid = client.post("/api/sessions", json={"title": "Kickoff", "dataset": six_kind_dataset()}).json()["id"]
    export = client.get(f"/api/sessions/{sid}/export")
    assert export.status_code == 200 and export.headers["content-type"].startswith("text/html")
    assert export.headers["X-Renderer"].startswith("sha256:")


@intent("INT-WORKSHOPS-020")
@pytest.mark.anyio
async def test_every_port_is_one_mcp_tool_answering_what_the_api_route_answers(served, client, engine) -> None:
    async with streamable_http_client(f"{served}/mcp/") as (read, write, _), ClientSession(read, write) as mcp:
        await mcp.initialize()
        tools = {t.name for t in (await mcp.list_tools()).tools}
        for port in INBOUND_PORTS:
            assert set(PORT_TOOLS[port]) <= tools, f"{port}: tool missing"
        dataset = six_kind_dataset()
        created = await mcp.call_tool("create_session", {"title": "Kickoff", "dataset": dataset})
        sid = created.structuredContent["id"]
        via_mcp = (await mcp.call_tool("get_session", {"session_id": sid})).structuredContent
        via_api = client.get(f"/api/sessions/{sid}").json()
        assert via_mcp["revision"]["dataset"] == via_api["revision"]["dataset"] == dataset
        assert via_mcp["shelf_state"] == via_api["shelf_state"]
        run = (await mcp.call_tool("start_run", {"session_id": sid, "kind": "session"})).structuredContent
        landed = await mcp.call_tool(
            "land_capture", {"run_id": run["id"], "capture": {"STORE-001": {"mark": "true"}}, "close": False}
        )
        assert landed.structuredContent["capture"] == {"STORE-001": {"mark": "true"}}
        assert (
            client.get(f"/api/runs/{run['id']}").json()
            == (await mcp.call_tool("get_run", {"run_id": run["id"]})).structuredContent
        )
        plan = (await mcp.call_tool("export_plan", {"run_id": run["id"]})).structuredContent
        assert plan == client.get(f"/api/runs/{run['id']}/plan-export").json()
        assert [s["id"] for s in (await mcp.call_tool("list_sessions", {})).structuredContent["result"]] == [
            s["id"] for s in client.get("/api/sessions").json()
        ]
        pubs = (await mcp.call_tool("list_publications", {})).structuredContent["result"]
        assert pubs == client.get("/api/publications").json()


@intent("INT-WORKSHOPS-020")
@pytest.mark.anyio
async def test_the_mcp_doors_export_close_and_publish_answer_what_the_api_answers(
    served, client, engine, renderer_ready
) -> None:
    async with streamable_http_client(f"{served}/mcp/") as (read, write, _), ClientSession(read, write) as mcp:
        await mcp.initialize()
        created = await mcp.call_tool("create_session", {"title": "Kickoff", "dataset": six_kind_dataset()})
        sid = created.structuredContent["id"]
        export = (await mcp.call_tool("export_artifact", {"session_id": sid})).structuredContent
        api_export = client.get(f"/api/sessions/{sid}/export")
        assert (
            export["html"].encode("utf-8") == api_export.content
            and export["sha256"] == api_export.headers["X-Artifact-SHA256"]
        )
        run = (await mcp.call_tool("start_run", {"session_id": sid, "kind": "session"})).structuredContent
        landed = await mcp.call_tool(
            "land_capture", {"run_id": run["id"], "capture": {"STORE-001": {"mark": "true"}}, "close": True}
        )
        assert landed.structuredContent["state"] == "closed"
        assert (
            client.get(f"/api/runs/{run['id']}").json()
            == (await mcp.call_tool("get_run", {"run_id": run["id"]})).structuredContent
        )
        published = (await mcp.call_tool("publish_export", {"session_id": sid})).structuredContent
        assert published["id"] == client.get("/api/publications").json()[0]["id"]


@intent("INT-WORKSHOPS-021")
def test_the_three_doors_adapt_one_port_set_and_no_door_carries_a_capability_the_others_cannot_reach() -> None:
    assert set(PORT_ROUTES) == set(PORT_TOOLS) == set(INBOUND_PORTS)
    ui = json.loads((REPO / "frontend" / "src" / "api" / "ports.json").read_text(encoding="utf-8"))
    assert set(ui) == set(INBOUND_PORTS), "the UI door does not reach every port"
    for port in INBOUND_PORTS:
        assert PORT_ROUTES[port] and PORT_TOOLS[port] and ui[port], f"{port} is missing a door"
    # No door-only capability: every API route and every MCP tool is a declared adaptation of a port.
    from backend.adapters.api import routes as api_routes

    declared_routes = {r for rs in PORT_ROUTES.values() for r in rs}
    actual = {f"{list(r.methods)[0]} /api{r.path}" for r in api_routes.router.routes if hasattr(r, "methods")}
    assert actual == declared_routes
    from backend.adapters.mcp import server as mcp_module

    source = (REPO / "backend" / "adapters" / "mcp" / "server.py").read_text(encoding="utf-8")
    actual_tools = set(re.findall(r"@server\.tool\(\)\s+def (\w+)\(", source))
    assert actual_tools == {t for ts in PORT_TOOLS.values() for t in ts}
    assert mcp_module.PORT_TOOLS is PORT_TOOLS
    # The UI's declared routes are routes the API serves.
    for port, routes in ui.items():
        assert set(routes) <= declared_routes, f"the UI reaches {port} through a route the API does not declare"
