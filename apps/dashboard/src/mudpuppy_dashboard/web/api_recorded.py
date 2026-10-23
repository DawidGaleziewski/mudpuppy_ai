"""The React console's recorded map and Recorded pages (R-96, spec 054; design screen 12).
Read-only, no SQL here (G-15)."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel

from .. import queries_app_recorded, queries_app_recorded_pages
from ..queries_map import DEFAULT_LAYERS, LAYERS, MapFilters
from .api_common import known_portal, store
from .deps import web_of

router = APIRouter(prefix="/api")


class RecordedQuery(BaseModel):
    """The one scan shown (whole id) or none for every scan, the persona, the layers shown
    (repeated; one empty value means "none ticked", no value at all the default ones), the route
    family opened."""

    env: str | None = None
    scan: str | None = None
    persona: str | None = None
    layers: list[str] | None = None
    open: str | None = None


def _filters(q: RecordedQuery) -> MapFilters:
    layers = DEFAULT_LAYERS if q.layers is None else frozenset(x for x in q.layers if x in LAYERS)
    return MapFilters(
        scan=q.scan or None,
        persona=q.persona or None,
        layers=layers,
        open_family=q.open if q.open and q.open.startswith("/") else None,
    )


@router.get("/portals/{portal}/map/recorded")
def recorded_map(
    request: Request, portal: str, q: Annotated[RecordedQuery, Query()]
) -> queries_app_recorded.RecordedMap:
    """Every recorded screen placed, the discovery tree, what each page left (screen 12)."""
    web = web_of(request)
    c = web.ctx(request, q.env)
    known_portal(web, c, portal)
    with store(c) as conn:
        return queries_app_recorded.recorded_map(conn, portal, _filters(q))


@router.get("/portals/{portal}/map/recorded/{screen_id}")
def recorded_node(
    request: Request, portal: str, screen_id: str, env: str | None = None
) -> queries_app_recorded.RecordedNodeDetail:
    """One recorded screen for the inspector, with the marks a person can set on it."""
    web = web_of(request)
    c = web.ctx(request, env)
    known_portal(web, c, portal)
    with store(c) as conn:
        d = queries_app_recorded.recorded_node(conn, portal, screen_id)
    if d is None:
        raise HTTPException(404, f"There is no screen {screen_id} on the map of {portal}.")
    return d


@router.get("/portals/{portal}/screens/recorded")
def recorded_pages(
    request: Request,
    portal: str,
    env: str | None = None,
    q: str = "",
    page: str | None = None,
) -> queries_app_recorded_pages.RecordedPages:
    """The portal's recorded pages, 25 a page, filtered by title or route."""
    web = web_of(request)
    c = web.ctx(request, env)
    known_portal(web, c, portal)
    with store(c) as conn:
        return queries_app_recorded_pages.recorded_pages(conn, portal, q, page)
