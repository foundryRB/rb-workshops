"""Runtime configuration read from the environment; the root .env.example documents every name."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path
from urllib.parse import quote

__all__ = ["Settings", "load_settings", "ConfigError"]


class ConfigError(RuntimeError):
    """A setting the engine refuses to run without."""


def _read_secret(env: str, file_env: str) -> str:
    """A value from the environment, or from the file a *_FILE variable names.

    A mounted Secret arrives as files; a local run exports the value. Either
    way the value never travels through a log line.
    """
    direct = os.environ.get(env, "")
    if direct:
        return direct
    path = os.environ.get(file_env, "")
    if path and Path(path).is_file():
        return Path(path).read_text(encoding="utf-8").strip()
    return ""


def _build_stamp() -> str:
    """The image's build moment, read from the file the image wrote, else the environment's word."""
    path = os.environ.get("WORKSHOPS_BUILD_FILE", "")
    if path and Path(path).is_file():
        stamp = Path(path).read_text(encoding="utf-8").strip()
        if stamp:
            return stamp
    return os.environ.get("WORKSHOPS_BUILD", "dev")


def _truthy(value: str | None) -> bool:
    return (value or "").strip().lower() in {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class Settings:
    database_url: str
    database_host: str
    database_port: str
    database_name: str
    database_user: str
    database_password: str
    database_schema: str
    auth_scope: str
    auth_user: str
    auth_password: str
    auth_disabled: bool
    mcp_allowed_hosts: list[str]
    renderer_file: str
    renderer_cache_dir: str
    renderer_url: str
    renderer_user: str
    renderer_password: str
    renderer_lock: str
    githome_repository: str
    githome_ref: str
    githome_path: str
    githome_token: str
    githome_token_file: str
    githome_api: str
    static_dir: str
    build: str
    public_host: str
    extra: dict[str, str] = field(default_factory=dict)


def load_settings() -> Settings:
    root = Path(__file__).resolve().parents[2]
    hosts = os.environ.get("WORKSHOPS_MCP_ALLOWED_HOSTS", "")
    return Settings(
        database_url=os.environ.get("DATABASE_URL", ""),
        database_host=os.environ.get("DATABASE_HOST", "localhost"),
        database_port=os.environ.get("DATABASE_PORT", "5432"),
        database_name=os.environ.get("DATABASE_NAME", "rb-workshops"),
        database_user=os.environ.get("DATABASE_USER", ""),
        database_password=_read_secret("DATABASE_PASSWORD", "DATABASE_PASSWORD_FILE"),
        database_schema=os.environ.get("DATABASE_SCHEMA", "public"),
        auth_scope=(os.environ.get("WORKSHOPS_AUTH_SCOPE") or "").strip().lower(),
        auth_user=os.environ.get("WORKSHOPS_AUTH_USER", ""),
        auth_password=_read_secret("WORKSHOPS_AUTH_PASSWORD", "WORKSHOPS_AUTH_PASSWORD_FILE"),
        auth_disabled=_truthy(os.environ.get("WORKSHOPS_AUTH_DISABLED")),
        mcp_allowed_hosts=[h.strip() for h in hosts.split(",") if h.strip()],
        renderer_file=os.environ.get("WORKSHOPS_RENDERER_FILE", ""),
        renderer_cache_dir=os.environ.get("WORKSHOPS_RENDERER_CACHE_DIR", ""),
        renderer_url=os.environ.get("WORKSHOPS_RENDERER_URL", ""),
        renderer_user=_read_secret("WORKSHOPS_RENDERER_USER", "WORKSHOPS_RENDERER_USER_FILE"),
        renderer_password=_read_secret("WORKSHOPS_RENDERER_PASSWORD", "WORKSHOPS_RENDERER_PASSWORD_FILE"),
        renderer_lock=os.environ.get("WORKSHOPS_RENDERER_LOCK", str(root / "renderer.lock")),
        githome_repository=os.environ.get(
            "GITHOME_REPOSITORY", "foundryRB/rb-workshops"
        ),
        githome_ref=os.environ.get("GITHOME_REF", "home"),
        githome_path=os.environ.get("GITHOME_PATH", "workshops/{session}/{revision}/"),
        githome_token=os.environ.get("GITHOME_TOKEN", ""),
        githome_token_file=os.environ.get("GITHOME_TOKEN_FILE", ""),
        githome_api=os.environ.get("GITHOME_API", "https://api.github.com"),
        static_dir=os.environ.get("WORKSHOPS_STATIC_DIR", str(root / "app")),
        build=_build_stamp(),
        public_host=os.environ.get("WORKSHOPS_PUBLIC_HOST", ""),
    )


def database_dsn(settings: Settings) -> str:
    """The store connection string: DATABASE_URL wins; else the discrete values.

    On the discrete path an empty owner role is refused loudly: the platform
    revokes PUBLIC connect on every app database, so an empty user does not
    fall back to anything, it fails opaquely at the database.
    """
    if settings.database_url:
        return settings.database_url
    if not settings.database_user:
        raise ConfigError(
            "DATABASE_USER is unset and DATABASE_URL was not supplied: the store's owner role "
            "has no source. Refusing to start rather than connecting as an implicit identity."
        )
    user = quote(settings.database_user, safe="")
    password = f":{quote(settings.database_password, safe='')}" if settings.database_password else ""
    name = quote(settings.database_name, safe="")
    return f"postgresql://{user}{password}@{settings.database_host}:{settings.database_port}/{name}"
