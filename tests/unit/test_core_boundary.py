"""The core imports no adapter (022): hexagonality as an import-graph fact."""

from __future__ import annotations

import ast
from pathlib import Path

from pytest_intent import intent

from tests.conftest import REPO

CORE = REPO / "backend" / "core"
ADAPTERS = REPO / "backend" / "adapters"


def _imports(path: Path) -> set[str]:
    tree = ast.parse(path.read_text(encoding="utf-8"))
    names: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            names.update(a.name for a in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module:
            names.add(node.module)
    return names


@intent("INT-WORKSHOPS-022")
def test_no_core_module_imports_a_door_the_store_or_the_renderer() -> None:
    forbidden = (
        "backend.adapters",
        "fastapi",
        "mcp",
        "psycopg",
        "httpx",
        "starlette",
        "uvicorn",
        "backend.app",
        "backend.container",
        "backend.config",
    )
    offenders = {}
    for path in CORE.rglob("*.py"):
        bad = sorted(n for n in _imports(path) if n.startswith(forbidden))
        if bad:
            offenders[str(path.relative_to(REPO))] = bad
    assert offenders == {}


@intent("INT-WORKSHOPS-022")
def test_every_adapter_reaches_the_core_only_through_a_port() -> None:
    allowed_core = {
        "backend.core.model",
        "backend.core.errors",
        "backend.core.ports.inbound",
        "backend.core.ports.outbound",
        "backend.core.schema",
    }
    offenders = {}
    for path in ADAPTERS.rglob("*.py"):
        core_imports = {n for n in _imports(path) if n.startswith("backend.core")}
        bad = sorted(core_imports - allowed_core)
        if bad:
            offenders[str(path.relative_to(REPO))] = bad
    assert offenders == {}, "an adapter reaches into the core past its ports"
