"""The React console's scan page (R-96, spec 054): one scan's summary and tabs, its hooks, and its
Graph tab (`queries_run_graph`, spec 035) as typed JSON. The API places every node and sends every
word. Scan ids are whole (D-9)."""

from __future__ import annotations

import sqlite3

from pydantic import BaseModel

from . import queries, queries_docs, queries_hooks, queries_run_graph
from .formats import fmt_duration
from .map_layout import NODE_H
from .queries_app import Chip, StatusOut, status_out
from .queries_app_screens import Option
from .queries_plan import VARIATIONS

#: The scan page's tabs (`web/runs.py` SECTIONS), Graph first.
TABS = (
    ("graph", "Graph"),
    ("states", "States"),
    ("actions", "Actions"),
    ("frontier", "Frontier"),
    ("forms", "Forms"),
    ("network", "Network"),
    ("robots", "Robots"),
    ("decisions", "Decisions"),
    ("trace", "Trace"),
    ("process", "Process"),
    ("docs", "Docs"),
)


class ScanTab(BaseModel):
    id: str
    label: str
    count: int


class Fact(BaseModel):
    label: str
    value: str


class HookRun(BaseModel):
    """A portal hook (spec 023 US2.3): where it ran, how often, with which outcomes."""

    point: str
    fn: str
    runs: int
    #: ok, skip, rewrite, wait, failed, timeout → count.
    outcomes: dict[str, int]
    pages_patched: int


class ScanHead(BaseModel):
    id: str
    portal: str
    persona: str
    status: StatusOut
    warning: str | None
    #: The summary's facts (UTC timestamps as stored).
    facts: list[Fact]
    tabs: list[ScanTab]
    #: Stopped or something failed: the page opens on the graph.
    needs_attention: bool
    #: The portal hooks that ran in it (spec 023 US2.3).
    hooks: list[HookRun] = []


def scan_head(conn: sqlite3.Connection, scan: str) -> ScanHead | None:
    """The scan's summary and its tabs with their counts; None for an unknown scan."""
    s = queries.run_summary(conn, scan)
    if s is None:
        return None
    r = s.run
    counts = {
        "graph": queries_run_graph.screen_count(conn, r.id),
        "states": s.states,
        "actions": s.actions,
        "frontier": s.frontier,
        "forms": s.forms,
        "network": s.network_calls,
        "robots": s.robots_policies,
        "decisions": s.decisions,
        "trace": queries.trace_calls(conn, r.id, limit=1).total,
        "process": queries_docs.process_step_count(conn, r.id),
        "docs": queries_docs.run_citing_count(conn, r.id),
    }
    show_process = r.mode == "trace" or counts["process"] > 0
    facts = [
        ("Kind", r.run_type or r.mode),
        ("Mode · environment", f"{r.mode} · {r.environment} ({r.env_version_or_date})"),
        ("Browser", f"{r.browser} · {r.viewport} · {r.locale}"),
        ("Started (UTC)", r.started_at),
        ("Ended (UTC)", r.ended_at or "—"),
        ("Duration", fmt_duration(s.duration_ms)),
        ("Steps · max depth", f"{r.steps_used} · {r.max_depth_reached}"),
        ("Transitions", str(s.transitions)),
        ("Open questions", str(s.open_questions)),
        ("Continues", r.parent_run_id or "—"),
    ]
    return ScanHead(
        id=r.id,
        portal=r.portal_id,
        persona=r.persona_id,
        status=status_out("run", r.status),
        warning=r.warning,
        facts=[Fact(label=k, value=v) for k, v in facts],
        tabs=[
            ScanTab(id=t, label=label, count=counts[t])
            for t, label in TABS
            if t != "process" or show_process
        ],
        needs_attention=queries_run_graph.needs_attention(conn, r.id),
        hooks=[
            HookRun(
                point=h.point,
                fn=h.fn,
                runs=h.runs,
                outcomes=h.outcomes,
                pages_patched=h.pages_patched,
            )
            for h in queries_hooks.hook_runs(conn, r.id)
        ],
    )


class FailureOut(BaseModel):
    transition: str
    label: str
    error: str
    at: str


