"""The validator: the six kinds and nothing else (003), the whole section 3 contract (008)."""

from __future__ import annotations

import copy

import pytest
from pytest_intent import intent

from backend.core.schema import KINDS, TRAIL_CEILING, validate
from tests.conftest import six_kind_dataset


def _row(report, row):
    return next(r for r in report.rows if r.row == row)


@intent("INT-WORKSHOPS-003")
def test_exactly_the_six_kinds_are_accepted_and_any_other_refused() -> None:
    assert KINDS == ("frame", "collect", "walk", "sort", "assign", "close")
    good = six_kind_dataset()
    assert {a["kind"] for a in good["activities"]} == set(KINDS)
    assert validate(good).ok, validate(good).errors
    for bad_kind in ("debate", "vote", "FRAME", "", None):
        data = copy.deepcopy(good)
        data["activities"][2]["kind"] = bad_kind
        report = validate(data)
        assert not report.ok
        assert not _row(report, "kinds").ok
        assert "kind" in _row(report, "kinds").detail


@intent("INT-WORKSHOPS-008")
@pytest.mark.parametrize(
    "mutate, row",
    [
        (lambda d: d["meta"].pop("classification"), "meta"),
        (lambda d: d["meta"].update({"duration": "60"}), "meta"),
        (lambda d: d["activities"][1].pop("slots"), "kinds"),
        (lambda d: d["activities"][2]["items"][0].pop("detail"), "kinds"),
        (lambda d: d["activities"][3]["items"][0].pop("owner"), "kinds"),
        (lambda d: d["activities"][4]["rows"][0].pop("ph"), "kinds"),
        (lambda d: d["activities"][0].pop("script"), "kinds"),
        (lambda d: d["activities"][2].update({"objective": "internal aim on the room"}), "split"),
        (lambda d: d["activities"][2]["items"][0].update({"say": ["leak"]}), "split"),
        (lambda d: d["activities"][5].update({"mins": 15}), "timeboxes"),
        (lambda d: d["activities"][3]["items"][0].update({"owner": "R. Pires · 2026-09-18"}), "facts"),
        (lambda d: d["activities"][2]["verdicts"][0].update({"tone": "green"}), "tones"),
        (lambda d: d["activities"][3]["buckets"][1].update({"tone": "warn"}), "tones"),
        (
            lambda d: d["activities"][2].update(
                {"items": [{"id": f"S-{i}", "stmt": "s", "detail": "d"} for i in range(TRAIL_CEILING + 1)]}
            ),
            "length",
        ),
    ],
)
def test_every_section_3_rule_is_a_separately_falsifiable_row(mutate, row) -> None:
    data = six_kind_dataset()
    assert validate(data).ok
    mutate(data)
    report = validate(data)
    assert not report.ok
    assert not _row(report, row).ok, [r for r in report.rows]
    # Every other row still reports independently: one broken rule does not hide the rest.
    assert {r.row for r in report.rows} == {"meta", "kinds", "split", "timeboxes", "facts", "tones", "length"}


@intent("INT-WORKSHOPS-008")
def test_the_report_names_what_the_author_screen_shows() -> None:
    report = validate(six_kind_dataset())
    assert [r.label for r in report.rows] == [
        "meta complete",
        "Kind contracts",
        "Room and facilitator split",
        "Timeboxes sum to duration",
        "One fact per field",
        "Tones from the trio",
        "Trail length",
    ]
    assert _row(report, "meta").detail == "10 of 10"
    assert _row(report, "kinds").detail == "6 of 6"
    assert _row(report, "length").detail == f"3 of {TRAIL_CEILING}"
