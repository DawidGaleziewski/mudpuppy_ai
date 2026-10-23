"""Read models for the recorded map (spec 033 US1, US2; design screen 12): Screens ▸ Map's view
One scan's path, and the whole map of a portal without a model (the model's is
`queries_model_map`, spec 039 T100).

Every screen of the portal is a node; its states (form steps, validation and technical states)
stack on it as a deck. Moves between screens come from executed transitions; the layout is the
discovery tree (`map_layout`), the edges are `map_edges`: the tree, moves off it (layer on by
default), other scans' moves (layer off) and failed moves. Queued, failed and blocked items hang
off their page as chips. Read-only, like every dashboard query.
"""

from __future__ import annotations

import sqlite3
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Any

from . import map_layout
from .map_edges import ARC_ROOM, Edge, Pair, Returns, edges
from .map_layout import NODE_H, NODE_W

LAYERS = ("states", "errors", "frontier", "offtree", "others")
DEFAULT_LAYERS = frozenset({"states", "errors", "frontier", "offtree"})
BLOCKED = ("skipped_unsafe", "denylisted", "robots_disallowed")
FAILED_ITEM = "unreachable"  # the crawler could not find the control again (its failure)


@dataclass(frozen=True)
class MapState:
    id: str
    kind: str
    step_index: int | None
    step_label: str | None
    form_step_id: str | None
    marked: bool


@dataclass
class MapNode:
    id: str
    kind: str  # screen · family
    route: str
    title: str
    status: str  # observed · unobserved · failed (`data-state`)
    states: list[MapState] = field(default_factory=list)
    count: int = 0  # members of a family
    marked: bool = False
    # Items left on the page (chips, as screen 12 draws them): queued, failed, blocked.
    queued: int = 0
    failed: int = 0
    blocked: int = 0
    near: list[str] = field(default_factory=list)  # tree neighbours, for the arrow keys (FR-009)
    x: int = 0
    y: int = 0
    depth: int = 0
    # More than six off-tree lines end here: drawn as a chip instead (map_edges).
    returns: Returns | None = None


@dataclass(frozen=True)
class MapEdge:
    """A scan graph's edge (`queries_run_graph`); the recorded map's are `map_edges.Edge`."""

    kind: str  # tree · failed
    d: str  # SVG path
    shown: bool


@dataclass(frozen=True)
class ScanChoice:
    run_id: str
    persona: str
    status: str
    started_at: str


@dataclass(frozen=True)
class MapView:
    nodes: list[MapNode]
    edges: list[Edge]
    width: int
    height: int
    screens: int
    transitions: int
    queued: int
    scans: list[ScanChoice]
    personas: list[str]
    others: int = 0  # page pairs only other scans moved between


def _rows(conn: sqlite3.Connection, sql: str, args: tuple[Any, ...]) -> list[sqlite3.Row]:
    try:
        return conn.execute(sql, args).fetchall()
    except sqlite3.OperationalError:
        return []  # a store before the tables this page reads


def scans_of(conn: sqlite3.Connection, portal: str) -> list[ScanChoice]:
    rows = _rows(
        conn,
        "SELECT id, persona_id, status, started_at FROM runs WHERE portal_id = ?"
        " ORDER BY started_at DESC, id DESC",
        (portal,),
    )
    return [ScanChoice(r["id"], r["persona_id"], r["status"], r["started_at"]) for r in rows]


def _chosen(scans: list[ScanChoice], scan: str | None, persona: str | None) -> set[str]:
    """The runs the filters keep; an unknown scan or persona is ignored (all scans)."""
    runs = [s for s in scans if persona is None or s.persona == persona] or scans
    if scan and any(s.run_id == scan for s in runs):
        return {scan}
    return {s.run_id for s in runs}


def _states(conn: sqlite3.Connection, portal: str) -> dict[str, list[MapState]]:
    rows = _rows(
        conn,
        "SELECT s.id, s.screen_id, s.state_kind, s.form_step_id, f.step_index,"
        " f.label, EXISTS (SELECT 1 FROM marks m WHERE m.kind = 'probe'"
        "   AND m.form_step_id = s.form_step_id AND m.used_by_run_id IS NULL) AS marked"
        " FROM states s LEFT JOIN form_steps f ON f.id = s.form_step_id"
        " WHERE s.portal_id = ? ORDER BY s.created_at, s.id",
        (portal,),
    )
    out: dict[str, list[MapState]] = defaultdict(list)
    for r in rows:
        screen = r["screen_id"]
        if screen is None:
            continue
        out[screen].append(
            MapState(
                r["id"],
                r["state_kind"] or "main",
                r["step_index"],
                r["label"],
                r["form_step_id"],
                bool(r["marked"]),
            )
        )
    return out


