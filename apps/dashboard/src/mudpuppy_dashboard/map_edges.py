"""The recorded map's edges (spec 054; designer answers 18/10 and 19/01, D-52, FE-V18): solid
means the chosen scans made the move, dashed means they didn't.

- `tree`: the first arrival at a page (the layout's discovery tree), always drawn;
- `offtree`: a later move between two pages the scans already had (back to `/`, across), one
  line per page pair with an arrowhead at the page it went to (both ends when it went both ways),
  labelled "↩ 3 times" (the sign `TIMES`) or `↩ step 140`; more than six into one page → none
  drawn, a chip on the page;
- `others`: a link other scans took and these didn't, labelled `2 scans` (layer off by default);
- `failed`: the failing move, always drawn.

The layout never depends on these: nodes stay where the tree put them when a back move arrives.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Protocol

#: More off-tree lines than this into one page hide the tree: the page gets a chip instead.
HUB_OVER = 6
#: Room above the top row for the arcs of moves back up the tree (the recorded map adds it).
ARC_ROOM = 28
#: The multiplication sign of the designer's labels ("↩ 3" + TIMES).
TIMES = chr(0xD7)


class Box(Protocol):
    x: int
    y: int
    depth: int


@dataclass
class Pair:
    """Every move from one page to another: the chosen scans' steps, the other scans' ids."""

    steps: list[int] = field(default_factory=list)
    others: set[str] = field(default_factory=set)
    failed: bool = False

    def add(self, run_id: str, step: int, chosen: bool, failed: bool) -> None:
        if chosen:
            self.steps.append(step)
        else:
            self.others.add(run_id)
        self.failed = self.failed or failed


@dataclass(frozen=True)
class Edge:
    kind: str  # tree · offtree · others · failed
    d: str  # SVG path
    label: str | None = None
    label_x: int | None = None
    label_y: int | None = None
    arrow: str | None = None  # end · both (off-tree moves)


@dataclass(frozen=True)
class Returns:
    """A page more than six off-tree lines end on: how many moves, from how many pages."""

    moves: int
    pages: int


def _times(steps: list[int]) -> str:
    return f"{len(steps)}{TIMES}"


def _label(there: list[int], back: list[int] | None) -> str:
    if back is None:
        return f"↩ step {there[0]}" if len(there) == 1 else f"↩ {_times(there)}"
    return f"↩ {_times(there)} · {_times(back)}"


def _tree_kind(p: Pair | None, others: bool) -> tuple[str, str | None] | None:
    if p is None or (p.steps and not p.failed):
        return "tree", None
    if p.failed:
        return "failed", None
    if others and p.others:
        return "others", _scans(p.others)
    return None


def _scans(runs: set[str]) -> str:
    return f"{len(runs)} scan" if len(runs) == 1 else f"{len(runs)} scans"


@dataclass
class EdgeSet:
    edges: list[Edge]
    returns: dict[str, Returns]
    #: Page pairs only other scans moved between (the layer's count, drawn or not).
    others: int


def edges(
    boxes: dict[str, Box],
    pairs: dict[tuple[str, str], Pair],
    parents: dict[str, str | None],
    layers: frozenset[str],
    size: tuple[int, int],
) -> EdgeSet:
    """The recorded map's edges for the layers shown (`offtree`, `others`), and the pages whose
    back moves are a chip. `size` is the node's (width, height)."""
    route = _Router(boxes, size)
    tree = {(p, c) for c, p in parents.items() if p is not None}
    out: list[Edge] = []
    for a, b in tree:
        kind = _tree_kind(pairs.get((a, b)), "others" in layers)
        if kind is not None:
            out.append(route.down(a, b, kind[0], kind[1]))
    rest = {k: p for k, p in pairs.items() if k not in tree}
    for (a, b), p in rest.items():
        if p.failed:
            out.append(route.down(a, b, "failed"))
        elif not p.steps and p.others and "others" in layers:
            out.append(route.down(a, b, "others", _scans(p.others)))
    mine = {k: p.steps for k, p in rest.items() if p.steps and not p.failed}
    returns = _returns(mine)
    if "offtree" in layers:
        out.extend(_offtree_lines(route, mine, returns))
    others = sum(1 for p in pairs.values() if p.others and not p.steps)
    return EdgeSet(out, returns, others)


def _returns(mine: dict[tuple[str, str], list[int]]) -> dict[str, Returns]:
    into: dict[str, list[tuple[str, int]]] = {}
    for (a, b), steps in mine.items():
        into.setdefault(b, []).append((a, len(steps)))
    return {
        b: Returns(moves=sum(n for _, n in src), pages=len(src))
        for b, src in into.items()
        if len(src) > HUB_OVER
    }


def _offtree_lines(
    route: _Router, mine: dict[tuple[str, str], list[int]], returns: dict[str, Returns]
) -> list[Edge]:
    shown = {k: v for k, v in mine.items() if k[1] not in returns}
    out = []
    for (a, b), there in sorted(shown.items()):
        back = shown.get((b, a))
        if back is not None and (b, a) < (a, b):
            continue  # drawn once, from the other end
        out.append(route.across(a, b, _label(there, back), "both" if back else "end"))
    return out


class _Router:
    """Paths between node boxes: tree moves down between rows, off-tree moves around the tree."""

    def __init__(self, boxes: dict[str, Box], size: tuple[int, int]) -> None:
        self.boxes, (self.w, self.h) = boxes, size

    def down(self, a: str, b: str, kind: str, label: str | None = None) -> Edge:
        p, q = self.boxes[a], self.boxes[b]
        x1, y1, x2, y2 = p.x + self.w // 2, p.y + self.h, q.x + self.w // 2, q.y
        ym = (y1 + y2) // 2
        d = f"M{x1} {y1} C{x1} {ym} {x2} {ym} {x2} {y2}"
        if label is None:
            return Edge(kind, d)
        return Edge(kind, d, label, (x1 + x2) // 2 + 8, ym)

    def across(self, a: str, b: str, label: str, arrow: str) -> Edge:
        p, q = self.boxes[a], self.boxes[b]
        if q.depth > p.depth:  # further down, not its first arrival: down like the tree
            e = self.down(a, b, "offtree", label)
            return Edge(e.kind, e.d, e.label, e.label_x, e.label_y, arrow)
        if q.depth == p.depth and abs(q.x - p.x) <= self.w * 2:  # neighbours in one row
            left = q.x < p.x
            x1 = p.x if left else p.x + self.w
            x2 = q.x + self.w if left else q.x
            y = p.y + self.h // 2
            return Edge("offtree", f"M{x1} {y} H{x2}", label, (x1 + x2) // 2, y - 6, arrow)
        # back up the tree, or far along a row: an arc over the top row
        x1, y1, x2, y2 = p.x + self.w // 2, p.y, q.x + self.w // 2, q.y
        peak = 4  # the arc's highest point, inside the room above the top row
        c = (8 * peak - y1 - y2) // 6
        d = f"M{x1} {y1} C{x1} {c} {x2} {c} {x2} {y2}"
        return Edge("offtree", d, label, (x1 + x2) // 2, peak + 12, arrow)
