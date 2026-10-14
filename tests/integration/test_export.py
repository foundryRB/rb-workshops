"""Byte-identity with a fresh render by the pinned renderer (016); plan ids verbatim (023)."""

from __future__ import annotations

import hashlib
import html as html_mod
import json
import re

from pytest_intent import intent

from backend.core.model import RunKind
from tests.conftest import PIN, six_kind_dataset


def fresh_render(template: bytes, dataset: dict) -> bytes:
    """An independent render: the pinned bytes, the dataset written into the session-data block,
    the title into the document. Written here, not imported, so the comparison means something."""
    text = template.decode("utf-8")
    start = text.index('<script type="application/json" id="session-data">') + len(
        '<script type="application/json" id="session-data">'
    )
    end = text.index("</script>", start)
    escaped = (
        json.dumps(dataset, indent=2, ensure_ascii=False)
        .replace("&", "\\u0026")
        .replace("<", "\\u003c")
        .replace(">", "\\u003e")
    )
    body = "\n" + escaped + "\n"
    out = text[:start] + body + text[end:]
    return out.replace("__TITLE__", html_mod.escape(dataset["meta"]["title"], quote=False)).encode("utf-8")


@intent("INT-WORKSHOPS-016")
def test_the_export_is_one_self_contained_file_equal_to_a_fresh_render(
    client, engine, template_bytes, renderer_ready
) -> None:
    assert hashlib.sha256(template_bytes).hexdigest() == PIN.sha256
    dataset = six_kind_dataset()
    session = engine.create_session("Kickoff", dataset, "api", "t")
    response = client.get(f"/api/sessions/{session.id}/export")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/html")
    exported = response.content
    expected = fresh_render(template_bytes, dataset)
    assert hashlib.sha256(exported).hexdigest() == hashlib.sha256(expected).hexdigest()
    assert response.headers["X-Artifact-SHA256"] == hashlib.sha256(expected).hexdigest()
    assert response.headers["X-Renderer"] == PIN.label
    # Self-contained: the dataset and the fixed inline renderer, in one document, no external script.
    text = exported.decode("utf-8")
    block = re.search(r'<script type="application/json" id="session-data">(.*?)</script>', text, re.DOTALL)
    assert block and json.loads(block.group(1)) == dataset
    assert 'var STORE_KEY = "ws-" + M.id + "-" + M.version;' in text
    assert not re.search(r"<script[^>]+src=", text)
    # A closed run's frozen artifact is the same bytes.
    run = engine.start_run(session.id, RunKind.SESSION, None)
    engine.land_capture(run.id, {}, close=True)
    assert client.get(f"/api/runs/{run.id}/artifact").content == expected


@intent("INT-WORKSHOPS-016")
def test_no_authored_string_can_close_the_artifacts_dataset_block(client, engine, renderer_ready) -> None:
    dataset = six_kind_dataset()
    dataset["meta"]["question"] = 'x</script><img src=x onerror="alert(1)"><!-- & -->'
    dataset["activities"][2]["items"][0]["stmt"] = "</SCRIPT >&amp;"
    session = engine.create_session("Hostile", dataset, "api", "t")
    exported = client.get(f"/api/sessions/{session.id}/export").content.decode("utf-8")
    block = re.search(r'<script type="application/json" id="session-data">(.*?)</script>', exported, re.DOTALL)
    assert block is not None
    inner = block.group(1)
    assert "<" not in inner and ">" not in inner and "&" not in inner
    assert json.loads(inner) == dataset
    # The document holds exactly the template's own elements after the block: nothing injected.
    after = exported[block.end() :]
    assert "<img" not in after and "onerror" not in after
    assert exported.count("<script") == 2


@intent("INT-WORKSHOPS-023")
def test_the_plan_export_carries_each_item_under_its_plan_id_verbatim(client, engine) -> None:
    dataset = six_kind_dataset()
    session = engine.create_session("Kickoff", dataset, "api", "t")
    run = engine.start_run(session.id, RunKind.SESSION, None)
    capture = {
        "STORE-001": {"mark": "true"},
        "EXP-002": {"mark": "notyet", "fields": {"action": "pin the renderer", "who": "A. Ferreira"}},
        "PLAN-001": {"mark": "now", "fields": {"who": "R. Pires"}},
        "A2": {"slots": {"owner": "R. Pires"}},
        "R1": {"closer": "A. Ferreira"},
    }
    engine.land_capture(run.id, capture, close=False)
    plan = client.get(f"/api/runs/{run.id}/plan-export").json()
    authored = {"STORE-001", "EXP-002", "DOOR-003", "PLAN-001", "ARCH-002", "ENG-001", "R1"}
    assert {i["id"] for i in plan["items"]} == authored
    assert all(re.fullmatch(r"[A-Z]+-\d+|R\d", i["id"]) for i in plan["items"])
    by_id = {i["id"]: i for i in plan["items"] if i["kind"] != "collect"}
    assert by_id["EXP-002"]["outcome"]["label"] == "Not yet" and by_id["EXP-002"]["fields"] == {
        "action": "pin the renderer",
        "who": "A. Ferreira",
    }
    assert by_id["DOOR-003"]["open"] is True
    assert set(plan["unresolved"]) == {"DOOR-003", "ARCH-002"} | {"ENG-001"}
    assert all(set(row["refs"]) <= authored for row in plan["log"])
    assert plan["renderer"] == PIN.label
    assert plan["run"]["closed_at"] is None
