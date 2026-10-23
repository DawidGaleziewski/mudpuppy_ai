"""The React console's JSON API (R-96, spec 050), under `/api`. Read-only, no SQL here (G-15)."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request

from .. import db, queries_app, queries_app_home
from .api_common import known_portal, store
from .deps import web_of

router = APIRouter(prefix="/api")


@router.get("/portals")
def portals(request: Request, env: str | None = None) -> queries_app.PortalList:
    """The store's portals (the header list and the portal picker), with their scan counts."""
    web = web_of(request)
    c = web.ctx(request, env)
    try:
        with c.conn() as conn:
            return queries_app.portal_list(conn, web.settings.portals_dir, c.env)
    except db.StoreMissing:
        return queries_app.portal_list(None, web.settings.portals_dir, c.env)


@router.get("/portals/{portal}/home")
def home(request: Request, portal: str, env: str | None = None) -> queries_app_home.PortalHomeData:
    """A portal's home (v2-01): releases, the last scan, what needs you, the counts."""
    web = web_of(request)
    c = web.ctx(request, env)
    known_portal(web, c, portal)
    with store(c) as conn:
        return queries_app_home.portal_home_data(conn, portal, c.env)


@router.get("/portals/{portal}/scans")
def scans(request: Request, portal: str, env: str | None = None) -> queries_app.ScanList:
    """The portal's newest scans."""
    web = web_of(request)
    c = web.ctx(request, env)
    with store(c) as conn:
        scans = queries_app.scan_list(conn, portal)
    configured = (web.settings.portals_dir / portal / "portal.yaml").is_file()
    if scans.total == 0 and not configured:
        raise HTTPException(404, f"There is no portal {portal} here.")
    return scans
