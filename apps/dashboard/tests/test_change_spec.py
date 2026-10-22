"""The generated change spec (spec 022 screen 06, FR-008): every section from the step diff, and
the Markdown export with as-is, to-be, delta, records and migration cut (FE-P03)."""

from __future__ import annotations

from mudpuppy_dashboard.change_spec import SpecInput, generate, to_markdown
from mudpuppy_dashboard.process_diff import diff

A = [
    {"id": "s1", "title": "Home", "route": "/", "state_id": "st-1", "observed": True, "from": []},
    {"id": "s2", "title": "Car", "route": "/car", "state_id": "st-2", "observed": True, "from": []},
    {
        "id": "s3",
        "title": "Driver",
        "route": "/d",
        "state_id": "st-3",
        "observed": True,
        "from": [],
    },
]
B = [
    {**A[0], "from": ["s1"]},
    {
        "id": "m1",
        "title": "Quote",
        "route": "/quote",
        "state_id": None,
        "observed": False,
        "from": ["s2", "s3"],
    },
]


def spec() -> SpecInput:
    return SpecInput(
        "Quote OC/AC",
        "guest",
        "sandbox",
        "A r1",
        "B r2",
        A,
        B,
        diff(A, B),
        3,
        ["CAP-005 Product information"],
    )


def test_sections_come_from_the_diff() -> None:
    s = generate(spec())
    assert s["scope"] == "Quote OC/AC · persona guest · sandbox"
    assert s["as_is"] == "A r1: 3 screens observed in 3 scans."
    assert s["to_be"] == "B r2: 2 steps: Home, Quote."
    assert s["delta"] == ["Merge Car (/car), Driver (/d) into Quote (/quote)"]
    assert s["records"] == ["CAP-005 Product information"]
    assert "Routes that go: /car, /d. New routes: /quote." in s["migration_cut"]
    assert s["open_questions"] == [
        "Quote (/quote) is designed, not observed: confirm it with the team."
    ]


def test_markdown_has_every_section_as_heading_and_lists_as_bullets() -> None:
    md = to_markdown("Quote OC/AC", generate(spec()))
    for heading in (
        "## As-is",
        "## To-be",
        "## Delta",
        "## Records that cite these screens",
        "## Migration cut",
        "## Open questions",
    ):
        assert heading in md
    assert "- Merge Car (/car), Driver (/d) into Quote (/quote)" in md
    assert to_markdown("X", {"delta": []}).count("None.") == 7
