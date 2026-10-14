"""Where the template's bytes come from at runtime, and the pin check that gates them.

The corpus is private and the image build carries no credential (the plan
defect recorded in the build record), so the bytes are resolved when the
engine starts, in this order: a file the environment names, the cache a
previous fetch left, or the playbook-studio door over its MCP protocol with
the credential the environment carries. Whatever the source, the bytes must
hash to renderer.lock's pin, or the renderer refuses to serve (ASM-P03).
"""

from __future__ import annotations

import hashlib
import json
import logging
from pathlib import Path

import httpx

from backend.adapters.renderer.pin import RendererPin
from backend.core.errors import RendererPinMismatch, RendererUnavailable

__all__ = ["resolve_template", "fetch_over_mcp"]

_log = logging.getLogger("workshops.renderer")
_CACHE_NAME = "template.html"


def _check(data: bytes, pin: RendererPin, origin: str) -> bytes:
    digest = hashlib.sha256(data).hexdigest()
    if digest != pin.sha256:
        raise RendererPinMismatch(
            f"the renderer from {origin} hashes to {digest}, not the pinned {pin.sha256}: the template moved"
        )
    return data


def resolve_template(
    pin: RendererPin, *, file: str, cache_dir: str, url: str, user: str, password: str, timeout: float = 30.0
) -> bytes:
    if file:
        path = Path(file)
        if not path.is_file():
            raise RendererUnavailable(f"WORKSHOPS_RENDERER_FILE {file} does not exist")
        return _check(path.read_bytes(), pin, file)
    cache = Path(cache_dir) / _CACHE_NAME if cache_dir else None
    if cache and cache.is_file():
        try:
            return _check(cache.read_bytes(), pin, str(cache))
        except RendererPinMismatch:
            _log.warning("cached renderer at %s no longer matches the pin; refetching", cache)
    if url and user and password:
        data = _check(fetch_over_mcp(url, user, password, timeout=timeout), pin, url)
        if cache:
            cache.parent.mkdir(parents=True, exist_ok=True)
            cache.write_bytes(data)
        return data
    raise RendererUnavailable(
        "no renderer source is configured: set WORKSHOPS_RENDERER_FILE, or WORKSHOPS_RENDERER_URL with "
        "WORKSHOPS_RENDERER_USER and WORKSHOPS_RENDERER_PASSWORD (the playbook-studio door)"
    )


def fetch_over_mcp(
    url: str,
    user: str,
    password: str,
    *,
    skill: str = "bootstrap-workshop",
    rel_path: str = "template.html",
    timeout: float = 30.0,
) -> bytes:
    """Call the playbook-studio door's get_skill_file over streamable HTTP and return the file bytes.

    Every transport or protocol failure is the renderer being unavailable, never an exception
    out of the engine: the shelf, the store and the doors do not need the renderer, and a
    third-party door being down must not take them with it.
    """
    try:
        return _fetch_over_mcp(url, user, password, skill=skill, rel_path=rel_path, timeout=timeout)
    except (httpx.HTTPError, ValueError, KeyError, TypeError) as exc:
        raise RendererUnavailable(f"the renderer source {url} did not answer: {type(exc).__name__}: {exc}") from exc


def _fetch_over_mcp(url: str, user: str, password: str, *, skill: str, rel_path: str, timeout: float) -> bytes:
    headers = {"Content-Type": "application/json", "Accept": "application/json, text/event-stream"}
    with httpx.Client(auth=(user, password), timeout=timeout, follow_redirects=True) as client:
        init = client.post(
            url,
            headers=headers,
            json={
                "jsonrpc": "2.0",
                "id": 1,
                "method": "initialize",
                "params": {
                    "protocolVersion": "2025-03-26",
                    "capabilities": {},
                    "clientInfo": {"name": "vf-workshops", "version": "1"},
                },
            },
        )
        if init.status_code >= 400:
            raise RendererUnavailable(f"the renderer source {url} answered {init.status_code} to initialize")
        session_id = init.headers.get("mcp-session-id")
        if session_id:
            headers["mcp-session-id"] = session_id
        client.post(url, headers=headers, json={"jsonrpc": "2.0", "method": "notifications/initialized"})
        call = client.post(
            url,
            headers=headers,
            json={
                "jsonrpc": "2.0",
                "id": 2,
                "method": "tools/call",
                "params": {"name": "get_skill_file", "arguments": {"name": skill, "rel_path": rel_path}},
            },
        )
        if call.status_code >= 400:
            raise RendererUnavailable(f"the renderer source {url} answered {call.status_code} to get_skill_file")
        result = _rpc_result(call)
    if result.get("isError"):
        raise RendererUnavailable(f"get_skill_file refused: {_text_of(result)[:200]}")
    text = _text_of(result)
    if not text:
        raise RendererUnavailable("get_skill_file answered no content")
    return text.encode("utf-8")


def _rpc_result(response: httpx.Response) -> dict:
    content_type = response.headers.get("content-type", "")
    if content_type.startswith("application/json"):
        return response.json().get("result") or {}
    for line in response.text.splitlines():
        if line.startswith("data:"):
            payload = json.loads(line[5:].strip())
            if payload.get("id") == 2:
                if "error" in payload:
                    raise RendererUnavailable(f"get_skill_file failed: {payload['error']}")
                return payload.get("result") or {}
    raise RendererUnavailable("the renderer source answered no JSON-RPC result")


def _text_of(result: dict) -> str:
    structured = result.get("structuredContent")
    if isinstance(structured, dict) and isinstance(structured.get("result"), str):
        return structured["result"]
    for item in result.get("content") or []:
        if item.get("type") == "text" and isinstance(item.get("text"), str):
            text = item["text"]
            try:
                parsed = json.loads(text)
            except ValueError:
                return text
            if isinstance(parsed, dict) and isinstance(parsed.get("content"), str):
                return parsed["content"]
            return text
    return ""
