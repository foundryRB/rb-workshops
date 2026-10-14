"""The Renderer port over the pinned template: the injection procedure, byte for byte, every time.

The canonical scaffolder (bootstrap.py beside the template) substitutes the
three placeholders and hands the author the example dataset to edit by hand.
The engine does the mechanical half of that edit: it writes the session's
dataset into the `session-data` block, serialized as two-space JSON with a
trailing newline, then substitutes `__TITLE__` in the document title. The
same bytes in give the same bytes out, which is what the byte-identity claim
(EXP-001) asserts against a fresh render.
"""

from __future__ import annotations

import html
import json
import re
from typing import Any

from backend.core.errors import RendererUnavailable

__all__ = ["PinnedRenderer", "UnavailableRenderer", "inject_dataset", "script_safe_json"]

_BLOCK = re.compile(r'(<script type="application/json" id="session-data">)(.*?)(</script>)', re.DOTALL)


# Inside a <script> block the HTML parser reads `</` and `<!--` as markup, whatever the JSON
# string says; every `<`, `>` and `&` is therefore written as its JSON escape, which is
# still valid JSON parsing to the identical dataset, and no string can close the block.
# Nothing else is escaped: the block is data read by JSON.parse, not JavaScript source.
_SCRIPT_SAFE = str.maketrans({"<": "\\u003c", ">": "\\u003e", "&": "\\u0026"})


def script_safe_json(dataset: dict[str, Any]) -> str:
    """Two-space JSON of the dataset that cannot close the script block it is written into."""
    return json.dumps(dataset, indent=2, ensure_ascii=False).translate(_SCRIPT_SAFE)


def inject_dataset(template: str, dataset: dict[str, Any]) -> str:
    """The reference injection procedure: the dataset into the block, the title into the document."""
    body = "\n" + script_safe_json(dataset) + "\n"
    injected, count = _BLOCK.subn(lambda m: m.group(1) + body + m.group(3), template, count=1)
    if count != 1:
        raise RendererUnavailable("the pinned template carries no session-data block")
    title = str((dataset.get("meta") or {}).get("title") or "")
    return injected.replace("__TITLE__", html.escape(title, quote=False))


class PinnedRenderer:
    def __init__(self, template: bytes, pin_label: str) -> None:
        self._template = template.decode("utf-8")
        self._pin = pin_label

    @property
    def pin(self) -> str:
        return self._pin

    def render(self, dataset: dict[str, Any]) -> bytes:
        return inject_dataset(self._template, dataset).encode("utf-8")


class UnavailableRenderer:
    """Stands in when no source resolved: every render refuses, nothing else does."""

    def __init__(self, pin_label: str, reason: str) -> None:
        self._pin = pin_label
        self._reason = reason

    @property
    def pin(self) -> str:
        return self._pin

    @property
    def reason(self) -> str:
        return self._reason

    def render(self, dataset: dict[str, Any]) -> bytes:
        raise RendererUnavailable(self._reason)
