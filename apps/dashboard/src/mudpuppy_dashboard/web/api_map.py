"""The React console's map of the portal model (R-96, spec 053; designer screen v2-08). Read-only,
no SQL here (G-15)."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Query, Request
from pydantic import BaseModel

from .. import queries_app_map
from ..queries_model_map import DEFAULT_LAYERS, LAYERS, VIEWS, ModelFilters
from .api_common import known_portal, store
from .deps import web_of

router = APIRouter(prefix="/api")


class MapQuery(BaseModel):
    """The view (now, since), the layers shown (repeated; one empty value means "none ticked",
    no value at all the default ones), the process overlaid, the route family opened."""

    env: str | None = None
    view: str = "now"
    layers: list[str] | None = None
    process: str | None = None
    open: str | None = None


def _filters(q: MapQuery) -> ModelFilters:
    layers = DEFAULT_LAYERS if q.layers is None else frozenset(x for x in q.layers if x in LAYERS)
    return ModelFilters(
        view=q.view if q.view in VIEWS and q.view != "path" else "now",
        layers=layers,
        process=q.process or None,
        open_family=q.open if q.open and q.open.startswith("/") else None,
    )


@router.get("/portals/{portal}/map")
def model_map(
    request: Request, portal: str, q: Annotated[MapQuery, Query()]
) -> queries_app_map.MapData:
    """The model's map (v2-08): screens placed, links drawn in their state, the overlay applied."""
    web = web_of(request)
    c = web.ctx(request, q.env)
    known_portal(web, c, portal)
    with store(c) as conn:
        return queries_app_map.map_data(conn, portal, _filters(q))
