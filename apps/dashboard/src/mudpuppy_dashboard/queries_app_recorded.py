"""The React console's recorded map (R-96, spec 054; design screen 12): Screens ▸ Map's view One
scan's path, and the map of a portal without a model. The read models `queries_map` and
`queries_map_node` as typed JSON: the API places every node, picks every edge's
state and sends every word; the app only renders them. Scan ids are whole (D-9)."""

from __future__ import annotations

import sqlite3

from pydantic import BaseModel

from . import queries_app_map, queries_model_map, queries_plan
from . import queries_map as qm
from . import queries_map_node as qmn
from .map_layout import NODE_H
from .queries_app import Chip, StatusOut, status_out
from .queries_app_screens import Option


class ScanChoiceOut(BaseModel):
    #: The whole scan id (D-9).
    id: str
    persona: str
    status: StatusOut
    started_at: str


class RecordedNode(BaseModel):
    id: str
    #: screen, or family (a folded route family: opening it draws its pages).
    kind: str
    route: str
    title: str
    status: StatusOut
    #: The node's `data-state` (failed, unobserved); None when observed.
    state: str | None
    #: Several states stacked on the screen (form steps, validation, technical).
    deck: bool
    #: The kind of its one state when that is not the main one (Validation, Technical).
    kind_status: StatusOut | None
    #: The layers' chips: states, queued, failed, blocked (only for the layers shown).
    chips: list[Chip]
    #: An open Probe mark on one of its form steps.
    marked: bool
    #: Its first recorded state; None for a family.
    first_state: str | None
    states: int
    near: list[str]
    x: int
    y: int
    depth: int


class RecordedEdge(BaseModel):
    #: failed; unseen (the chosen scans did not make it); retired (off the discovery tree, the
    #: All links layer); None: the first move into a screen.
    state: str | None
    d: str


class RecordedFilterOut(BaseModel):
    #: The whole id of the one scan shown; None: every scan (merged).
    scan: str | None
    persona: str | None
    layers: list[str]
    open: str | None


class RecordedMap(BaseModel):
    portal: str
    #: The portal has a model too (the views Now and Since exist).
    has_model: bool
    #: The map's views when the portal has a model (this one is `path`); empty without one.
    views: list[Option]
    filter: RecordedFilterOut
    layer_options: list[Option]
    #: Each edge state with its word (None: the first move into a screen).
    legend: list[Option]
    #: The nodes' statuses, for the legend.
    node_legend: list[StatusOut]
    scans: list[ScanChoiceOut]
    personas: list[str]
    nodes: list[RecordedNode]
    edges: list[RecordedEdge]
    width: int
    height: int
    node_h: int
    screens: int
    transitions: int
    queued: int
    #: Marks waiting for the next scan (the Next scan plan's count).
    open_marks: int


LAYER_OPTIONS = [
    Option(value="states", label="States"),
    Option(value="errors", label="Errors"),
    Option(value="frontier", label="Queue"),
    Option(value="links", label="All links"),
]
LEGEND = [
    Option(value="", label="First move into a screen"),
    Option(value="retired", label="Other move (All links)"),
    Option(value="unseen", label="Moved in other scans"),
    Option(value="failed", label="Failed move"),
]
NODE_LEGEND = [
    status_out("map_node", "observed"),
    status_out("map_node", "failed"),
    status_out("map_node", "unobserved"),
    status_out("map_node", "frontier"),
]


def _chips(n: qm.MapNode, layers: frozenset[str]) -> list[Chip]:
    """The chips on a node, for the layers shown."""
    out = []
    if n.kind == "screen" and len(n.states) > 1 and "states" in layers:
        out.append(Chip(word=f"{len(n.states)} states", variant=None))
    if n.queued and "frontier" in layers:
        out.append(Chip(word=f"+{n.queued} queued", variant="dashed"))
    if n.kind == "screen" and "errors" in layers:
        if n.failed:
            out.append(Chip(word=f"{n.failed} failed", variant="fail"))
        if n.blocked:
            out.append(Chip(word=f"{n.blocked} blocked", variant=None))
    return out


def _node(n: qm.MapNode, layers: frozenset[str]) -> RecordedNode:
    one = n.states[0] if len(n.states) == 1 else None
    return RecordedNode(
        id=n.id,
        kind=n.kind,
        route=n.route,
        title=n.title,
        status=status_out("map_node", n.status),
        state=None if n.status == "observed" else n.status,
        deck=n.kind == "family" or len(n.states) > 1,
        kind_status=status_out("state_kind", one.kind) if one and one.kind != "main" else None,
        chips=_chips(n, layers),
        marked=n.marked,
        first_state=n.states[0].id if n.states else None,
        states=n.count if n.kind == "family" else len(n.states),
        near=n.near,
        x=n.x,
        y=n.y,
        depth=n.depth,
    )


