"""Scans ▸ Map (spec 033 US1, US2; design screen 12): every screen of the portal as a node, the
discovery tree of moves, items left on each page, an inspector and a list view. Read-only: a
Probe mark set from the inspector posts to the screen page's mark route (spec 032), which goes
through the chat service and comes back here."""

from __future__ import annotations

from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse

from .. import db, map_layout, queries_map, queries_map_node
from .deps import Ctx, web_of

router = APIRouter()


def _filters(
    scan: str | None, persona: str | None, layers: list[str] | None, open_family: str | None
) -> queries_map.MapFilters:
    """From the page address (FR-007). `layers` is repeated (one per ticked box, plus an empty
    one the form always sends, so "none ticked" differs from "not given"); unknown names drop."""
    chosen = frozenset(x for x in (layers or []) if x in queries_map.LAYERS)
    return queries_map.MapFilters(
        scan=scan or None,
        persona=persona or None,
        layers=chosen if layers is not None else queries_map.DEFAULT_LAYERS,
        open_family=open_family if open_family and open_family.startswith("/") else None,
    )


def _self_url(c: Ctx, f: queries_map.MapFilters, view: str, node: str | None = None) -> str:
    layers = None
    if f.layers != queries_map.DEFAULT_LAYERS:
        layers = ["", *(x for x in queries_map.LAYERS if x in f.layers)]
    return c.url(
        "/map",
        scan=f.scan,
        persona=f.persona,
        layers=layers,
        view=view if view == "list" else None,
        open=f.open_family,
        node=node,
    )


@router.get("/map", response_class=HTMLResponse)
def map_page(
    request: Request,
    env: str | None = None,
    scan: str | None = None,
    persona: str | None = None,
    view: str = "graph",
    open: str | None = None,
    node: str | None = None,
    probe_note: str | None = None,
) -> HTMLResponse:
    web = web_of(request)
    c = web.ctx(request, env)
    given = request.query_params.getlist("layers") if "layers" in request.query_params else None
    f = _filters(scan, persona, given, open)
    view = "list" if view == "list" else "graph"
    if not c.portal:
        return web.render(c, "salvage/map.html", nav_current="scans", m=None, f=f, view=view)
    try:
        with c.conn() as conn:
            m = queries_map.map_view(conn, c.portal, f)
            detail = queries_map_node.node_detail(conn, c.portal, node) if node else None
    except db.StoreMissing as err:
        return web.missing(c, err)
    return web.render(
        c,
        "salvage/map.html",
        nav_current="scans",
        m=m,
        f=f,
        view=view,
        detail=detail,
        selected=detail.screen_id if detail else None,
        back=_back_of(_self_url(c, f, view), detail.screen_id) if detail else "/map",
        probe_note=probe_note,
        node_h=map_layout.NODE_H,
        self_url=_self_url(c, f, view),
        list_url=_self_url(c, f, "list"),
        graph_url=_self_url(c, f, "graph"),
    )


@router.get("/fragments/map/node/{screen_id}", response_class=HTMLResponse)
def map_node_fragment(request: Request, screen_id: str, env: str | None = None) -> HTMLResponse:
    """The inspector for one node (htmx swap into `#map-inspector`)."""
    web = web_of(request)
    c = web.ctx(request, env)
    detail = None
    if c.portal:
        try:
            with c.conn() as conn:
                detail = queries_map_node.node_detail(conn, c.portal, screen_id)
        except db.StoreMissing as err:
            return web.missing(c, err)
    back = request.headers.get("hx-current-url", "")
    return web.render(
        c,
        "salvage/partials/map_inspector.html",
        detail=detail,
        back=_back_of(back, screen_id),
        status_code=200 if detail else 404,
    )


def _back_of(current: str, screen_id: str) -> str:
    """Where a Probe mark returns to: this map page with the node selected (only `/map`)."""
    path = current.split("://", 1)[-1]
    path = path[path.find("/") :] if "/" in path else "/map"
    if not path.startswith("/map"):
        path = "/map"
    base = path.split("#", 1)[0]
    kept = "&".join(p for p in base.partition("?")[2].split("&") if p and not p.startswith("node="))
    return f"/map?{kept + '&' if kept else ''}node={screen_id}"
