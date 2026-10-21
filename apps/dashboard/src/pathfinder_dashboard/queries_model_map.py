"""Screens ▸ Map of the portal model (spec 039 T100, designer screen v2-08, UX-R40–R44).

The model's active screens are the nodes, its links between screens the edges, each drawn in its
state (active, not seen since, not checked, retired on its layer). Links on every page (the menu)
are bundled, not drawn, unless their state changed. Two views: Now, and Since previous release
(the changes of the latest model version, the rest dimmed). A process can be overlaid: its steps
are bold, numbered and joined, the other screens faint. Actions inside a screen are counted on
its box, never drawn. One scan's path is the recorded map (`queries_map`). Read-only.
"""

from __future__ import annotations

import json
import sqlite3
from dataclasses import dataclass, field
from itertools import pairwise

from . import map_layout
from .map_layout import NODE_H, NODE_W
from .queries_changes import Change, changes_view, rows_of

VIEWS = ("now", "since", "path")
LAYERS = ("retired", "unseen", "unchecked")
DEFAULT_LAYERS = frozenset({"unseen", "unchecked"})
# A link's state → its edge modifier and the layer that shows it ('' = always shown).
EDGE_OF = {
    "active": ("", ""),
    "not_seen_since": ("unseen", "unseen"),
    "untested": ("unchecked", "unchecked"),
    "retired": ("retired", "retired"),
}
BEST = {"active": 0, "untested": 1, "not_seen_since": 2, "retired": 3}
FAILED_RESULTS = ("technical_error", "timeout")


@dataclass
class ModelNode:
    id: str
    key: str  # SC-…; a family's route when folded
    kind: str  # screen · family
    route: str
    title: str
    status: str  # active · retired
    actions: int = 0  # inside, global and retired left out
    count: int = 0  # members of a family
    chips: list[tuple[str, str]] = field(default_factory=list)  # (word, chip modifier)
    role: str | None = None  # "Step 2" when the overlaid process walks it
    dim: bool = False  # outside the overlay, or unchanged in Since previous release
    near: list[str] = field(default_factory=list)
    x: int = 0
    y: int = 0
    depth: int = 0


@dataclass(frozen=True)
class ModelEdge:
    state: str  # '' · unseen · unchecked · retired · changed · process · failed
    d: str
    label: str = ""
    label_x: int = 0
    label_y: int = 0


@dataclass(frozen=True)
class OutLink:
    to_key: str | None
    to_title: str
    state: str  # the link's model status
    label: str  # the action's element key


@dataclass(frozen=True)
class ModelMap:
    nodes: list[ModelNode]
    edges: list[ModelEdge]
    width: int
    height: int
    screens: int
    links: int
    bundled: int  # links on every page, not drawn
    bundled_drawn: list[str]  # of those, drawn because their state changed
    processes: list[tuple[str, str]]  # (PRC key, name) for the overlay picker
    overlay: tuple[str, str] | None
    since: int | None  # the model version the Since view starts after
    changed: int  # changes in the Since view
    out_links: dict[str, list[OutLink]] = field(default_factory=dict)  # node id → links


@dataclass(frozen=True)
class ModelFilters:
    view: str = "now"
    layers: frozenset[str] = DEFAULT_LAYERS
    process: str | None = None
    open_family: str | None = None


def has_model(conn: sqlite3.Connection, portal: str) -> bool:
    return bool(rows_of(conn, "SELECT 1 FROM model_screens WHERE portal_id = ? LIMIT 1", (portal,)))


def _screens(conn: sqlite3.Connection, portal: str, retired: bool) -> list[sqlite3.Row]:
    shown = "('active','retired')" if retired else "('active')"
    return rows_of(
        conn,
        "SELECT s.id, s.key, s.route_key, s.title, s.status,"
        "  (SELECT count(*) FROM action_classes a WHERE a.screen_id = s.id AND a.is_global = 0"
        "     AND a.status <> 'retired' AND NOT EXISTS (SELECT 1 FROM model_transitions t"
        "       WHERE t.action_class_id = a.id AND t.to_screen_id IS NOT NULL"
        "         AND t.to_screen_id <> a.screen_id)) AS actions"
        f" FROM model_screens s WHERE s.portal_id = ? AND s.status IN {shown} ORDER BY s.key",
        (portal,),
    )


