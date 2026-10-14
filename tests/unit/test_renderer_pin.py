"""The renderer is consumed at a pin and never forked (017); the capture bridge's key rule is
asserted against the pinned template (029)."""

from __future__ import annotations

import hashlib
import re
import subprocess
from pathlib import Path

from pytest_intent import intent

from backend.adapters.renderer.pin import read_pin
from backend.adapters.renderer.renderer import PinnedRenderer
from tests.conftest import PIN, REPO, six_kind_dataset

# Lines only the canonical template carries, across its stylesheet, its dataset block and its
# renderer: a file holding every one of them is the template or a fork of it, while a test
# that quotes the storage-key rule alone is not.
_TEMPLATE_MARKS = (
    'id="session-data"',
    'var STORE_KEY = "ws-" + M.id + "-" + M.version;',
    "function buildSort(a) {",
    "function captureText() {",
    ".ovlbox textarea{",
    ".rtop .rtime b{",
    "/* PRESS palette */",
)


def _tracked_files() -> list[Path]:
    out = subprocess.run(["git", "-C", str(REPO), "ls-files", "-z"], capture_output=True, check=True).stdout
    return [REPO / p for p in out.decode().split("\0") if p]


@intent("INT-WORKSHOPS-017")
def test_the_repository_carries_the_pin_and_no_copy_of_the_template() -> None:
    pin = read_pin(REPO / "renderer.lock")
    assert re.fullmatch(r"[0-9a-f]{64}", pin.sha256)
    assert "bootstrap-workshop" in pin.source
    offenders = []
    for path in _tracked_files():
        # This file quotes the marks it hunts for; every other tracked file is judged.
        if path == Path(__file__).resolve() or path.suffix in {".woff2", ".png", ".svg"} or not path.is_file():
            continue
        text = path.read_bytes()
        if all(mark.encode() in text for mark in _TEMPLATE_MARKS):
            offenders.append(str(path.relative_to(REPO)))
    assert offenders == [], f"a copy of the canonical template is inside the tree: {offenders}"


@intent("INT-WORKSHOPS-017")
def test_a_render_records_the_renderer_it_was_produced_by(template_bytes: bytes) -> None:
    assert hashlib.sha256(template_bytes).hexdigest() == PIN.sha256
    renderer = PinnedRenderer(template_bytes, PIN.label)
    assert renderer.pin == f"sha256:{PIN.sha256}"
    html = renderer.render(six_kind_dataset())
    assert b'id="session-data"' in html
    # The export itself stays the canonical bytes; the pin travels beside it, never inside it.
    assert PIN.sha256.encode() not in html


@intent("INT-WORKSHOPS-029")
def test_the_bridge_derives_the_slot_key_by_the_pinned_renderers_rule(template_bytes: bytes) -> None:
    assert hashlib.sha256(template_bytes).hexdigest() == PIN.sha256
    template = template_bytes.decode("utf-8")
    m = re.search(r'var STORE_KEY = "(ws-)" \+ M\.id \+ "(-)" \+ M\.version;', template)
    assert m, "the pinned template no longer derives its storage key as ws-<id>-<version>"
    bridge = (REPO / "frontend" / "src" / "bridge" / "captureKey.ts").read_text(encoding="utf-8")
    rule = re.search(r'return\s+"(ws-)"\s*\+\s*meta\.id\s*\+\s*"(-)"\s*\+\s*meta\.version', bridge)
    assert rule, "the capture bridge does not derive the key as ws-<id>-<version>"
    assert (m.group(1), m.group(2)) == (rule.group(1), rule.group(2))
