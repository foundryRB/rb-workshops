"""The FastAPI application: the API door, the MCP door, and the built SPA, behind the gate."""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import RedirectResponse

from backend import __version__
from backend.adapters.api import routes, system
from backend.adapters.api.auth import install_auth
from backend.adapters.api.errors import install_error_handlers
from backend.adapters.api.spa import SpaStaticFiles
from backend.adapters.mcp.server import build_mcp_server
from backend.config import Settings, load_settings
from backend.container import Container

__all__ = ["create_app"]


def create_app(settings: Settings | None = None) -> FastAPI:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    settings = settings or load_settings()
    container = Container(settings)
    mcp_server = build_mcp_server(container.engine, settings.mcp_allowed_hosts)

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        async with mcp_server.session_manager.run():
            yield
        container.close()

    app = FastAPI(title="rb-workshops", version=__version__, lifespan=lifespan)
    app.state.container = container
    install_auth(app, settings)
    install_error_handlers(app)
    app.include_router(system.router, prefix="/api", tags=["system"])
    app.include_router(routes.router, prefix="/api", tags=["ports"])

    @app.api_route("/mcp", methods=["GET", "POST", "DELETE"], include_in_schema=False)
    async def _mcp_redirect() -> RedirectResponse:
        return RedirectResponse(url="/mcp/", status_code=307)

    app.mount("/mcp", mcp_server.streamable_http_app())

    static = Path(settings.static_dir)
    if static.is_dir():
        app.mount("/", SpaStaticFiles(directory=str(static), html=True), name="app")
    return app
