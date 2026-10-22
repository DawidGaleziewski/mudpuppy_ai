"""Screens ▸ Map (spec 039 T100, designer screen v2-08; spec 033 US1, US2, screen 12). A portal with
a model opens on the model's map: views Now and Since previous release, link-state layers, a
process overlay and the model inspector. The view One scan's path (and a portal without a model)
draws the recorded map: every recorded screen, the discovery tree, items left on each page and the
Probe and next-scan marks, which post to the screen page's mark routes (spec 032, R-66) through
the chat service and come back here. Read-only."""

from __future__ import annotations

import sqlite3

from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse

from .. import (
    db,
    map_layout,
    queries_map,
    queries_map_node,
    queries_model_map,
    queries_model_screens,
    queries_plan,
)
from .deps import Ctx, Web, web_of

router = APIRouter()


def _filters(
    scan: str | None, persona: str | None, layers: list[str] | None, open_family: str | None
) -> queries_map.MapFilters:
    """From the page address (FR-007)."""
    return queries_map.MapFilters(
        scan=scan or None,
        persona=persona or None,
        layers=_layers(layers, queries_map.LAYERS, queries_map.DEFAULT_LAYERS),
        open_family=_family(open_family),
    )


def _model_filters(
    view: str, layers: list[str] | None, process: str | None, open_family: str | None
) -> queries_model_map.ModelFilters:
    return queries_model_map.ModelFilters(
        view=view,
        layers=_layers(layers, queries_model_map.LAYERS, queries_model_map.DEFAULT_LAYERS),
        process=process or None,
        open_family=_family(open_family),
    )


def _layers(
    given: list[str] | None, every: tuple[str, ...], default: frozenset[str]
) -> frozenset[str]:
    """`layers` is repeated (one per ticked box, plus an empty one the form always sends, so "none
    ticked" differs from "not given"). Names of the other map's layers (the view just changed
    between the model map and the recorded one) mean "not given"."""
    chosen = frozenset(x for x in given or [] if x in every)
    if given is None or (not chosen and any(given)):
        return default
    return chosen


def _family(open_family: str | None) -> str | None:
    return open_family if open_family and open_family.startswith("/") else None


def _layers_param(
    chosen: frozenset[str], default: frozenset[str], every: tuple[str, ...]
) -> list[str] | None:
    return None if chosen == default else ["", *(x for x in every if x in chosen)]


def _self_url(c: Ctx, f: queries_map.MapFilters, show: str, node: str | None = None) -> str:
    return c.url(
        "/map",
        view="path",
        scan=f.scan,
        persona=f.persona,
        layers=_layers_param(f.layers, queries_map.DEFAULT_LAYERS, queries_map.LAYERS),
        show=show if show == "list" else None,
        open=f.open_family,
        node=node,
    )


def _model_url(c: Ctx, f: queries_model_map.ModelFilters, show: str, **more: str | None) -> str:
    return c.url(
        "/map",
        view=f.view if f.view != "now" else None,
        layers=_layers_param(f.layers, queries_model_map.DEFAULT_LAYERS, queries_model_map.LAYERS),
        process=f.process,
        show=show if show == "list" else None,
        open=f.open_family,
        **more,
    )


@router.get("/map", response_class=HTMLResponse)
def map_page(
    request: Request,
    env: str | None = None,
    view: str = "now",
    show: str = "graph",
    scan: str | None = None,
    persona: str | None = None,
    process: str | None = None,
    open: str | None = None,
    node: str | None = None,
    probe_note: str | None = None,
) -> HTMLResponse:
    web = web_of(request)
    c = web.ctx(request, env)
    given = request.query_params.getlist("layers") if "layers" in request.query_params else None
    # The toolbar form keeps the current view in a hidden field first; a view button adds its own
    # after it, so the last one wins (Apply and Graph / List keep the view).
    view = (request.query_params.getlist("view") or [view])[-1]
    view = view if view in queries_model_map.VIEWS else "now"
    show = "list" if show == "list" else "graph"
    if not c.portal:
        f = _filters(scan, persona, given, open)
        return web.render(c, "salvage/map.html", nav_current="screens", m=None, f=f, show=show)
    try:
        with c.conn() as conn:
            if view != "path" and queries_model_map.has_model(conn, c.portal):
                mf = _model_filters(view, given, process, open)
                return _model_page(web, c, conn, c.portal, mf, show, node)
            f = _filters(scan, persona, given, open)
            return _recorded_page(web, c, conn, c.portal, f, show, node, probe_note)
    except db.StoreMissing as err:
        return web.missing(c, err)


