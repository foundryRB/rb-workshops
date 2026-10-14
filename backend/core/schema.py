"""The REF-Workshop section 3 validator: meta, the six per-kind contracts, and the rules.

One validator, called by every write door (STORE-003). It answers a report of
named rows rather than a first error, because the author screen shows each
rule separately while a session is being edited (AUTHOR-001).
"""

from __future__ import annotations

from typing import Any

from backend.core.model import Finding, ValidationReport

__all__ = ["KINDS", "TONES", "META_FIELDS", "TRAIL_CEILING", "validate"]

KINDS: tuple[str, ...] = ("frame", "collect", "walk", "sort", "assign", "close")
TONES: tuple[str, ...] = ("ok", "mid", "hot")
META_FIELDS: tuple[str, ...] = (
    "id",
    "title",
    "eyebrow",
    "session",
    "date",
    "duration",
    "version",
    "classification",
    "question",
    "objective",
)
TRAIL_CEILING = 10
# Fields that belong under `script` and never on a room-facing level.
_FACILITATOR_KEYS = ("goal", "run", "say", "watch", "objective")
# A composite display string: two facts joined by a separator the renderer would compose.
_COMPOSITE_SEPARATORS = (" · ", " | ", " • ")

_ROW_LABELS = {
    "meta": "meta complete",
    "kinds": "Kind contracts",
    "split": "Room and facilitator split",
    "timeboxes": "Timeboxes sum to duration",
    "facts": "One fact per field",
    "tones": "Tones from the trio",
    "length": "Trail length",
}


def _is_str(value: Any) -> bool:
    return isinstance(value, str) and value.strip() != ""


def _is_int(value: Any) -> bool:
    return isinstance(value, int) and not isinstance(value, bool)


def _rows_of(value: Any, key: str, required: tuple[str, ...], where: str, problems: list[str]) -> list[dict]:
    rows = value.get(key)
    if not isinstance(rows, list) or not rows:
        problems.append(f"{where}: {key} must be a non-empty list")
        return []
    out: list[dict] = []
    for i, row in enumerate(rows):
        if not isinstance(row, dict):
            problems.append(f"{where}: {key}[{i}] must be an object")
            continue
        for req in required:
            if req not in row:
                problems.append(f"{where}: {key}[{i}] lacks {req}")
        out.append(row)
    return out


def _check_meta(meta: Any, problems: list[str]) -> int:
    if not isinstance(meta, dict):
        problems.append("meta must be an object")
        return 0
    present = 0
    for name in META_FIELDS:
        value = meta.get(name)
        if name == "duration":
            if _is_int(value) and value > 0:
                present += 1
            else:
                problems.append("meta.duration must be a positive integer of minutes")
        elif _is_str(value):
            present += 1
        else:
            problems.append(f"meta.{name} is missing or empty")
    return present


def _check_contract(act: dict, where: str, problems: list[str]) -> None:
    kind = act.get("kind")
    if kind == "frame":
        _rows_of(act, "panels", ("name", "phase", "line", "done"), where, problems)
    elif kind == "collect":
        item = act.get("item")
        if not isinstance(item, dict):
            problems.append(f"{where}: collect needs an item object")
        else:
            for req in ("id", "badge", "title", "known"):
                if req not in item:
                    problems.append(f"{where}: item lacks {req}")
        _rows_of(act, "slots", ("k", "label", "hint"), where, problems)
    elif kind == "walk":
        if not _is_str(act.get("prompt")):
            problems.append(f"{where}: walk needs a prompt")
        _rows_of(act, "verdicts", ("k", "label", "tone"), where, problems)
        _rows_of(act, "items", ("id", "stmt", "detail"), where, problems)
    elif kind == "sort":
        _rows_of(act, "buckets", ("k", "label", "tone"), where, problems)
        _rows_of(act, "items", ("id", "name", "ask", "owner", "when"), where, problems)
    elif kind == "assign":
        rows = _rows_of(act, "rows", ("id", "name", "evidence"), where, problems)
        for row in rows:
            if row.get("editable"):
                if "ph" not in row:
                    problems.append(f"{where}: editable row {row.get('id')} needs a ph")
            elif "who" not in row:
                problems.append(f"{where}: fixed row {row.get('id')} needs a who")
    elif kind == "close":
        pass


