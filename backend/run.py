"""Serve the engine: `python -m backend.run` (PORT, default 8000)."""

from __future__ import annotations

import os

import uvicorn

from backend.app import create_app


def main() -> None:
    uvicorn.run(create_app(), host="0.0.0.0", port=int(os.environ.get("PORT", "8000")), proxy_headers=True)


if __name__ == "__main__":
    main()
