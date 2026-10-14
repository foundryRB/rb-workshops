"""renderer.lock: the pin the repository carries instead of the template."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

__all__ = ["RendererPin", "read_pin"]


@dataclass(frozen=True)
class RendererPin:
    sha256: str
    size: int | None
    source: str
    corpus: str
    pinned: str

    @property
    def label(self) -> str:
        return f"sha256:{self.sha256}"


def read_pin(path: str | Path) -> RendererPin:
    values: dict[str, str] = {}
    for line in Path(path).read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or ":" not in line:
            continue
        key, _, value = line.partition(":")
        values[key.strip()] = value.strip()
    sha = values.get("sha256", "")
    if len(sha) != 64:
        raise ValueError(f"{path}: no sha256 pin")
    size = values.get("bytes")
    return RendererPin(
        sha,
        int(size) if size and size.isdigit() else None,
        values.get("source", ""),
        values.get("corpus", ""),
        values.get("pinned", ""),
    )
