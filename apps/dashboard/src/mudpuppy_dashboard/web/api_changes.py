"""The React console's What changed and Before / after (R-96, spec 064; designer screens v2-02
and v2-03). Read-only: deciding a change's hypothesis goes through Review's decide API. No SQL
here (G-15)."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel

from .. import queries_app_change, queries_app_changes
from .api_common import known_portal, store
from .deps import web_of

router = APIRouter(prefix="/api/portals/{portal}/changes")


class ChangesParams(BaseModel):
    """The page's query: the range (from a version, a date or a scan; to a version) and the
    filters, as the htmx page takes them."""

    env: str | None = None
    from_seq: str | None = None
    to_seq: int | None = None
    from_date: str | None = None
    from_scan: str | None = None
    show: str = "all"
    kind: str | None = None
    process: str | None = None


@router.get("")
def changes_page(
    request: Request, portal: str, q: Annotated[ChangesParams, Query()]
) -> queries_app_changes.ChangesPage:
    web = web_of(request)
    c = web.ctx(request, q.env)
    known_portal(web, c, portal)
    asked = queries_app_changes.ChangesQuery(
        q.from_seq, q.to_seq, q.from_date, q.from_scan, q.show, q.kind, q.process
    )
    with store(c) as conn:
        return queries_app_changes.changes_page(conn, portal, asked)


@router.get("/{deviation_id}")
def change_page(
    request: Request, portal: str, deviation_id: str, env: str | None = None
) -> queries_app_change.ChangePage:
    web = web_of(request)
    c = web.ctx(request, env)
    known_portal(web, c, portal)
    with store(c) as conn:
        page = queries_app_change.change_page(conn, c.data_dir, portal, deviation_id)
    if page is None:
        raise HTTPException(404, f"There is no change {deviation_id} in {portal}.")
    return page
