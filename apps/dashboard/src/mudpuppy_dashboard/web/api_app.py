"""The React console's JSON API (R-96, spec 050), under `/api`. Read-only, no SQL here (G-15)."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request

from .. import db, queries_app, queries_app_home
from .deps import Ctx, Web, web_of

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
    _known(web, c, portal)
    try:
        with c.conn() as conn:
            return queries_app_home.portal_home_data(conn, portal, c.env)
    except db.StoreMissing as e:
        raise HTTPException(404, "This store does not exist yet. Start a scan first.") from e


def _known(web: Web, c: Ctx, portal: str) -> None:
    """404 for a portal that is neither configured nor scanned in this store."""
    if (web.settings.portals_dir / portal / "portal.yaml").is_file():
        return
    try:
        with c.conn() as conn:
            if queries_app_home.portal_scanned(conn, portal):
                return
    except db.StoreMissing:
        pass
    raise HTTPException(404, f"There is no portal {portal} here.")


@router.get("/portals/{portal}/scans")
def scans(request: Request, portal: str, env: str | None = None) -> queries_app.ScanList:
    """The portal's newest scans."""
    web = web_of(request)
    c = web.ctx(request, env)
    try:
        with c.conn() as conn:
            scans = queries_app.scan_list(conn, portal)
    except db.StoreMissing as e:
        raise HTTPException(404, "This store does not exist yet. Start a scan first.") from e
    configured = (web.settings.portals_dir / portal / "portal.yaml").is_file()
    if scans.total == 0 and not configured:
        raise HTTPException(404, f"There is no portal {portal} here.")
    return scans
