"""The core's own errors; every door maps them to its own refusal shape."""

from __future__ import annotations

from backend.core.model import ValidationReport

__all__ = [
    "EngineError",
    "NotFound",
    "InvalidSession",
    "RunClosed",
    "RendererUnavailable",
    "RendererPinMismatch",
    "HomeRefRefused",
    "PublishFailed",
]


class EngineError(Exception):
    """Base of every refusal the core raises."""


class NotFound(EngineError):
    pass


class InvalidSession(EngineError):
    """A revision that fails the REF-Workshop section 3 contract; carries the report."""

    def __init__(self, report: ValidationReport) -> None:
        self.report = report
        super().__init__("; ".join(f"{f.label}: {f.detail}" for f in report.errors))


class RunClosed(EngineError):
    """A write against a run that has been closed: the workshop stands as run."""


class RendererUnavailable(EngineError):
    """The pinned renderer's bytes could not be resolved from any configured source."""


class RendererPinMismatch(EngineError):
    """The resolved renderer bytes do not match renderer.lock: the template moved."""


class HomeRefRefused(EngineError):
    """A publish aimed at any ref but the configured home ref (ADR-009)."""


class PublishFailed(EngineError):
    pass
