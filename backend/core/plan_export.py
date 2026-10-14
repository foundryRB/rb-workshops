"""The plan-shaped export of a capture: each captured item under its REF-Plan item id, verbatim."""

from __future__ import annotations

from typing import Any

__all__ = ["plan_export"]


def _pool(act: dict, key: str) -> dict[str, dict]:
    return {p["k"]: p for p in act.get(key) or [] if isinstance(p, dict) and "k" in p}


def plan_export(
    dataset: dict[str, Any],
    capture: dict[str, Any],
    *,
    session_id: str,
    revision: int,
    run_id: str,
    run_kind: str,
    closed_at: str | None,
    renderer: str,
) -> dict[str, Any]:
    """Project a run's capture toward a plan (REF-Plan section 3): ids verbatim, one fact per field."""
    meta = dataset.get("meta") or {}
    items: list[dict[str, Any]] = []
    log: list[dict[str, Any]] = []
    date = str(meta.get("date") or "")
    for act in dataset.get("activities") or []:
        kind = act.get("kind")
        if kind in ("walk", "sort"):
            pools = _pool(act, "verdicts" if kind == "walk" else "buckets")
            for it in act.get("items") or []:
                rec = capture.get(it["id"]) or {}
                mark = rec.get("mark")
                pool = pools.get(mark) if mark else None
                fields = {k: v for k, v in (rec.get("fields") or {}).items() if v}
                items.append(
                    {
                        "id": it["id"],
                        "activity": act.get("id"),
                        "kind": kind,
                        "name": it.get("name") or it.get("stmt"),
                        "outcome": {"k": mark, "label": pool.get("label"), "tone": pool.get("tone")} if pool else None,
                        "fields": fields,
                        "open": pool is None,
                    }
                )
                if pool:
                    text = pool["label"] + (" " + ", ".join(f"{k}: {v}" for k, v in fields.items()) if fields else "")
                    log.append(
                        {
                            "date": date,
                            "refs": [it["id"]],
                            "text": text,
                            "who": fields.get("who") or fields.get("owner") or "",
                        }
                    )
        elif kind == "collect":
            slots = (capture.get(act.get("id")) or {}).get("slots") or {}
            item_id = (act.get("item") or {}).get("id")
            for sl in act.get("slots") or []:
                value = slots.get(sl["k"])
                items.append(
                    {
                        "id": item_id,
                        "activity": act.get("id"),
                        "kind": kind,
                        "name": sl.get("label"),
                        "slot": sl["k"],
                        "value": value,
                        "open": not value,
                    }
                )
                if value:
                    log.append({"date": date, "refs": [item_id], "text": f"{sl.get('label')}: {value}", "who": ""})
        elif kind == "assign":
            for row in act.get("rows") or []:
                if not row.get("editable"):
                    continue
                closer = (capture.get(row["id"]) or {}).get("closer")
                items.append(
                    {
                        "id": row["id"],
                        "activity": act.get("id"),
                        "kind": kind,
                        "name": row.get("name"),
                        "value": closer,
                        "open": not closer,
                    }
                )
                if closer:
                    log.append({"date": date, "refs": [row["id"]], "text": f"named: {closer}", "who": closer})
    return {
        "session": {
            "id": session_id,
            "title": meta.get("title"),
            "revision": revision,
            "meta_id": meta.get("id"),
            "version": meta.get("version"),
        },
        "run": {"id": run_id, "kind": run_kind, "closed_at": closed_at},
        "renderer": renderer,
        "items": items,
        "unresolved": [i["id"] for i in items if i["open"]],
        "log": log,
    }