def _model_page(
    web: Web,
    c: Ctx,
    conn: sqlite3.Connection,
    portal: str,
    f: queries_model_map.ModelFilters,
    show: str,
    node: str | None,
) -> HTMLResponse:
    m = queries_model_map.model_map(conn, portal, f)
    detail = queries_model_screens.screen_detail(conn, portal, node) if node else None
    return web.render(
        c,
        "salvage/model_map.html",
        nav_current="screens",
        m=m,
        f=f,
        show=show,
        d=detail,
        selected=node if detail else None,
        node_h=map_layout.NODE_H,
        url_of=lambda **more: _model_url(c, f, show, **more),
        list_url=_model_url(c, f, "list"),
        graph_url=_model_url(c, f, "graph"),
    )


def _recorded_page(
    web: Web,
    c: Ctx,
    conn: sqlite3.Connection,
    portal: str,
    f: queries_map.MapFilters,
    show: str,
    node: str | None,
    probe_note: str | None,
) -> HTMLResponse:
    m = queries_map.map_view(conn, portal, f)
    detail = queries_map_node.node_detail(conn, portal, node) if node else None
    return web.render(
        c,
        "salvage/map.html",
        nav_current="screens",
        m=m,
        f=f,
        show=show,
        has_model=queries_model_map.has_model(conn, portal),
        detail=detail,
        selected=detail.screen_id if detail else None,
        back=_back_of(_self_url(c, f, show), detail.screen_id) if detail else "/map?view=path",
        probe_note=probe_note,
        open_marks=queries_plan.open_mark_count(conn, portal),
        node_h=map_layout.NODE_H,
        self_url=_self_url(c, f, show),
        list_url=_self_url(c, f, "list"),
        graph_url=_self_url(c, f, "graph"),
    )


@router.get("/fragments/map/node/{screen_id}", response_class=HTMLResponse)
def map_node_fragment(request: Request, screen_id: str, env: str | None = None) -> HTMLResponse:
    """The recorded map's inspector for one node (htmx swap into `#map-inspector`)."""
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


@router.get("/fragments/map/screen/{key}", response_class=HTMLResponse)
def model_node_fragment(request: Request, key: str, env: str | None = None) -> HTMLResponse:
    """The model map's inspector for one screen (htmx swap into `#map-inspector`)."""
    web = web_of(request)
    c = web.ctx(request, env)
    d = None
    if c.portal:
        try:
            with c.conn() as conn:
                d = queries_model_screens.screen_detail(conn, c.portal, key)
        except db.StoreMissing as err:
            return web.missing(c, err)
    return web.render(
        c, "salvage/partials/model_map_inspector.html", d=d, status_code=200 if d else 404
    )


def _back_of(current: str, screen_id: str) -> str:
    """Where a Probe mark returns to: this map page with the node selected (only `/map`)."""
    path = current.split("://", 1)[-1]
    path = path[path.find("/") :] if "/" in path else "/map"
    if not path.startswith("/map"):
        path = "/map?view=path"
    base = path.split("#", 1)[0]
    kept = "&".join(p for p in base.partition("?")[2].split("&") if p and not p.startswith("node="))
    return f"/map?{kept + '&' if kept else ''}node={screen_id}"
