"""The open health route, the doors facts, and the machine door's credential hand-off."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from backend import __version__
from backend.adapters.api.routes import PORT_ROUTES
from backend.core.ports.inbound import INBOUND_PORTS

__all__ = ["router"]

router = APIRouter()


def _renderer_ready(container) -> bool:
    """A read of the renderer's state, never I/O: the probe must not wait on a third-party door.
    The container re-tries the resolution on its own thread while unresolved."""
    return container.renderer_state == "ready"


@router.get("/health")
def health(request: Request) -> dict[str, Any]:
    container = request.app.state.container
    ready = _renderer_ready(container)
    return {
        "status": "ok",
        "version": __version__,
        "build": container.settings.build,
        "renderer": container.pin.label,
        "renderer_available": ready,
        "database": "postgresql",
    }


@router.get("/doors")
def doors(request: Request) -> dict[str, Any]:
    """The port table as the doors page renders it, from the adapters' own declarations."""
    from backend.adapters.mcp.server import PORT_TOOLS

    container = request.app.state.container
    ready = _renderer_ready(container)
    return {
        "ports": [{"port": port, "api": PORT_ROUTES[port], "mcp": PORT_TOOLS[port]} for port in INBOUND_PORTS],
        "renderer": {
            "pin": container.pin.label,
            "source": container.pin.source,
            "pinned": container.pin.pinned,
            "available": ready,
            "state": container.renderer_state,
        },
        "home": {
            "repository": container.home.repository,
            "ref": container.home.ref,
            "path": container.home.path_template,
            "configured": container.home.configured,
        },
        "mcp": {"path": "/mcp", "configured": bool(container.settings.auth_user and container.settings.auth_password)},
    }


@router.get("/doors/mcp-credential")
def mcp_credential(request: Request) -> Any:
    """The machine door's key, handed to a signed-in person: this route sits behind the sign-in."""
    settings = request.app.state.container.settings
    if not (settings.auth_user and settings.auth_password):
        return JSONResponse(status_code=503, content={"detail": "the machine door's key is not provisioned"})
    host = settings.public_host or request.headers.get("host", "localhost")
    scheme = "https" if settings.public_host else request.url.scheme
    return {
        "user": settings.auth_user,
        "password": settings.auth_password,
        "url": f"{scheme}://{host}/mcp",
        "connect": f"claude mcp add --transport http vf-workshops {scheme}://{host}/mcp "
        f'--header "Authorization: Basic <base64 of {settings.auth_user}:<password>>"',
    }