def _seen(conn: sqlite3.Connection, portal: str) -> tuple[dict[str, set[str]], list[str]]:
    """Screen → the runs that observed it; and the start screen of each run (its first page)."""
    rows = _rows(
        conn,
        "SELECT o.run_id, s.screen_id, o.observed_at FROM state_observations o"
        " JOIN states s ON s.id = o.state_id"
        " WHERE s.portal_id = ? ORDER BY o.observed_at, s.id",
        (portal,),
    )
    seen: dict[str, set[str]] = defaultdict(set)
    starts: list[str] = []
    started: set[str] = set()
    for r in rows:
        screen = r["screen_id"]
        if screen is None:
            continue
        seen[screen].add(r["run_id"])
        if r["run_id"] not in started:
            started.add(r["run_id"])
            if screen not in starts:
                starts.append(screen)
    return seen, starts


def _moves(conn: sqlite3.Connection, portal: str) -> list[sqlite3.Row]:
    """Executed moves between two screens, oldest first (the discovery order), each with its step:
    its place among its scan's executed moves (`↩ step 140`)."""
    return _rows(
        conn,
        "SELECT a, b, run_id, failed, step FROM ("
        "  SELECT f.screen_id AS a, t.screen_id AS b, e.run_id, e.error IS NOT NULL AS failed,"
        "   e.created_at, e.id,"
        "   row_number() OVER (PARTITION BY e.run_id ORDER BY e.created_at, e.id) AS step"
        "  FROM transitions e JOIN states f ON f.id = e.from_state"
        "  JOIN states t ON t.id = e.to_state"
        "  WHERE f.portal_id = ? AND e.status = 'executed')"
        " WHERE a IS NOT NULL AND b IS NOT NULL AND a <> b"
        " ORDER BY created_at, id",
        (portal,),
    )


def _items(conn: sqlite3.Connection, portal: str, runs: set[str]) -> dict[str, dict[str, int]]:
    """Per screen: queued (pending and never done there), failed and blocked item counts. A
    frontier item is per run, so the same link left in two stopped scans counts once."""
    rows = _rows(
        conn,
        "SELECT s.screen_id, fr.run_id, fr.status,"
        " json_extract(fr.action_json, '$.role') || '|' ||"
        " coalesce(json_extract(fr.action_json, '$.accessible_name'), '') || '|' ||"
        " coalesce(json_extract(fr.action_json, '$.href'),"
        "   json_extract(fr.action_json, '$.url'), '') AS k"
        " FROM frontier fr JOIN states s ON s.id = fr.state_id"
        " WHERE s.portal_id = ?",
        (portal,),
    )
    done: dict[str, set[str]] = defaultdict(set)
    seen: dict[str, dict[str, set[str]]] = defaultdict(lambda: defaultdict(set))
    for r in rows:
        screen = r["screen_id"]
        if screen is None:
            continue
        if r["status"] == "done":
            done[screen].add(r["k"])
        elif r["run_id"] in runs:
            seen[screen][_item_kind(r["status"])].add(r["k"])
    return {
        screen: {kind: len(keys - done[screen]) for kind, keys in kinds.items() if kind}
        for screen, kinds in seen.items()
    }


def _item_kind(status: str) -> str:
    if status == "pending":
        return "queued"
    if status == FAILED_ITEM:
        return "failed"
    return "blocked" if status in BLOCKED else ""  # scope and budget skips are not drawn


def _screen_nodes(
    conn: sqlite3.Connection, portal: str, runs: set[str], open_family: str | None
) -> tuple[dict[str, MapNode], dict[str, str], list[str]]:
    """Nodes for the recorded screens (or their folded families), the screen → drawn-node map and
    the start screens."""
    screens = _rows(
        conn,
        "SELECT id, route_template, title FROM screens WHERE portal_id = ? ORDER BY created_at, id",
        (portal,),
    )
    states = _states(conn, portal)
    seen, starts = _seen(conn, portal)
    merged = _merged(conn, portal)
    own_screens = [r for r in screens if r["id"] not in merged]
    drawn = map_layout.collapse_families(
        {r["id"]: r["route_template"] for r in own_screens}, open_family
    )
    nodes: dict[str, MapNode] = {}
    for r in own_screens:
        did, shown = drawn[r["id"]], bool(seen[r["id"]] & runs)
        own = states.get(r["id"], [])
        if did == r["id"]:
            status = "observed" if shown else "unobserved"
            nodes[did] = MapNode(did, "screen", r["route_template"], r["title"], status, own)
            nodes[did].marked = any(s.marked for s in own)
            continue
        fam = nodes.setdefault(
            did, MapNode(did, "family", did.removeprefix("family:"), "", "unobserved")
        )
        fam.count += 1
        fam.title = f"{fam.count} pages"
        if shown:
            fam.status = "observed"
    _fold_merged(nodes, drawn, merged, states, seen, runs)
    return nodes, drawn, starts


