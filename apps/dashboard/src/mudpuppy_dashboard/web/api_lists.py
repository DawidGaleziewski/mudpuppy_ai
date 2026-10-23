"""The React console's smaller lists (R-100, spec 071): Access by persona, Server activity,
Search and Scans by process. Read-only, no SQL here (G-15)."""

from __future__ import annotations

from fastapi import APIRouter, Request

from .. import queries_app_lists
from ..queries_settings import attributes_by_persona
from .api_common import known_portal, store
from .deps import web_of

router = APIRouter(prefix="/api")


@router.get("/portals/{portal}/access")
def access(request: Request, portal: str, env: str | None = None) -> queries_app_lists.AccessPage:
    """Which persona reached which screen (spec 024 US2)."""
    web = web_of(request)
    c = web.ctx(request, env)
    known_portal(web, c, portal)
    attrs = attributes_by_persona(web.settings.personas_dir, portal)
    with store(c) as conn:
        return queries_app_lists.access_page(conn, portal, attrs)


@router.get("/activity")
def activity(
    request: Request, env: str | None = None, cursor: str | None = None
) -> queries_app_lists.ActivityPage:
    """Tool calls made outside any scan (FR-016), newest first, a page at a time."""
    web = web_of(request)
    c = web.ctx(request, env)
    with store(c) as conn:
        return queries_app_lists.activity_page(conn, cursor or None, web.settings.page_size)


@router.get("/search")
def search(
    request: Request, q: str = "", portal: str | None = None, env: str | None = None
) -> queries_app_lists.SearchPage:
    """Screens by title or route, records by key or title, scans by id; in one portal or all."""
    c = web_of(request).ctx(request, env)
    with store(c) as conn:
        return queries_app_lists.search_page(conn, q, portal or None)


@router.get("/portals/{portal}/scans/by-process")
def scans_by_process(
    request: Request, portal: str, env: str | None = None
) -> queries_app_lists.ScanGroupsPage:
    """Which scans belong to which documented process (spec 034 R-70 (1))."""
    web = web_of(request)
    c = web.ctx(request, env)
    known_portal(web, c, portal)
    with store(c) as conn:
        return queries_app_lists.scan_groups_page(conn, portal)