def _edge(e: qm.MapEdge) -> RecordedEdge:
    if e.kind == "failed":
        state: str | None = "failed"
    elif not e.shown:
        state = "unseen"
    else:
        state = "retired" if e.kind == "link" else None
    return RecordedEdge(state=state, d=e.d)


def _scan(s: qm.ScanChoice) -> ScanChoiceOut:
    return ScanChoiceOut(
        id=s.run_id, persona=s.persona, status=status_out("run", s.status), started_at=s.started_at
    )


def recorded_map(conn: sqlite3.Connection, portal: str, f: qm.MapFilters) -> RecordedMap:
    """The recorded map with the filters applied; an unknown scan or persona means every scan."""
    m = qm.map_view(conn, portal, f)
    scan = f.scan if any(s.run_id == f.scan for s in m.scans) else None
    persona = f.persona if f.persona in m.personas else None
    has_model = queries_model_map.has_model(conn, portal)
    return RecordedMap(
        portal=portal,
        has_model=has_model,
        views=queries_app_map.VIEWS if has_model else [],
        filter=RecordedFilterOut(
            scan=scan,
            persona=persona,
            layers=[x for x in qm.LAYERS if x in f.layers],
            open=f.open_family,
        ),
        layer_options=LAYER_OPTIONS,
        legend=LEGEND,
        node_legend=NODE_LEGEND,
        scans=[_scan(s) for s in m.scans],
        personas=m.personas,
        nodes=[_node(n, f.layers) for n in m.nodes],
        edges=[_edge(e) for e in m.edges],
        width=m.width,
        height=m.height,
        node_h=NODE_H,
        screens=m.screens,
        transitions=m.transitions,
        queued=m.queued,
        open_marks=queries_plan.open_mark_count(conn, portal),
    )


class StateOut(BaseModel):
    id: str
    #: "Step 1 · Your details", or "State 2".
    label: str
    kind: StatusOut


class MoveOut(BaseModel):
    label: str
    to_route: str
    to_title: str
    times: int
    failed: bool


class LeftItemOut(BaseModel):
    label: str
    reason: str | None
    status: StatusOut


class MarkOut(BaseModel):
    """A next-scan mark (design §6): set it on `state`, or (when `on`) remove it from `state`."""

    kind: str
    label: str
    hint: str
    on: bool
    state: str


class ProbeOut(BaseModel):
    #: The state of the form step the mark goes on.
    state: str
    on: bool


class RecordedNodeDetail(BaseModel):
    screen_id: str
    route: str
    title: str
    #: Its first recorded state; None when the screen has no state.
    first_state: str | None
    states: list[StateOut]
    scans: list[ScanChoiceOut]
    personas: list[str]
    moves: list[MoveOut]
    items: list[LeftItemOut]
    #: Probe outcomes ("2 next"), the happy path left out.
    outcomes: list[Chip]
    #: Empty when the screen has no state to mark.
    marks: list[MarkOut]
    probe: ProbeOut | None


def _state(s: qm.MapState, i: int) -> StateOut:
    if s.step_index:
        label = f"Step {s.step_index}" + (f" · {s.step_label}" if s.step_label else "")
    else:
        label = f"State {i}"
    return StateOut(id=s.id, label=label, kind=status_out("state_kind", s.kind))


def _marks(d: qmn.NodeDetail) -> list[MarkOut]:
    if not d.target_state:
        return []
    have = d.screen_marks or {}
    return [
        MarkOut(kind=k, label=label, hint=hint, on=k in have, state=have.get(k, d.target_state))
        for k, label, hint in qmn.SCREEN_MARKS
    ]


def recorded_node(
    conn: sqlite3.Connection, portal: str, screen_id: str
) -> RecordedNodeDetail | None:
    """One node for the inspector; None when the screen is not the portal's."""
    d = qmn.node_detail(conn, portal, screen_id)
    if d is None:
        return None
    return RecordedNodeDetail(
        screen_id=d.screen_id,
        route=d.route,
        title=d.title,
        first_state=d.states[0].id if d.states else None,
        states=[_state(s, i) for i, s in enumerate(d.states, start=1)],
        scans=[_scan(s) for s in d.scans],
        personas=sorted({s.persona for s in d.scans}),
        moves=[MoveOut.model_validate(m, from_attributes=True) for m in d.moves],
        items=[
            LeftItemOut(label=i.label, reason=i.reason, status=status_out("frontier", i.status))
            for i in d.items
        ],
        outcomes=[
            Chip(word=f"{n} {status_out('probe_outcome', k).word.lower()}", variant=None)
            for k, n in sorted(d.outcomes.items())
        ],
        marks=_marks(d),
        probe=ProbeOut(state=d.mark_state, on=d.marked) if d.mark_state else None,
    )
