"""The recorded map's edges (spec 072 FR-001; designer 18/10, 19/01): one line per page pair, an
arrowhead at both ends when the scan went both ways, a chip instead of more than six lines into
one page, other scans' moves only on their layer."""

from __future__ import annotations

from dataclasses import dataclass

from mudpuppy_dashboard.map_edges import TIMES, Pair, edges

ALL = frozenset({"offtree", "others"})
SIZE = (100, 40)


@dataclass
class B:
    x: int
    y: int
    depth: int


def pair(*steps: int, others: tuple[str, ...] = (), failed: bool = False) -> Pair:
    return Pair(steps=list(steps), others=set(others), failed=failed)


def test_a_move_both_ways_is_one_line_with_two_arrowheads() -> None:
    boxes = {"home": B(0, 28, 0), "a": B(0, 128, 1), "b": B(200, 128, 1)}
    parents = {"home": None, "a": "home", "b": "home"}
    pairs = {
        ("home", "a"): pair(1),
        ("home", "b"): pair(2),
        ("a", "b"): pair(3, 5),
        ("b", "a"): pair(4),
    }
    got = edges(boxes, pairs, parents, ALL, SIZE)
    (line,) = [e for e in got.edges if e.kind == "offtree"]
    assert line.arrow == "both" and line.label == f"↩ 2{TIMES} · 1{TIMES}"
    assert line.d.startswith("M100 ") and " H200" in line.d  # neighbours in one row: straight
    assert [e.kind for e in got.edges].count("tree") == 2


def test_more_than_six_moves_into_one_page_are_a_chip() -> None:
    kids = [f"p{i}" for i in range(7)]
    boxes = {"home": B(0, 28, 0)} | {k: B(i * 300, 128, 1) for i, k in enumerate(kids)}
    parents: dict[str, str | None] = {"home": None} | dict.fromkeys(kids, "home")
    pairs = {("home", k): pair(i) for i, k in enumerate(kids)}
    pairs |= {(k, "home"): pair(10 + i, 20 + i) for i, k in enumerate(kids)}
    got = edges(boxes, pairs, parents, ALL, SIZE)
    assert not [e for e in got.edges if e.kind == "offtree"]
    assert got.returns["home"].moves == 14 and got.returns["home"].pages == 7


def test_other_scans_moves_are_on_their_layer_with_how_many_scans() -> None:
    boxes = {"home": B(0, 28, 0), "a": B(0, 128, 1)}
    parents = {"home": None, "a": "home"}
    pairs = {("home", "a"): pair(others=("r2", "r3"))}
    shown = edges(boxes, pairs, parents, ALL, SIZE)
    assert [(e.kind, e.label) for e in shown.edges] == [("others", "2 scans")]
    hidden = edges(boxes, pairs, parents, frozenset(), SIZE)
    assert hidden.edges == [] and hidden.others == 1


def test_a_failed_move_is_always_drawn() -> None:
    boxes = {"home": B(0, 28, 0), "a": B(0, 128, 1)}
    got = edges(
        boxes, {("a", "home"): pair(2, failed=True)}, {"home": None, "a": None}, frozenset(), SIZE
    )
    assert [e.kind for e in got.edges] == ["failed"]
