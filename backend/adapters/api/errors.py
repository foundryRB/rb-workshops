"""The core's refusals as HTTP refusals."""

from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from backend.adapters.api.dto import report_dto
from backend.core.errors import (
    EngineError,
    HomeRefRefused,
    InvalidSession,
    NotFound,
    PublishFailed,
    RendererPinMismatch,
    RendererUnavailable,
    RunClosed,
)

__all__ = ["install_error_handlers"]


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(NotFound)
    async def _not_found(_: Request, exc: NotFound) -> JSONResponse:
        return JSONResponse(status_code=404, content={"detail": str(exc)})

    @app.exception_handler(InvalidSession)
    async def _invalid(_: Request, exc: InvalidSession) -> JSONResponse:
        return JSONResponse(
            status_code=422, content={"detail": "the revision fails the schema", "report": report_dto(exc.report)}
        )

    @app.exception_handler(RunClosed)
    async def _closed(_: Request, exc: RunClosed) -> JSONResponse:
        return JSONResponse(status_code=409, content={"detail": str(exc)})

    @app.exception_handler(RendererUnavailable)
    async def _renderer(_: Request, exc: RendererUnavailable) -> JSONResponse:
        return JSONResponse(status_code=503, content={"detail": f"the renderer is unavailable: {exc}"})

    @app.exception_handler(RendererPinMismatch)
    async def _pin(_: Request, exc: RendererPinMismatch) -> JSONResponse:
        return JSONResponse(status_code=503, content={"detail": str(exc)})

    @app.exception_handler(HomeRefRefused)
    async def _ref(_: Request, exc: HomeRefRefused) -> JSONResponse:
        return JSONResponse(status_code=403, content={"detail": str(exc)})

    @app.exception_handler(PublishFailed)
    async def _publish(_: Request, exc: PublishFailed) -> JSONResponse:
        return JSONResponse(status_code=503, content={"detail": str(exc)})

    @app.exception_handler(EngineError)
    async def _engine(_: Request, exc: EngineError) -> JSONResponse:
        return JSONResponse(status_code=400, content={"detail": str(exc)})
