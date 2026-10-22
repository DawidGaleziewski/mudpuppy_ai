"""Map layout (spec 033 R1, R2, R4): pure functions on small graphs."""

from __future__ import annotations

import time

import pytest

from mudpuppy_dashboard.map_layout import (
    COLLAPSE_OVER,
    GAP_X,
    GAP_Y,
    NODE_H,
    NODE_W,
    collapse_families,
    family_of,
    layout,
)

SLOT = NODE_W + GAP_X
ROW = NODE_H + GAP_Y


def test_a_tree_is_layered_by_depth_with_parents_over_their_children() -> None:
    lay = layout(
        ["/", "a", "b", "a1", "a2"], [("/", "a"), ("/", "b"), ("a", "a1"), ("a", "a2")], ["/"]
    )
    p = lay.placed
    assert [p[n].depth for n in ("/", "a", "b", "a1", "a2")] == [0, 1, 1, 2, 2]
    assert p["a1"].x == 0 and p["a2"].x == SLOT and p["b"].x == 2 * SLOT
    assert p["a"].x == SLOT // 2  # over the middle of a1 and a2
    assert p["a"].y == ROW and p["a1"].parent == "a"
    assert lay.width == 2 * SLOT + NODE_W and lay.height == 2 * ROW + NODE_H


def test_the_earliest_move_from_the_shallowest_screen_is_the_parent() -> None:
    # b is reached from / and from a; / is shallower, so b hangs under /
    lay = layout(["/", "a", "b"], [("/", "a"), ("a", "b"), ("/", "b")], ["/"])
    assert lay.placed["b"].parent == "/" and lay.placed["b"].depth == 1


def test_a_cycle_back_to_the_start_does_not_move_it() -> None:
    lay = layout(["/", "a"], [("/", "a"), ("a", "/")], ["/"])
    assert lay.placed["/"].depth == 0 and lay.placed["a"].depth == 1


def test_two_start_screens_are_two_roots_side_by_side() -> None:
    lay = layout(["/", "/login", "a"], [("/", "a")], ["/", "/login"])
    assert lay.placed["/login"].depth == 0 and lay.placed["/login"].x > lay.placed["/"].x


def test_screens_no_move_reached_get_a_last_row() -> None:
    lay = layout(["/", "a", "direct"], [("/", "a")], ["/"])
    assert lay.unreached == ("direct",)
    assert lay.placed["direct"].depth == 2 and lay.placed["direct"].parent is None


def test_no_starts_takes_the_first_node() -> None:
    lay = layout(["x", "y"], [("x", "y")], [])
    assert lay.placed["x"].depth == 0 and lay.placed["y"].depth == 1


def test_self_moves_and_unknown_nodes_are_ignored() -> None:
    lay = layout(["/", "a"], [("/", "/"), ("/", "ghost"), ("/", "a")], ["/"])
    assert set(lay.placed) == {"/", "a"}


def test_families_by_first_path_segment() -> None:
    assert family_of("/kalkulator/kierowca") == "/kalkulator"
    assert family_of("/ubezpieczenia#/szkody/nowa") == "/ubezpieczenia"
    assert family_of("/") == "/"
    assert family_of("/sklep") == "/sklep"


def test_families_collapse_only_over_the_limit_and_the_open_one_stays() -> None:
    small = {f"n{i}": f"/a/{i}" for i in range(3)}
    assert collapse_families(small) == {n: n for n in small}
    big = {f"n{i}": f"/a/{i}" for i in range(COLLAPSE_OVER)} | {"home": "/", "lone": "/b"}
    drawn = collapse_families(big)
    assert drawn["n0"] == "family:/a" and drawn["home"] == "home" and drawn["lone"] == "lone"
    assert collapse_families(big, open_family="/a")["n0"] == "n0"


@pytest.mark.perf
def test_three_hundred_screens_lay_out_fast() -> None:
    nodes = [f"s{i}" for i in range(300)]
    moves = [(f"s{i // 4}", f"s{i}") for i in range(1, 300)]
    moves += [(f"s{i}", "s0") for i in range(300)]  # every page links home
    t = time.perf_counter()
    lay = layout(nodes, moves, ["s0"])
    assert time.perf_counter() - t < 0.5
    assert len(lay.placed) == 300 and not lay.unreached