def _links(conn: sqlite3.Connection, portal: str) -> list[sqlite3.Row]:
    """The model's links between two screens, first sighting first."""
    return rows_of(
        conn,
        "SELECT t.from_screen_id AS a, t.to_screen_id AS b, t.status, t.result, a.is_global,"
        "  a.element_key, s.key AS a_key, ts.key AS b_key, ts.title AS b_title"
        " FROM model_transitions t JOIN model_screens s ON s.id = t.from_screen_id"
        " JOIN action_classes a ON a.id = t.action_class_id"
        " LEFT JOIN model_screens ts ON ts.id = t.to_screen_id"
        " LEFT JOIN transitions e ON e.id = t.first_seen_transition_id"
        " WHERE s.portal_id = ? AND t.internal = 0 ORDER BY e.created_at, t.id",
        (portal,),
    )


def _starts(conn: sqlite3.Connection, portal: str) -> list[str]:
    """The screen each scan started on (its first page), first scan first."""
    rows = rows_of(
        conn,
        "SELECT o.run_id, m.screen_id FROM observations o JOIN screen_members m"
        " ON m.state_id = o.state_id AND m.to_model_version IS NULL"
        " JOIN model_screens s ON s.id = m.screen_id WHERE s.portal_id = ?"
        " ORDER BY o.created_at, o.id",
        (portal,),
    )
    seen: set[str] = set()
    out: list[str] = []
    for r in rows:
        if r["run_id"] not in seen:
            seen.add(r["run_id"])
            out.append(r["screen_id"])
    return list(dict.fromkeys(out))


def processes(conn: sqlite3.Connection, portal: str) -> list[tuple[str, str, list[str]]]:
    """Each process (PRC key, name) with the model screens its as-is walks, in step order."""
    out = []
    for r in rows_of(
        conn,
        "SELECT p.key, p.name, r.steps FROM ba_processes p JOIN process_models m"
        " ON m.process_id = p.id AND m.label = 'A' JOIN process_model_revisions r"
        " ON r.model_id = m.id AND r.rev = m.rev"
        " WHERE p.portal_id = ? AND p.archived_at IS NULL ORDER BY p.key",
        (portal,),
    ):
        states = [s["state_id"] for s in json.loads(r["steps"]) if s.get("state_id")]
        screens: list[str] = []
        for st in states:
            hit = rows_of(
                conn,
                "SELECT screen_id FROM screen_members WHERE state_id = ?"
                " AND to_model_version IS NULL",
                (st,),
            )
            if hit and hit[0]["screen_id"] not in screens:
                screens.append(hit[0]["screen_id"])
        out.append((r["key"], r["name"], screens))
    return out


def _since(conn: sqlite3.Connection, portal: str) -> tuple[int | None, list[Change]]:
    """The changes of the latest model version (Since previous release)."""
    latest = changes_view(conn, portal).latest_seq
    if latest is None:
        return None, []
    return latest - 1, changes_view(conn, portal, from_seq=latest - 1).all_changes()


def _chips(changes: list[Change]) -> dict[str, list[tuple[str, str]]]:
    out: dict[str, list[tuple[str, str]]] = {}
    for c in changes:
        if not c.screen_key:
            continue
        why = c.explanation
        word, chip = ("New", "") if c.kind == "new_screen" else (why.word, why.chip)
        chips = out.setdefault(c.screen_key, [])
        if (word, chip) not in chips:
            chips.append((word, chip))
    return out


def _nodes(
    rows: list[sqlite3.Row], open_family: str | None
) -> tuple[dict[str, ModelNode], dict[str, str]]:
    drawn = map_layout.collapse_families({r["id"]: r["route_key"] for r in rows}, open_family)
    nodes: dict[str, ModelNode] = {}
    for r in rows:
        did = drawn[r["id"]]
        if did == r["id"]:
            nodes[did] = ModelNode(
                did, r["key"], "screen", r["route_key"], r["title"], r["status"], r["actions"]
            )
            continue
        route = did.removeprefix("family:")
        fam = nodes.setdefault(did, ModelNode(did, route, "family", route, "", "active"))
        fam.count += 1
        fam.title = f"{fam.count} screens"
    return nodes, drawn


def _pair_state(rows: list[sqlite3.Row], failed: bool) -> str:
    best = min((r["status"] for r in rows), key=lambda s: BEST.get(s, 9))
    return "failed" if failed and best == "active" else EDGE_OF.get(best, ("", ""))[0]


