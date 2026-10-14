"""The engine's own fail-closed gate (REF-Foundry section 4, ADR-006).

People reach the human surfaces through the identity realm's oauth2-proxy
sidecar, and the engine serves them only under WORKSHOPS_AUTH_SCOPE=mcp, the
shape the chart runs beside that sidecar; under any other value they answer
503. The machine door, /mcp, takes the engine's own HTTP Basic key: 503 while
the key is unset, 401 on a missing or wrong credential. /api/health answers
without credentials so probes work. WORKSHOPS_AUTH_DISABLED=true (local runs,
the self-contained suites) turns the gate off.
"""

from __future__ import annotations

import base64
import logging
import secrets

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, Response
from starlette.middleware.base import RequestResponseEndpoint

from backend.config import Settings

__all__ = ["install_auth"]

_log = logging.getLogger("workshops.auth")
_EXEMPT_PATHS = frozenset({"/api/health"})
_MCP_PREFIX = "/mcp"


def _is_mcp_door(path: str) -> bool:
    return path == _MCP_PREFIX or path.startswith(_MCP_PREFIX + "/")


def install_auth(app: FastAPI, settings: Settings) -> None:
    configured = bool(settings.auth_user and settings.auth_password)
    fronted = settings.auth_scope == "mcp"
    disabled = settings.auth_disabled
    if disabled:
        _log.warning("the gate is DISABLED; do not expose this instance publicly")
    elif not fronted:
        _log.error("WORKSHOPS_AUTH_SCOPE is not mcp: no sign-in is declared in front, the human surfaces answer 503")
    if not disabled and not configured:
        _log.error("the /mcp key is not configured; /mcp answers 503 until it is")

    @app.middleware("http")
    async def _gate(request: Request, call_next: RequestResponseEndpoint) -> Response:
        path = request.url.path
        if disabled or path in _EXEMPT_PATHS:
            return await call_next(request)
        if not _is_mcp_door(path):
            if fronted:
                return await call_next(request)
            return JSONResponse(status_code=503, content={"detail": "served only behind the identity realm's sign-in"})
        if not configured:
            return JSONResponse(status_code=503, content={"detail": "authentication is not configured"})
        if _is_authorized(request, settings.auth_user, settings.auth_password):
            return await call_next(request)
        return Response(status_code=401, headers={"WWW-Authenticate": 'Basic realm="rb-workshops"'})


def _is_authorized(request: Request, user: str, password: str) -> bool:
    scheme, _, encoded = request.headers.get("Authorization", "").partition(" ")
    if scheme.lower() != "basic" or not encoded:
        return False
    try:
        decoded = base64.b64decode(encoded, validate=True).decode("utf-8")
    except (ValueError, UnicodeDecodeError):
        return False
    got_user, separator, got_password = decoded.partition(":")
    if not separator:
        return False
    return secrets.compare_digest(got_user, user) and secrets.compare_digest(got_password, password)
