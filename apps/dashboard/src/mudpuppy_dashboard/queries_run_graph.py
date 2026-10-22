"""Read model for one scan's graph, the scan page's Graph tab (spec 035, roadmap R-74).

The map (`queries_map`) draws every screen of a portal across scans. This draws one scan: the
screens it saw and the moves it made, in the map's layout, with what failed on each screen and
where the scan stopped, so the owner sees where it broke and restarts it there (the recovery
actions of `queries_plan`). Read-only, like every dashboard query.
"""

from __future__ import annotations

import json
import sqlite3
from dataclasses import dataclass, field
from typing import Any

from . import map_layout, queries_plan
from .map_layout import NODE_H, NODE_W
from .queries_map import BLOCKED, FAILED_ITEM, MapEdge

STOPPED = ("interrupted", "stopped_warning")


@dataclass(frozen=True)
class Failure:
    """An action of this scan that failed on the screen: what Retry this path and Skip take."""

    transition_id: str
    label: str
    error: str
    at: str


@dataclass
class RunNode:
    id: str  # the screen (a merged screen is drawn as the one it was merged into)
    route: str
    title: str
    state_id: str  # the state this scan saw last on the screen: where a mark goes
    order: int  # 1 for the first screen the scan saw
    failures: list[Failure] = field(default_factory=list)
    queued: int = 0
    unreachable: int = 0  # controls the crawler could not find again
    blocked: int = 0
    stopped_here: bool = False
    near: list[str] = field(default_factory=list)
    x: int = 0
    y: int = 0

    @property
    def status(self) -> str:
        """The node's `data-state` (map_node in status_map): red only where something failed."""
        return "failed" if self.failures or self.unreachable else "observed"


@dataclass(frozen=True)
class RunGraph:
    nodes: list[RunNode]
    edges: list[MapEdge]
    width: int
    height: int
    stopped: bool
    stop_node: RunNode | None
    path: list[RunNode]  # from the start screen to the screen it stopped on
    failures: int
    failed_moves: int
    unreachable: int  # controls the crawler could not find again, over every screen
    recovery: queries_plan.Recovery


def _rows(conn: sqlite3.Connection, sql: str, args: tuple[Any, ...]) -> list[sqlite3.Row]:
    try:
        return conn.execute(sql, args).fetchall()
    except sqlite3.OperationalError:
        return []  # a store before the tables this page reads


def _merged(conn: sqlite3.Connection, portal: str) -> dict[str, str]:
    rows = _rows(
        conn,
        "SELECT id, merged_into FROM screens WHERE portal_id = ? AND merged_into IS NOT NULL",
        (portal,),
    )
    return {r["id"]: r["merged_into"] for r in rows}


def _screens(conn: sqlite3.Connection, run_id: str, merged: dict[str, str]) -> dict[str, RunNode]:
    """The screens the scan observed, in the order it first saw them (error pages included)."""
    rows = _rows(
        conn,
        "SELECT s.id AS state_id, s.screen_id, sc.route_template, sc.title"
        " FROM state_observations o JOIN states s ON s.id = o.state_id"
        " JOIN screens sc ON sc.id = s.screen_id"
        " WHERE o.run_id = ? ORDER BY o.observed_at, s.id",
        (run_id,),
    )
    nodes: dict[str, RunNode] = {}
    for r in rows:
        sid = merged.get(r["screen_id"], r["screen_id"])
        node = nodes.get(sid)
        if node is None:
            nodes[sid] = RunNode(
                sid, r["route_template"], r["title"], r["state_id"], len(nodes) + 1
            )
        else:
            node.state_id = r["state_id"]  # the latest state of the screen in this scan
    return nodes


def _label(action_json: str) -> str:
    try:
        a = json.loads(action_json)
    except ValueError:
        return "action"
    return str(a.get("accessible_name") or a.get("role") or "action")


def _failures(
    conn: sqlite3.Connection, run_id: str, merged: dict[str, str], nodes: dict[str, RunNode]
) -> None:
    rows = _rows(
        conn,
        "SELECT e.id, e.action_json, e.error, e.created_at, s.screen_id FROM transitions e"
        " JOIN states s ON s.id = e.from_state WHERE e.run_id = ? AND e.error IS NOT NULL"
        " ORDER BY e.created_at, e.id",
        (run_id,),
    )
    for r in rows:
        node = nodes.get(merged.get(r["screen_id"], r["screen_id"]))
        if node is not None:
            node.failures.append(
                Failure(
                    r["id"],
                    _label(r["action_json"]),
                    queries_plan.error_text(r["error"]),
                    r["created_at"],
                )
            )


def _items(
    conn: sqlite3.Connection, run_id: str, merged: dict[str, str], nodes: dict[str, RunNode]
) -> None:
    """This scan's frontier per screen: queued, unreachable (the crawler's failure), blocked."""
    rows = _rows(
        conn,
        "SELECT s.screen_id, fr.status, count(*) AS n FROM frontier fr"
        " JOIN states s ON s.id = fr.state_id WHERE fr.run_id = ? GROUP BY s.screen_id, fr.status",
        (run_id,),
    )
    for r in rows:
        node = nodes.get(merged.get(r["screen_id"], r["screen_id"]))
        if node is None:
            continue
        if r["status"] == "pending":
            node.queued += r["n"]
        elif r["status"] == FAILED_ITEM:
            node.unreachable += r["n"]
        elif r["status"] in BLOCKED:
            node.blocked += r["n"]