@dataclass
class _Sorted:
    """The links sorted out: drawn between two nodes, bundled (the menu), and per node."""

    pairs: dict[tuple[str, str], list[sqlite3.Row]] = field(default_factory=dict)
    bundled: set[str] = field(default_factory=set)
    bundled_drawn: list[str] = field(default_factory=list)
    out_links: dict[str, list[OutLink]] = field(default_factory=dict)


def _sort_links(links: list[sqlite3.Row], drawn: dict[str, str], layers: frozenset[str]) -> _Sorted:
    """A link off its layer is left out; one on every page is bundled unless its state changed."""
    out = _Sorted()
    for r in links:
        layer = EDGE_OF.get(r["status"], ("", ""))[1]
        if layer and layer not in layers:
            continue
        if r["is_global"] and r["status"] in ("active", "retired"):
            out.bundled.add(r["element_key"])
            continue
        if r["is_global"]:
            out.bundled_drawn.append(r["b_title"] or r["element_key"])
        a, b = drawn.get(r["a"]), drawn.get(r["b"] or "")
        if a is not None:
            out.out_links.setdefault(a, []).append(
                OutLink(r["b_key"], r["b_title"] or "no page", r["status"], r["element_key"])
            )
        if a is not None and b is not None and a != b:
            out.pairs.setdefault((a, b), []).append(r)
    return out


def model_map(conn: sqlite3.Connection, portal: str, f: ModelFilters | None = None) -> ModelMap:
    """The whole model map with the view, layers and overlay applied."""
    f = f or ModelFilters()
    rows = _screens(conn, portal, "retired" in f.layers)
    nodes, drawn = _nodes(rows, f.open_family)
    since, changes = _since(conn, portal) if f.view == "since" else (None, [])
    changed_keys = {(c.screen_key, c.element_key) for c in changes if c.element_key}
    s = _sort_links(_links(conn, portal), drawn, f.layers)
    pairs = s.pairs
    starts = [drawn[x] for x in _starts(conn, portal) if x in drawn]
    lay = map_layout.layout(list(nodes), list(pairs), list(dict.fromkeys(starts)))
    for nid, p in lay.placed.items():
        nodes[nid].x, nodes[nid].y, nodes[nid].depth = p.x, p.y, p.depth
        if p.parent is not None:
            nodes[nid].near.append(p.parent)
            nodes[p.parent].near.append(nid)
    edges = []
    for (a, b), rs in pairs.items():
        failed = any(r["result"] in FAILED_RESULTS for r in rs)
        state = _pair_state(rs, failed)
        if any((r["a_key"], r["element_key"]) in changed_keys for r in rs):
            state = "changed"
        edges.append(ModelEdge(state, _curve(nodes[a], nodes[b])))
    every = processes(conn, portal)
    overlay = next((p for p in every if p[0] == f.process), None)
    if overlay:
        edges += _overlay(nodes, drawn, overlay[2])
    if f.view == "since":
        chips = _chips(changes)
        for n in nodes.values():
            n.chips = chips.get(n.key, [])
            n.dim = not n.chips
    return ModelMap(
        nodes=list(nodes.values()),
        edges=edges,
        width=lay.width,
        height=lay.height,
        screens=sum(1 for r in rows if r["status"] == "active"),
        links=len(pairs),
        bundled=len(s.bundled),
        bundled_drawn=list(dict.fromkeys(s.bundled_drawn)),
        processes=[(k, n) for k, n, _ in every],
        overlay=(overlay[0], overlay[1]) if overlay else None,
        since=since,
        changed=len(changes),
        out_links=s.out_links,
    )


def _overlay(
    nodes: dict[str, ModelNode], drawn: dict[str, str], steps: list[str]
) -> list[ModelEdge]:
    """The overlaid process: its screens numbered and bold, the rest faint, its steps joined."""
    walked = [drawn[s] for s in steps if s in drawn]
    for i, nid in enumerate(dict.fromkeys(walked), start=1):
        nodes[nid].role = f"Step {i}"
    for n in nodes.values():
        n.dim = n.dim or n.role is None
    return [ModelEdge("process", _curve(nodes[a], nodes[b])) for a, b in pairwise(walked) if a != b]


def _curve(a: ModelNode, b: ModelNode) -> str:
    x1, y1 = a.x + NODE_W // 2, a.y + NODE_H
    x2, y2 = b.x + NODE_W // 2, b.y
    ym = (y1 + y2) // 2
    return f"M{x1} {y1} C{x1} {ym} {x2} {ym} {x2} {y2}"