class ScanNode(BaseModel):
    id: str
    route: str
    title: str
    status: StatusOut
    #: `data-state`: failed; None when observed.
    state: str | None
    #: The state this scan saw last on the screen: where Start here goes.
    state_id: str
    order: int
    failures: list[FailureOut]
    queued: int
    unreachable: int
    blocked: int
    stopped_here: bool
    chips: list[Chip]
    near: list[str]
    x: int
    y: int


class Recovery(BaseModel):
    status: StatusOut
    stopped: bool
    persona: str
    environment: str
    warning: str | None
    steps: int
    queued: int


class ScanEdge(BaseModel):
    #: failed; None: the first move into a screen.
    state: str | None
    d: str


class ScanGraph(BaseModel):
    scan: str
    recovery: Recovery
    nodes: list[ScanNode]
    edges: list[ScanEdge]
    width: int
    height: int
    node_h: int
    #: The node the scan stopped on; None when it did not stop.
    stop_node: str | None
    #: The node the page opens on: where it stopped, else the first that failed; None: none.
    open_node: str | None
    #: From the start screen to where it stopped (node ids).
    path: list[str]
    failures: int
    failed_moves: int
    unreachable: int
    variations: list[Option]
    legend: list[StatusOut]
    #: Each edge state with its word (None: a move of the discovery tree).
    edge_legend: list[Option]


def _chips(n: queries_run_graph.RunNode) -> list[Chip]:
    out = []
    if n.failures:
        out.append(Chip(word=f"{len(n.failures)} failed", variant="fail"))
    if n.unreachable:
        out.append(Chip(word=f"{n.unreachable} not found", variant="fail"))
    if n.queued:
        out.append(Chip(word=f"+{n.queued} queued", variant="dashed"))
    if n.blocked:
        out.append(Chip(word=f"{n.blocked} blocked", variant=None))
    return out


def _node(n: queries_run_graph.RunNode) -> ScanNode:
    return ScanNode(
        id=n.id,
        route=n.route,
        title=n.title,
        status=status_out("map_node", n.status),
        state=None if n.status == "observed" else n.status,
        state_id=n.state_id,
        order=n.order,
        failures=[
            FailureOut(transition=f.transition_id, label=f.label, error=f.error, at=f.at)
            for f in n.failures
        ],
        queued=n.queued,
        unreachable=n.unreachable,
        blocked=n.blocked,
        stopped_here=n.stopped_here,
        chips=_chips(n),
        near=n.near,
        x=n.x,
        y=n.y,
    )


def _open_node(g: queries_run_graph.RunGraph) -> str | None:
    """Where the scan stopped, else the first screen where something failed."""
    if g.stop_node is not None:
        return g.stop_node.id
    return next((n.id for n in g.nodes if n.status == "failed"), None)


def scan_graph(conn: sqlite3.Connection, scan: str) -> ScanGraph | None:
    """The scan's graph; None for an unknown scan."""
    g = queries_run_graph.run_graph(conn, scan)
    if g is None:
        return None
    r = g.recovery
    return ScanGraph(
        scan=scan,
        recovery=Recovery(
            status=status_out("run", r.status),
            stopped=g.stopped,
            persona=r.persona,
            environment=r.environment,
            warning=r.warning,
            steps=r.steps,
            queued=r.pending,
        ),
        nodes=[_node(n) for n in g.nodes],
        edges=[ScanEdge(state=e.kind if e.kind == "failed" else None, d=e.d) for e in g.edges],
        width=g.width,
        height=g.height,
        node_h=NODE_H,
        stop_node=g.stop_node.id if g.stop_node else None,
        open_node=_open_node(g),
        path=[n.id for n in g.path],
        failures=g.failures,
        failed_moves=g.failed_moves,
        unreachable=g.unreachable,
        variations=[Option(value=v, label=label) for v, label in VARIATIONS],
        legend=[
            status_out("map_node", "observed"),
            status_out("map_node", "failed"),
            status_out("map_node", "frontier"),
        ],
        edge_legend=[
            Option(value="", label="First move into a screen"),
            Option(value="failed", label="Failed move"),
        ],
    )
