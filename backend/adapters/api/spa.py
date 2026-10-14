"""The built SPA document, served at the root with a client-side routing fallback.

A path that is no file and looks like a page (no extension) is the app's to
route, so it gets index.html; a missing asset stays a 404; the machine doors
keep their own 404s. HTML is never cached, so a page load requests the current
asset paths.
"""

from __future__ import annotations

from pathlib import PurePosixPath

from starlette.exceptions import HTTPException
from starlette.responses import Response
from starlette.staticfiles import StaticFiles
from starlette.types import Scope

__all__ = ["SpaStaticFiles"]

_MACHINE_DOORS = ("api", "mcp")


class SpaStaticFiles(StaticFiles):
    async def get_response(self, path: str, scope: Scope) -> Response:
        try:
            response = await super().get_response(path, scope)
        except HTTPException as exc:
            if exc.status_code != 404 or not _is_page(path):
                raise
            response = await super().get_response("index.html", scope)
        if response.status_code == 404 and _is_page(path):
            response = await super().get_response("index.html", scope)
        if response.headers.get("content-type", "").startswith("text/html"):
            response.headers["Cache-Control"] = "no-store"
        return response


def _is_page(path: str) -> bool:
    parts = PurePosixPath(path.replace("\\", "/")).parts
    if parts and parts[0] in _MACHINE_DOORS:
        return False
    return PurePosixPath(path).suffix == ""
