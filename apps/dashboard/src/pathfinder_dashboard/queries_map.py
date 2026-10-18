"""Read models for the portal map, Scans ▸ Map (spec 033 US1, US2; design screen 12).

Every screen of the portal is a node; its states (form steps, validation and technical states)
stack on it as a deck. Moves between screens come from executed edges; the drawing keeps the
discovery tree plus failed and blocked items, the other links only on the Links layer
(`map_layout`). Queued, failed and blocked items hang off their page as one small node each.
Read-only, like every dashboard query.
"""

from __future__ import annotations

import sqlite3
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Any

from . import map_layout
from .map_layout import NODE_H, NODE_W

LAYERS = ("states", "errors", "frontier", "links")
DEFAULT_LAYERS = frozenset({"states", "errors", "frontier"})
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


@dataclass(frozen=True)
class MapEdge:
    kind: str  # tree · link · failed
    d: str  # SVG path
    shown: bool  # seen by the chosen scans; drawn greyed when not


@dataclass(frozen=True)
class ScanChoice:
    run_id: str
    persona: str
    status: str
    started_at: str


@dataclass(frozen=True)
class MapView:
    nodes: list[MapNode]
    edges: list[MapEdge]
    width: int
    height: int
    screens: int
    transitions: int
    queued: int
    scans: list[ScanChoice]
    personas: list[str]


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


def _screen_of(r: sqlite3.Row, of_state: dict[str, str] | None) -> str | None:
    """The screen a state row belongs to: the model's (spec 039) when given, else the crawler's."""
    return of_state.get(r["state"]) if of_state is not None else r["screen_id"]


def _states(
    conn: sqlite3.Connection, portal: str, of_state: dict[str, str] | None = None
) -> dict[str, list[MapState]]:
    rows = _rows(
        conn,
        "SELECT s.id, s.id AS state, s.screen_id, s.state_kind, s.form_step_id, f.step_index,"
        " f.label, EXISTS (SELECT 1 FROM marks m WHERE m.kind = 'probe'"
        "   AND m.target_kind = 'form_step'"
        "   AND m.target_id = s.form_step_id AND m.used_by_run_id IS NULL) AS marked"
        " FROM states s LEFT JOIN form_steps f ON f.id = s.form_step_id"
        " WHERE s.portal_id = ? ORDER BY s.created_at, s.id",
        (portal,),
    )
    out: dict[str, list[MapState]] = defaultdict(list)
    for r in rows:
        screen = _screen_of(r, of_state)
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


def _seen(
    conn: sqlite3.Connection, portal: str, of_state: dict[str, str] | None = None
) -> tuple[dict[str, set[str]], list[str]]:
    """Screen → the runs that observed it; and the start screen of each run (its first page)."""
    rows = _rows(
        conn,
        "SELECT o.run_id, s.id AS state, s.screen_id, o.observed_at FROM state_observations o"
        " JOIN states s ON s.id = o.state_id"
        " WHERE s.portal_id = ? ORDER BY o.observed_at, s.id",
        (portal,),
    )
    seen: dict[str, set[str]] = defaultdict(set)
    starts: list[str] = []
    started: set[str] = set()
    for r in rows:
        screen = _screen_of(r, of_state)
        if screen is None:
            continue
        seen[screen].add(r["run_id"])
        if r["run_id"] not in started:
            started.add(r["run_id"])
            if screen not in starts:
                starts.append(screen)
    return seen, starts


def _moves(conn: sqlite3.Connection, portal: str) -> list[sqlite3.Row]:
    """Executed moves between two screens, oldest first (the discovery order)."""
    return _rows(
        conn,
        "SELECT f.screen_id AS a, t.screen_id AS b, e.run_id, e.error IS NOT NULL AS failed"
        " FROM edges e JOIN states f ON f.id = e.from_state JOIN states t ON t.id = e.to_state"
        " WHERE f.portal_id = ? AND e.status = 'executed'"
        "   AND f.screen_id IS NOT NULL AND t.screen_id IS NOT NULL AND f.screen_id <> t.screen_id"
        " ORDER BY e.created_at, e.id",
        (portal,),
    )


