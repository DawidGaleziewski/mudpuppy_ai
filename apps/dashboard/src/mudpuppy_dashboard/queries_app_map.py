"""The React console's map of the portal model (R-96, spec 053; designer screen v2-08): the htmx
map's read model (`queries_model_map`) as typed JSON. The API places every node and draws every
edge; the app only renders them. Link states come mapped by the one status map."""

from __future__ import annotations

import sqlite3

from pydantic import BaseModel

from . import queries_model_map as qmm
from .map_layout import NODE_H
from .queries_app import Chip, StatusOut, status_out
from .queries_app_screens import Option, ProcessRef


class MapNode(BaseModel):
    id: str
    #: SC-… for a screen; a folded family's route.
    key: str
    #: screen, or family (a folded route family: opening it draws its screens).
    kind: str
    route: str
    title: str
    retired: bool
    status: StatusOut
    #: Its own actions that stay on it (retired and on-every-page ones left out).
    actions: int
    #: "2 actions inside", the chip on its box.
    inside: Chip
    #: Screens of a family.
    count: int
    chips: list[Chip]
    #: "Step 2" when the overlaid process walks it, "Trigger" where it starts.
    role: str | None
    #: Outside the overlay, or unchanged in Since previous release.
    dim: bool
    #: The nodes next to it in the discovery tree (arrow keys move there).
    near: list[str]
    x: int
    y: int
    depth: int


class MapEdge(BaseModel):
    #: unseen, unchecked, retired, changed, process, failed; None: active.
    state: str | None
    #: The SVG path.
    d: str
    #: The decision rule's condition for taking it ("age ≥ 18"), cut to one line.
    label: str
    label_x: int
    label_y: int


class OutLinkOut(BaseModel):
    to_key: str | None
    to_title: str
    #: The link's state; None when it is active (the ordinary case says nothing).
    status: StatusOut | None
    #: The action's element key.
    label: str
    rule: str


class MapFilterOut(BaseModel):
    view: str
    layers: list[str]
    process: str | None
    open: str | None


class MapData(BaseModel):
    portal: str
    #: False: the portal has no model yet (only recorded pages).
    has_model: bool
    filter: MapFilterOut
    views: list[Option]
    layer_options: list[Option]
    #: Each edge state with its word, for the legend (None: active).
    legend: list[Option]
    processes: list[ProcessRef]
    overlay: ProcessRef | None
    nodes: list[MapNode]
    edges: list[MapEdge]
    width: int
    height: int
    node_h: int
    #: Active screens and drawn links.
    screens: int
    links: int
    #: Links on every page (the menu), not drawn; of those, the ones drawn because they changed.
    bundled: int
    bundled_drawn: list[str]
    #: Since previous release: the model version it starts after and its changes.
    since: int | None
    changed: int
    #: Node id → the links out of it.
    out_links: dict[str, list[OutLinkOut]]


VIEWS = [Option(value="now", label="Now"), Option(value="since", label="Since previous release")]
LAYER_OPTIONS = [
    Option(value="retired", label="Retired links"),
    Option(value="unseen", label="Not seen since"),
    Option(value="unchecked", label="Not checked"),
]
LEGEND = [
    Option(value="", label="Active"),
    Option(value="process", label="Process overlay"),
    Option(value="changed", label="Changed link"),
    Option(value="unseen", label="Not seen since"),
    Option(value="unchecked", label="Not checked"),
    Option(value="retired", label="Retired"),
    Option(value="failed", label="Error"),
]


#: The map of a portal without a model: nothing to draw.
EMPTY = qmm.ModelMap(
    nodes=[],
    edges=[],
    width=0,
    height=0,
    screens=0,
    links=0,
    bundled=0,
    bundled_drawn=[],
    processes=[],
    overlay=None,
    since=None,
    changed=0,
)


def _node(n: qmm.ModelNode) -> MapNode:
    return MapNode(
        id=n.id,
        key=n.key,
        kind=n.kind,
        route=n.route,
        title=n.title,
        retired=n.status == "retired",
        status=status_out("model_screen", n.status),
        actions=n.actions,
        inside=Chip(word=f"{n.actions} action{'' if n.actions == 1 else 's'} inside", variant=None),
        count=n.count,
        chips=[Chip(word=w, variant=c or None) for w, c in n.chips],
        role=n.role,
        dim=n.dim,
        near=n.near,
        x=n.x,
        y=n.y,
        depth=n.depth,
    )


def _out(link: qmm.OutLink) -> OutLinkOut:
    return OutLinkOut(
        to_key=link.to_key,
        to_title=link.to_title,
        status=None if link.state == "active" else status_out("action", link.state),
        label=link.label,
        rule=link.rule,
    )


def map_data(conn: sqlite3.Connection, portal: str, f: qmm.ModelFilters) -> MapData:
    """The model map with the view, layers and overlay applied; an empty map with `has_model`
    false when the portal has no model yet."""
    has = qmm.has_model(conn, portal)
    m = qmm.model_map(conn, portal, f) if has else EMPTY
    return MapData(
        portal=portal,
        has_model=has,
        filter=MapFilterOut(
            view=f.view,
            layers=[x for x in qmm.LAYERS if x in f.layers],
            process=f.process,
            open=f.open_family,
        ),
        views=VIEWS,
        layer_options=LAYER_OPTIONS,
        legend=LEGEND,
        processes=[ProcessRef(key=k, name=n) for k, n in m.processes],
        overlay=ProcessRef(key=m.overlay[0], name=m.overlay[1]) if m.overlay else None,
        nodes=[_node(n) for n in m.nodes],
        edges=[
            MapEdge(
                state=e.state or None, d=e.d, label=e.label, label_x=e.label_x, label_y=e.label_y
            )
            for e in m.edges
        ],
        width=m.width,
        height=m.height,
        node_h=NODE_H,
        screens=m.screens,
        links=m.links,
        bundled=m.bundled,
        bundled_drawn=m.bundled_drawn,
        since=m.since,
        changed=m.changed,
        out_links={k: [_out(x) for x in v] for k, v in m.out_links.items()},
    )
