"""The walking skeleton's claim, attested against the served document.

INT-WORKSHOPS-001 stays active and unrevved through the retrofit: the
statement still holds of the engine's browser surface, so only this test
moved off the Dockerfile's string assertions and onto the document the app
serves at the root path.
"""

from __future__ import annotations

from pathlib import Path

from pytest_intent import intent

_REPO = Path(__file__).resolve().parents[1]


@intent("INT-WORKSHOPS-001")
def test_the_landing_page_is_served_at_the_root_path(client) -> None:
    page = _REPO / "app" / "index.html"
    assert page.is_file(), "the built document lives at app/index.html"
    response = client.get("/")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/html")
    assert "<html" in response.text.lower()
    assert response.text == page.read_text(encoding="utf-8")
