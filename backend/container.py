"""The composition root: settings in, the engine with its adapters out."""

from __future__ import annotations

import logging
import threading
from dataclasses import replace
from typing import Any

from backend.adapters.githome.publisher import GitHubHomePublisher
from backend.adapters.renderer.pin import RendererPin, read_pin
from backend.adapters.renderer.renderer import PinnedRenderer
from backend.adapters.renderer.source import resolve_template
from backend.adapters.store.postgres import PostgresStore
from backend.adapters.system import SystemClock, TokenIds
from backend.config import Settings, database_dsn, load_settings
from backend.core.errors import RendererPinMismatch, RendererUnavailable
from backend.core.service import WorkshopsEngine

__all__ = ["Container", "LazyRenderer"]

_log = logging.getLogger("workshops")
# The bound on one fetch of the template and the cadence of the retry while unresolved.
FETCH_TIMEOUT = 10.0
RETRY_SECONDS = 60.0


class LazyRenderer:
    """The Renderer port over a template resolved at first need and re-tried while unavailable."""

    def __init__(self, container: Container) -> None:
        self._container = container
        self.pinned: PinnedRenderer | None = None

    @property
    def pin(self) -> str:
        return self._container.pin.label

    def render(self, dataset: dict[str, Any]) -> bytes:
        if self.pinned is None and not self._container.resolve_renderer():
            raise RendererUnavailable(self._container.renderer_state)
        assert self.pinned is not None
        return self.pinned.render(dataset)


class Container:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.pin: RendererPin = read_pin(settings.renderer_lock)
        self.store = PostgresStore(database_dsn(settings), settings.database_schema)
        self.store.migrate()
        self.renderer_state = "unresolved"
        self.renderer = LazyRenderer(self)
        self._resolving = threading.Lock()
        self._completed = 0
        self._stop = threading.Event()
        # The first attempt and every re-try run on this thread, bounded and single-flight: the
        # engine listens at once, a source credential seeded after the pod started is picked up
        # within a minute, and no request path waits on a third-party door.
        if settings.renderer_file:
            # A local file needs no network: resolve inline so the state is settled at start.
            self.resolve_renderer()
        self._retry = threading.Thread(target=self._retry_loop, name="renderer-retry", daemon=True)
        self._retry.start()
        self.home = GitHubHomePublisher(
            settings.githome_repository,
            settings.githome_ref,
            settings.githome_path,
            settings.githome_token,
            settings.githome_api,
            token_file=settings.githome_token_file,
        )
        self.engine = WorkshopsEngine(self.store, self.store, self.renderer, self.home, SystemClock(), TokenIds())

    def _retry_loop(self) -> None:
        self.resolve_renderer()
        while not self._stop.wait(RETRY_SECONDS):
            if self.renderer_state != "ready":
                self.resolve_renderer()

    def resolve_renderer(self) -> bool:
        """Resolve the template from the configured sources, single-flight and bounded: a render
        that finds it unresolved tries once (a second caller waits for that one), the retry thread
        tries once a minute, and the probe never does. The credential is re-read from the
        environment (its mounted files) on every attempt."""
        seen = self._completed
        if not self._resolving.acquire(timeout=FETCH_TIMEOUT + 1):
            return self.renderer_state == "ready"
        try:
            if self._completed != seen:
                # A flight completed while this caller waited: take its result, do not refetch.
                return self.renderer_state == "ready"
            try:
                return self._resolve_once()
            finally:
                self._completed += 1
        finally:
            self._resolving.release()

    def _resolve_once(self) -> bool:
        if self.renderer_state == "ready" and self.renderer.pinned is not None:
            return True
        fresh = load_settings()
        s = replace(
            self.settings,
            renderer_user=self.settings.renderer_user or fresh.renderer_user,
            renderer_password=self.settings.renderer_password or fresh.renderer_password,
        )
        try:
            template = resolve_template(
                self.pin,
                file=s.renderer_file,
                cache_dir=s.renderer_cache_dir,
                url=s.renderer_url,
                user=s.renderer_user,
                password=s.renderer_password,
                timeout=FETCH_TIMEOUT,
            )
        except (RendererUnavailable, RendererPinMismatch) as exc:
            if self.renderer_state != str(exc):
                _log.error("the renderer is unavailable: %s", exc)
            self.renderer_state = str(exc)
            self.renderer.pinned = None
            return False
        self.renderer.pinned = PinnedRenderer(template, self.pin.label)
        self.renderer_state = "ready"
        return True

    def close(self) -> None:
        self._stop.set()
        self.store.close()
