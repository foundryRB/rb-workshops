"""A renderer source that does not answer leaves the engine up with the renderer unavailable."""

from __future__ import annotations

import pytest

from backend.adapters.renderer.source import fetch_over_mcp, resolve_template
from backend.core.errors import RendererUnavailable
from tests.conftest import PIN


@pytest.mark.parametrize("url", ["http://127.0.0.1:9/mcp/", "http://renderer-source.invalid/mcp/"])
def test_an_unreachable_source_is_the_renderer_being_unavailable_not_an_exception(url: str) -> None:
    with pytest.raises(RendererUnavailable) as caught:
        fetch_over_mcp(url, "u", "p", timeout=2.0)
    assert "did not answer" in str(caught.value)
    with pytest.raises(RendererUnavailable):
        resolve_template(PIN, file="", cache_dir="", url=url, user="u", password="p")


def test_the_engine_starts_with_an_unreachable_source_and_reports_it(settings, tmp_path) -> None:
    import time
    from dataclasses import replace

    from backend.app import create_app

    app = create_app(
        replace(
            settings,
            renderer_file="",
            renderer_cache_dir="",
            renderer_url="http://127.0.0.1:9/mcp/",
            renderer_user="u",
            renderer_password="p",
        )
    )
    try:
        container = app.state.container
        # The first attempt runs on the retry thread, so the engine listens at once; it settles within the bound.
        deadline = time.monotonic() + 15
        while container.renderer_state == "unresolved" and time.monotonic() < deadline:
            time.sleep(0.2)
        assert container.renderer_state != "ready"
        assert "did not answer" in container.renderer_state
        from fastapi.testclient import TestClient

        with TestClient(app) as client:
            started = time.monotonic()
            health = client.get("/api/health").json()
            assert time.monotonic() - started < 2.0, "the probe must never wait on the renderer's source"
            assert health["status"] == "ok" and health["renderer_available"] is False
            assert client.get("/api/doors").json()["renderer"]["available"] is False
            sid = client.post("/api/sessions", json={"title": "Up without a renderer"}).json()["id"]
            assert client.get(f"/api/sessions/{sid}/export").status_code == 503
    finally:
        container.close()