def _items(
    conn: sqlite3.Connection, portal: str, runs: set[str], of_state: dict[str, str] | None = None
) -> dict[str, dict[str, int]]:
    """Per screen: queued (pending and never done there), failed and blocked item counts. A
    frontier item is per run, so the same link left in two stopped scans counts once."""
    rows = _rows(
        conn,
        "SELECT s.id AS state, s.screen_id, fr.run_id, fr.status,"
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
        screen = _screen_of(r, of_state)
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


@dataclass(frozen=True)
class _Model:
    """The portal model's active screens and which screen each page version is in (spec 039)."""

    screens: list[sqlite3.Row]
    of_state: dict[str, str]


def _model(conn: sqlite3.Connection, portal: str) -> _Model | None:
    """The portal model (spec 039 M2), or None before the portal's first reconcile."""
    screens = _rows(
        conn,
        "SELECT id, route_key AS route_template, title FROM model_screens"
        " WHERE portal_id = ? AND status = 'active' ORDER BY key",
        (portal,),
    )
    if not screens:
        return None
    members = _rows(
        conn,
        "SELECT m.state_id, m.screen_id FROM screen_members m"
        " JOIN model_screens s ON s.id = m.screen_id"
        " WHERE s.portal_id = ? AND m.to_model_version IS NULL",
        (portal,),
    )
    return _Model(screens, {r["state_id"]: r["screen_id"] for r in members})


def _model_moves(conn: sqlite3.Connection, portal: str) -> list[tuple[str, str, bool, bool]]:
    """The model's links between screens, first sighting first: (a, b, shown, failed). A link not
    seen since is drawn greyed; a retired one, or one inside a screen, is not drawn."""
    rows = _rows(
        conn,
        "SELECT t.from_screen_id AS a, t.to_screen_id AS b, t.status, t.result"
        " FROM model_transitions t JOIN model_screens s ON s.id = t.from_screen_id"
        " JOIN edges e ON e.id = t.first_seen_edge_id"
        " WHERE s.portal_id = ? AND t.internal = 0 AND t.to_screen_id IS NOT NULL"
        "   AND t.status <> 'retired' ORDER BY e.created_at, t.id",
        (portal,),
    )
    return [
        (r["a"], r["b"], r["status"] != "not_seen_since", r["result"] in FAILED_RESULTS)
        for r in rows
    ]


FAILED_RESULTS = ("technical_error", "timeout")


def _screen_nodes(
    conn: sqlite3.Connection,
    portal: str,
    runs: set[str],
    open_family: str | None,
    model: _Model | None = None,
) -> tuple[dict[str, MapNode], dict[str, str], list[str]]:
    """Nodes for the screens (or their folded families), the screen → drawn-node map and the
    start screens. With a portal model the screens are the model's (spec 039)."""
    of_state = model.of_state if model else None
    screens = (
        model.screens
        if model
        else _rows(
            conn,
            "SELECT id, route_template, title FROM screens WHERE portal_id = ?"
            " ORDER BY created_at, id",
            (portal,),
        )
    )
    states = _states(conn, portal, of_state)
    seen, starts = _seen(conn, portal, of_state)
    merged = {} if model else _merged(conn, portal)
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


def _edges(
    nodes: dict[str, MapNode],
    pairs: dict[tuple[str, str], tuple[bool, bool]],
    parents: dict[str, str | None],
    links: bool,
) -> list[MapEdge]:
    out = []
    tree = set()
    for child, parent in parents.items():
        if parent is None:
            continue
        tree.add((parent, child))
        shown, failed = pairs.get((parent, child), (True, False))
        kind = "failed" if failed else "tree"
        out.append(MapEdge(kind, _curve(nodes[parent], nodes[child]), shown))
    for (a, b), (shown, failed) in pairs.items():
        if (a, b) not in tree and (links or failed):
            out.append(MapEdge("failed" if failed else "link", _curve(nodes[a], nodes[b]), shown))
    return out


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
    # The portal as it is now reads the model; one scan's own graph reads its edges (spec 039).
    model = _model(conn, portal) if f.scan is None else None
    nodes, drawn, starts = _screen_nodes(conn, portal, runs, f.open_family, model)
    pairs: dict[tuple[str, str], tuple[bool, bool]] = {}
    moves = []
    raw_moves = (
        _model_moves(conn, portal)
        if model
        else [
            (m["a"], m["b"], m["run_id"] in runs, bool(m["failed"])) for m in _moves(conn, portal)
        ]
    )
    for ra, rb, seen_now, failed_now in raw_moves:
        a, b = drawn.get(ra), drawn.get(rb)
        if a is None or b is None or a == b:
            continue
        moves.append((a, b))
        shown, failed = pairs.get((a, b), (False, False))
        pairs[(a, b)] = (shown or seen_now, failed or failed_now)
    _count_items(nodes, drawn, _items(conn, portal, runs, model.of_state if model else None))
    starts_drawn = list(dict.fromkeys(drawn[s] for s in starts if s in drawn))
    lay = map_layout.layout(list(nodes), moves, starts_drawn)
    for nid, p in lay.placed.items():
        nodes[nid].x, nodes[nid].y, nodes[nid].depth = p.x, p.y, p.depth
    parents = {nid: p.parent for nid, p in lay.placed.items()}
    for child, parent in parents.items():
        if parent is not None:
            nodes[child].near.append(parent)
            nodes[parent].near.append(child)
    edges = _edges(nodes, pairs, parents, "links" in layers)
    return MapView(
        nodes=list(nodes.values()),
        edges=edges,
        width=lay.width,
        height=lay.height,
        screens=sum(1 for n in nodes.values() if n.kind == "screen")
        + sum(n.count for n in nodes.values() if n.kind == "family"),
        transitions=len(pairs),
        queued=sum(n.queued for n in nodes.values()),
        scans=scans,
        personas=sorted({s.persona for s in scans}),
    )


def _curve(a: MapNode, b: MapNode) -> str:
    x1, y1 = a.x + NODE_W // 2, a.y + NODE_H
    x2, y2 = b.x + NODE_W // 2, b.y
    ym = (y1 + y2) // 2
    return f"M{x1} {y1} C{x1} {ym} {x2} {ym} {x2} {y2}"