def validate(dataset: Any) -> ValidationReport:
    """Validate one session dataset against the whole section 3 contract."""
    rows: list[Finding] = []
    if not isinstance(dataset, dict):
        return ValidationReport(
            [Finding(row, label, False, "the dataset must be an object") for row, label in _ROW_LABELS.items()]
        )
    meta = dataset.get("meta")
    activities = dataset.get("activities")

    # meta: ten fields
    meta_problems: list[str] = []
    present = _check_meta(meta, meta_problems)
    rows.append(
        Finding(
            "meta",
            _ROW_LABELS["meta"],
            not meta_problems,
            f"{present} of {len(META_FIELDS)}" if not meta_problems else "; ".join(meta_problems),
        )
    )

    acts: list[dict] = []
    kind_problems: list[str] = []
    if not isinstance(activities, list) or not activities:
        kind_problems.append("activities must be a non-empty list")
    else:
        seen_ids: set[str] = set()
        for i, act in enumerate(activities):
            where = f"activity {i + 1}"
            if not isinstance(act, dict):
                kind_problems.append(f"{where}: must be an object")
                continue
            acts.append(act)
            kind = act.get("kind")
            if kind not in KINDS:
                kind_problems.append(f"{where}: kind {kind!r} is not one of {', '.join(KINDS)}")
                continue
            for req in ("id", "name", "question"):
                if not _is_str(act.get(req)):
                    kind_problems.append(f"{where}: {req} is missing or empty")
            if not (_is_int(act.get("mins")) and act.get("mins") > 0):
                kind_problems.append(f"{where}: mins must be a positive integer")
            script = act.get("script")
            if not isinstance(script, dict):
                kind_problems.append(f"{where}: script must be an object with goal, run, say, watch")
            else:
                if not _is_str(script.get("goal")):
                    kind_problems.append(f"{where}: script.goal is missing")
                for lst in ("run", "say"):
                    if not isinstance(script.get(lst), list):
                        kind_problems.append(f"{where}: script.{lst} must be a list")
                if not _is_str(script.get("watch")):
                    kind_problems.append(f"{where}: script.watch is missing")
            _check_contract(act, where, kind_problems)
            for item_id in _item_ids(act):
                if item_id in seen_ids:
                    kind_problems.append(f"{where}: item id {item_id!r} is not unique")
                seen_ids.add(item_id)
    kinds_present = sorted({a.get("kind") for a in acts if a.get("kind") in KINDS}, key=KINDS.index)
    rows.append(
        Finding(
            "kinds",
            _ROW_LABELS["kinds"],
            not kind_problems,
            f"{len(kinds_present)} of {len(KINDS)}" if not kind_problems else "; ".join(kind_problems),
        )
    )

    # room and facilitator split
    split_problems: list[str] = []
    for i, act in enumerate(acts):
        for key in _FACILITATOR_KEYS:
            if key in act:
                split_problems.append(f"activity {i + 1}: {key!r} is a facilitator field and belongs under script")
        for holder_key in ("item", "items", "panels", "rows", "slots", "buckets", "verdicts"):
            holder = act.get(holder_key)
            entries = holder if isinstance(holder, list) else ([holder] if isinstance(holder, dict) else [])
            for entry in entries:
                if isinstance(entry, dict) and any(k in entry for k in _FACILITATOR_KEYS):
                    split_problems.append(f"activity {i + 1}: a {holder_key} entry carries a facilitator field")
    rows.append(
        Finding(
            "split",
            _ROW_LABELS["split"],
            not split_problems,
            "held" if not split_problems else "; ".join(split_problems),
        )
    )

    # timeboxes
    total = sum(a.get("mins") for a in acts if _is_int(a.get("mins")))
    duration = meta.get("duration") if isinstance(meta, dict) else None
    if _is_int(duration) and acts and total == duration:
        rows.append(Finding("timeboxes", _ROW_LABELS["timeboxes"], True, f"{total} of {duration} minutes"))
    else:
        rows.append(
            Finding(
                "timeboxes",
                _ROW_LABELS["timeboxes"],
                False,
                f"Activities total {total} minutes against a declared duration of {duration}.",
            )
        )

    # one fact per field
    fact_problems: list[str] = []
    for i, act in enumerate(acts):
        if act.get("kind") == "sort":
            for it in act.get("items") or []:
                if not isinstance(it, dict):
                    continue
                for f in ("owner", "when", "name"):
                    v = it.get(f)
                    if isinstance(v, str) and any(sep in v for sep in _COMPOSITE_SEPARATORS):
                        fact_problems.append(f"activity {i + 1}: {it.get('id')}.{f} carries two facts in one string")
        if act.get("kind") == "collect":
            for sl in act.get("slots") or []:
                if (
                    isinstance(sl, dict)
                    and isinstance(sl.get("label"), str)
                    and any(sep in sl["label"] for sep in _COMPOSITE_SEPARATORS)
                ):
                    fact_problems.append(f"activity {i + 1}: slot {sl.get('k')} label carries two facts")
    rows.append(
        Finding(
            "facts", _ROW_LABELS["facts"], not fact_problems, "held" if not fact_problems else "; ".join(fact_problems)
        )
    )

    # tones
    tone_problems: list[str] = []
    for i, act in enumerate(acts):
        for pool_key in ("verdicts", "buckets"):
            for entry in act.get(pool_key) or []:
                if isinstance(entry, dict) and entry.get("tone") not in TONES:
                    tone_problems.append(
                        f"activity {i + 1}: {pool_key} {entry.get('k')} tone {entry.get('tone')!r} "
                        "is not ok, mid or hot"
                    )
    rows.append(
        Finding(
            "tones", _ROW_LABELS["tones"], not tone_problems, "held" if not tone_problems else "; ".join(tone_problems)
        )
    )

    # queue and trail length
    longest = 0
    length_problems: list[str] = []
    for i, act in enumerate(acts):
        if act.get("kind") in ("walk", "sort"):
            n = len(act.get("items") or [])
            longest = max(longest, n)
            if n > TRAIL_CEILING:
                length_problems.append(
                    f"activity {i + 1}: {n} items is beyond the ceiling of {TRAIL_CEILING}; split the activity"
                )
    rows.append(
        Finding(
            "length",
            _ROW_LABELS["length"],
            not length_problems,
            f"{longest} of {TRAIL_CEILING}" if not length_problems else "; ".join(length_problems),
        )
    )
    return ValidationReport(rows)


def _item_ids(act: dict) -> list[str]:
    ids: list[str] = []
    kind = act.get("kind")
    if kind in ("walk", "sort"):
        ids += [str(it.get("id")) for it in act.get("items") or [] if isinstance(it, dict) and "id" in it]
    elif kind == "assign":
        ids += [str(r.get("id")) for r in act.get("rows") or [] if isinstance(r, dict) and "id" in r]
    elif kind == "collect" and isinstance(act.get("item"), dict) and "id" in act["item"]:
        ids.append(str(act["item"]["id"]))
    return ids
