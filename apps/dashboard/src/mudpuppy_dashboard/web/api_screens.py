"""The React console's Screens API (R-96, spec 052): the model's screens and one screen. Read-only,
no SQL here (G-15)."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel

from .. import queries_app_screens
from ..queries_model_screens import ScreenFilter
from .api_common import known_portal, store
from .deps import web_of

router = APIRouter(prefix="/api")


class ScreensQuery(BaseModel):
    """The list's filters: status, text in the key, title or route, process ("none": in no
    process), portal part, a variant's why, the sort."""

    env: str | None = None
    status: str | None = None
    q: str = ""
    process: str | None = None
    part: str | None = None
    why: str | None = None
    sort: str = "needs"


@router.get("/portals/{portal}/screens")
def screens(
    request: Request, portal: str, s: Annotated[ScreensQuery, Query()]
) -> queries_app_screens.ScreensData:
    """The model's screens (v2-06), needs you first unless sorted otherwise."""
    web = web_of(request)
    c = web.ctx(request, s.env)
    known_portal(web, c, portal)
    f = ScreenFilter(
        status=s.status or None,
        q=s.q.strip(),
        process=s.process or None,
        part=s.part or None,
        why=s.why or None,
        sort=s.sort,
    )
    with store(c) as conn:
        return queries_app_screens.screens_data(conn, portal, f)


@router.get("/portals/{portal}/screens/{key}")
def screen(
    request: Request, portal: str, key: str, env: str | None = None
) -> queries_app_screens.ScreenDetailData:
    """One screen (v2-07): what needs you on it, its variants, actions and history."""
    web = web_of(request)
    c = web.ctx(request, env)
    with store(c) as conn:
        d = queries_app_screens.screen_detail_data(conn, portal, key)
    if d is None:
        raise HTTPException(404, f"There is no screen {key} in {portal}.")
    return d