def _merged(conn: sqlite3.Connection, portal: str) -> dict[str, str]:
    """Screen → the screen the owner merged it into (a confirmed `same` verdict, FR-021)."""
    rows = _rows(
        conn,
        "SELECT id, merged_into FROM screens WHERE portal_id = ? AND merged_into IS NOT NULL",
        (portal,),
    )
    return {r["id"]: r["merged_into"] for r in rows}


def _fold_merged(
    nodes: dict[str, MapNode],
    drawn: dict[str, str],
    merged: dict[str, str],
    states: dict[str, list[MapState]],
    seen: dict[str, set[str]],
    runs: set[str],
) -> None:
    """A merged screen is drawn as part of its target: its states join the target's deck."""
    for screen, into in merged.items():
        target = drawn.get(into)
        if target is None:
            continue
        drawn[screen] = target
        node = nodes[target]
        if node.kind == "screen":
            node.states = [*node.states, *states.get(screen, [])]
            node.marked = node.marked or any(s.marked for s in states.get(screen, []))
        if seen[screen] & runs and node.status == "unobserved":
            node.status = "observed"


def _count_items(
    nodes: dict[str, MapNode], drawn: dict[str, str], items: dict[str, dict[str, int]]
) -> None:
    """Queued, failed and blocked counts on the node of their page (a family sums its pages);
    a page the crawler failed on is drawn failed, red only there (FR-003)."""
    for screen, kinds in items.items():
        node = nodes.get(drawn.get(screen, ""))
        if node is None:
            continue
        node.queued += kinds.get("queued", 0)
        node.failed += kinds.get("failed", 0)
        node.blocked += kinds.get("blocked", 0)
        if node.failed and node.status == "observed":
            node.status = "failed"


@dataclass(frozen=True)
class MapFilters:
    """What the page address asks for (FR-007); unknown values fall back to the default."""

    scan: str | None = None
    persona: str | None = None
    layers: frozenset[str] = DEFAULT_LAYERS
    open_family: str | None = None


def map_view(conn: sqlite3.Connection, portal: str, filters: MapFilters | None = None) -> MapView:
    """The whole map of a portal with the filters applied (FR-001…FR-008)."""
    f = filters or MapFilters()
    layers = f.layers
    scans = scans_of(conn, portal)
    runs = _chosen(scans, f.scan, f.persona)
    nodes, drawn, starts = _screen_nodes(conn, portal, runs, f.open_family)
    pairs: dict[tuple[str, str], Pair] = {}
    moves = []
    for m in _moves(conn, portal):
        a, b = drawn.get(m["a"]), drawn.get(m["b"])
        if a is None or b is None or a == b:
            continue
        moves.append((a, b))
        pairs.setdefault((a, b), Pair()).add(
            m["run_id"], m["step"], m["run_id"] in runs, bool(m["failed"])
        )
    _count_items(nodes, drawn, _items(conn, portal, runs))
    starts_drawn = list(dict.fromkeys(drawn[s] for s in starts if s in drawn))
    lay = map_layout.layout(list(nodes), moves, starts_drawn)
    for nid, p in lay.placed.items():
        # room above the top row for the arcs of moves back up the tree (map_edges)
        nodes[nid].x, nodes[nid].y, nodes[nid].depth = p.x, p.y + ARC_ROOM, p.depth
    parents = {nid: p.parent for nid, p in lay.placed.items()}
    for child, parent in parents.items():
        if parent is not None:
            nodes[child].near.append(parent)
            nodes[parent].near.append(child)
    drawing = edges(dict(nodes), pairs, parents, layers, (NODE_W, NODE_H))
    for nid, r in drawing.returns.items():
        nodes[nid].returns = r
    return MapView(
        nodes=list(nodes.values()),
        edges=drawing.edges,
        width=lay.width,
        height=lay.height + ARC_ROOM,
        screens=sum(1 for n in nodes.values() if n.kind == "screen")
        + sum(n.count for n in nodes.values() if n.kind == "family"),
        transitions=len(pairs),
        queued=sum(n.queued for n in nodes.values()),
        scans=scans,
        personas=sorted({s.persona for s in scans}),
        others=drawing.others,
    )
