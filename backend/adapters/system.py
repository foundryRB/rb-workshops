"""The clock and the id generator: the two trivial outbound adapters."""

from __future__ import annotations

import secrets
from datetime import UTC, datetime

__all__ = ["SystemClock", "TokenIds"]


class SystemClock:
    def now(self) -> datetime:
        return datetime.now(UTC).replace(microsecond=0)


class TokenIds:
    def new_id(self, prefix: str) -> str:
        return f"{prefix}_{secrets.token_hex(6)}"