def _moves(
    conn: sqlite3.Connection, run_id: str, merged: dict[str, str]
) -> list[tuple[str, str, bool]]:
    """The scan's executed moves between two screens, in the order it made them."""
    rows = _rows(
        conn,
        "SELECT f.screen_id AS a, t.screen_id AS b, e.error IS NOT NULL AS failed"
        " FROM transitions e JOIN states f ON f.id = e.from_state"
        " JOIN states t ON t.id = e.to_state"
        " WHERE e.run_id = ? AND e.status = 'executed'"
        "   AND f.screen_id IS NOT NULL AND t.screen_id IS NOT NULL"
        " ORDER BY e.created_at, e.id",
        (run_id,),
    )
    out = []
    for r in rows:
        a, b = merged.get(r["a"], r["a"]), merged.get(r["b"], r["b"])
        if a != b:
            out.append((a, b, bool(r["failed"])))
    return out


def _curve(a: RunNode, b: RunNode) -> str:
    x1, y1 = a.x + NODE_W // 2, a.y + NODE_H
    x2, y2 = b.x + NODE_W // 2, b.y
    ym = (y1 + y2) // 2
    return f"M{x1} {y1} C{x1} {ym} {x2} {ym} {x2} {y2}"


def _edges(
    nodes: dict[str, RunNode],
    moves: list[tuple[str, str, bool]],
    parents: dict[str, str | None],
) -> list[MapEdge]:
    """The discovery tree, plus every failed move (the rest of the links would be a hairball)."""
    failed = {(a, b) for a, b, f in moves if f}
    out = [
        MapEdge("failed" if (p, child) in failed else "tree", _curve(nodes[p], nodes[child]), True)
        for child, p in parents.items()
        if p is not None
    ]
    tree = {(p, child) for child, p in parents.items() if p is not None}
    out += [
        MapEdge("failed", _curve(nodes[a], nodes[b]), True)
        for a, b in sorted(failed - tree)
        if a in nodes and b in nodes
    ]
    return out


def _stop_node(rec: queries_plan.Recovery, nodes: dict[str, RunNode]) -> RunNode | None:
    if rec.status not in STOPPED or not nodes:
        return None
    by_state = {n.state_id: n for n in nodes.values()}
    if rec.last_state and rec.last_state[0] in by_state:
        return by_state[rec.last_state[0]]
    return max(nodes.values(), key=lambda n: n.order)  # the last screen it saw


def _path(
    stop: RunNode | None, nodes: dict[str, RunNode], parents: dict[str, str | None]
) -> list[RunNode]:
    out: list[RunNode] = []
    current = stop.id if stop else None
    while current is not None and current in nodes and nodes[current] not in out:
        out.append(nodes[current])
        current = parents.get(current)
    return list(reversed(out))


def screen_count(conn: sqlite3.Connection, run_id: str) -> int:
    """The screens the scan saw (the Graph tab's count)."""
    rows = _rows(
        conn,
        "SELECT count(DISTINCT s.screen_id) AS n FROM state_observations o"
        " JOIN states s ON s.id = o.state_id WHERE o.run_id = ?",
        (run_id,),
    )
    return int(rows[0]["n"]) if rows else 0


def needs_attention(conn: sqlite3.Connection, run_id: str) -> bool:
    """A scan that stopped, or had an action fail: its page opens on the graph."""
    rows = _rows(
        conn,
        "SELECT status IN ('interrupted', 'stopped_warning')"
        " OR EXISTS (SELECT 1 FROM transitions WHERE run_id = runs.id AND error IS NOT NULL)"
        f" OR EXISTS (SELECT 1 FROM frontier WHERE run_id = runs.id AND status = '{FAILED_ITEM}')"
        " AS hot"
        " FROM runs WHERE id = ?",
        (run_id,),
    )
    return bool(rows and rows[0]["hot"])


def run_graph(conn: sqlite3.Connection, run_id: str) -> RunGraph | None:
    """One scan's graph, or None for an unknown scan."""
    rec = queries_plan.recovery(conn, run_id)
    if rec is None:
        return None
    merged = _merged(conn, rec.portal)
    nodes = _screens(conn, run_id, merged)
    _failures(conn, run_id, merged, nodes)
    _items(conn, run_id, merged, nodes)
    moves = _moves(conn, run_id, merged)
    starts = [min(nodes.values(), key=lambda n: n.order).id] if nodes else []
    lay = map_layout.layout(list(nodes), [(a, b) for a, b, _ in moves], starts)
    for nid, p in lay.placed.items():
        nodes[nid].x, nodes[nid].y = p.x, p.y
    parents = {nid: p.parent for nid, p in lay.placed.items()}
    for child, parent in parents.items():
        if parent is not None:
            nodes[child].near.append(parent)
            nodes[parent].near.append(child)
    stop = _stop_node(rec, nodes)
    if stop is not None:
        stop.stopped_here = True
    return RunGraph(
        nodes=sorted(nodes.values(), key=lambda n: n.order),
        edges=_edges(nodes, moves, parents),
        width=lay.width,
        height=lay.height,
        stopped=rec.status in STOPPED,
        stop_node=stop,
        path=_path(stop, nodes, parents),
        failures=sum(len(n.failures) for n in nodes.values()),
        failed_moves=sum(1 for _, _, f in moves if f),
        unreachable=sum(n.unreachable for n in nodes.values()),
        recovery=rec,
    )
