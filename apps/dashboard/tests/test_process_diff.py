"""The step diff of two process models (spec 022 screen 06, FE-P03)."""

from __future__ import annotations

from pathfinder_dashboard.process_diff import counts, diff


def step(sid: str, title: str, *, state: str | None = None, frm: list[str] | None = None) -> dict:
    return {
        "id": sid,
        "title": title,
        "route": f"/{title.lower()}",
        "state_id": state,
        "from": frm or [],
    }


A = [
    step("s1", "Home", state="st-home"),
    step("s2", "Car", state="st-car"),
    step("s3", "Driver", state="st-driver"),
    step("s4", "Options", state="st-options"),
]


def test_the_design_example_unchanged_removed_merged_added() -> None:
    """Screen 06: home unchanged, the product page removed, driver + options merged, a summary
    added at the end."""
    b = [
        step("s1", "Home", state="st-home", frm=["s1"]),
        step("m1", "One form", frm=["s3", "s4"]),
        step("n1", "Summary"),
    ]
    rows = diff(A, b)
    assert [(r.change, [s["id"] for s in r.left], r.right and r.right["id"]) for r in rows] == [
        ("unchanged", ["s1"], "s1"),
        ("removed", ["s2"], None),
        ("merged", ["s3", "s4"], "m1"),
        ("added", [], "n1"),
    ]
    assert counts(rows) == {"unchanged": 1, "changed": 0, "merged": 1, "added": 1, "removed": 1}


def test_a_fresh_branch_is_all_unchanged_and_a_renamed_drawn_step_is_changed() -> None:
    copy = [{**s, "from": [s["id"]]} for s in A]
    assert {r.change for r in diff(A, copy)} == {"unchanged"}
    renamed = [*copy[:1], {**copy[1], "state_id": None, "title": "Product"}, *copy[2:]]
    assert [r.change for r in diff(A, renamed)] == [
        "unchanged",
        "changed",
        "unchanged",
        "unchanged",
    ]


def test_an_added_step_sits_where_it_is_on_the_right() -> None:
    copy = [{**s, "from": [s["id"]]} for s in A]
    b = [copy[0], step("n1", "Login"), *copy[1:]]
    assert [(r.change, r.right and r.right["id"]) for r in diff(A, b)][:3] == [
        ("unchanged", "s1"),
        ("added", "n1"),
        ("unchanged", "s2"),
    ]


def test_unknown_from_ids_count_as_added_and_empty_models_diff_cleanly() -> None:
    assert [r.change for r in diff(A[:1], [step("x", "X", frm=["gone"])])] == ["removed", "added"]
    assert diff([], []) == []
