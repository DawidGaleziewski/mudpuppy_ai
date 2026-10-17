"""Layout of the portal map (spec 033 R1, R2, R4): pure, no store, no I/O.

Depth is the breadth-first distance from the start screens over observed moves; each screen hangs
under the screen whose move reached it first (the discovery tree, as the live map draws it: all
moves at once are a hairball, every page links to the footer pages). The tree is laid out tidy,
a parent centred over its children; screens no move reached ("opened by address") get a last row.
Over ``COLLAPSE_OVER`` nodes, route families fold into one deck each (R4).
"""

from __future__ import annotations

from collections import defaultdict, deque
from collections.abc import Iterable, Sequence
from dataclasses import dataclass

NODE_W = 150
NODE_H = 96  # screen 12's node height; the template fixes it and cuts the title to one line
GAP_X = 40
GAP_Y = 70
COLLAPSE_OVER = 150


@dataclass(frozen=True)
class Placed:
    x: int
    y: int
    depth: int
    parent: str | None  # the tree parent; None for a start screen or one opened by address


@dataclass(frozen=True)
class Layout:
    placed: dict[str, Placed]
    width: int
    height: int
    unreached: tuple[str, ...]  # opened by address: no observed move reached them


def family_of(route: str) -> str:
    """The first path segment (R4): `/kalkulator/kierowca` → `/kalkulator`; the part before a
    hash counts as the path (`/ubezpieczenia#/szkody` → `/ubezpieczenia`); `/` is its own."""
    path = route.split("#", 1)[0]
    first = path.strip("/").split("/", 1)[0]
    return f"/{first}" if first else "/"


def _discovery_tree(
    nodes: Sequence[str], moves: Iterable[tuple[str, str]], starts: Sequence[str]
) -> tuple[dict[str, int], dict[str, str | None]]:
    """Breadth first from the starts; moves in the order they were first observed, so a screen's
    parent is the earliest move into it from the shallowest screen."""
    known = set(nodes)
    out: dict[str, list[str]] = defaultdict(list)
    for a, b in moves:
        if a in known and b in known and a != b and b not in out[a]:
            out[a].append(b)
    depth: dict[str, int] = {}
    parent: dict[str, str | None] = {}
    queue: deque[str] = deque()
    for s in starts:
        if s in known and s not in depth:
            depth[s], parent[s] = 0, None
            queue.append(s)
    while queue:
        a = queue.popleft()
        for b in out[a]:
            if b not in depth:
                depth[b], parent[b] = depth[a] + 1, a
                queue.append(b)
    return depth, parent


def _place_tree(roots: Sequence[str], children: dict[str, list[str]]) -> dict[str, int]:
    """Tidy x slots: leaves take one slot each, left to right; a parent sits over the middle of
    its children. Iterative (deep trees must not hit the recursion limit)."""
    slot: dict[str, float] = {}
    next_leaf = 0
    for root in roots:
        stack: list[tuple[str, bool]] = [(root, False)]
        while stack:
            n, done = stack.pop()
            kids = children.get(n, [])
            if not kids:
                slot[n] = next_leaf
                next_leaf += 1
            elif done:
                slot[n] = (slot[kids[0]] + slot[kids[-1]]) / 2
            else:
                stack.append((n, True))
                stack.extend((k, False) for k in reversed(kids))
    return {n: round(s * (NODE_W + GAP_X)) for n, s in slot.items()}


def layout(nodes: Sequence[str], moves: Iterable[tuple[str, str]], starts: Sequence[str]) -> Layout:
    """Positions for `nodes` (in a stable order, e.g. first seen) from the observed `moves`
    (from, to), oldest first, and the `starts` (the screens scans started on)."""
    depth, parent = _discovery_tree(nodes, moves, starts or nodes[:1])
    children: dict[str, list[str]] = defaultdict(list)
    for n in nodes:
        p = parent.get(n)
        if p is not None:
            children[p].append(n)
    roots = [n for n in nodes if n in depth and parent[n] is None]
    xs = _place_tree(roots, children)
    unreached = tuple(n for n in nodes if n not in depth)
    last = max(depth.values(), default=-1) + 1
    for i, n in enumerate(unreached):
        xs[n] = i * (NODE_W + GAP_X)
        depth[n], parent[n] = last, None
    placed = {n: Placed(xs[n], depth[n] * (NODE_H + GAP_Y), depth[n], parent[n]) for n in nodes}
    width = max((p.x for p in placed.values()), default=0) + NODE_W
    height = max((p.y for p in placed.values()), default=0) + NODE_H
    return Layout(placed, width, height, unreached)


def collapse_families(routes: dict[str, str], open_family: str | None = None) -> dict[str, str]:
    """Node id → the id it is drawn as: itself, or `family:<family>` when the map has more than
    ``COLLAPSE_OVER`` nodes and the family holds two or more screens (R4). The open family and
    `/` stay expanded."""
    if len(routes) <= COLLAPSE_OVER:
        return {n: n for n in routes}
    members: dict[str, list[str]] = defaultdict(list)
    for n, r in routes.items():
        members[family_of(r)].append(n)
    drawn: dict[str, str] = {}
    for fam, ids in members.items():
        keep = fam in ("/", open_family) or len(ids) < 2
        for n in ids:
            drawn[n] = n if keep else f"family:{fam}"
    return drawn
