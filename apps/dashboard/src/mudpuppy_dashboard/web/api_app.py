"""The React console's JSON API (R-96, spec 050), under `/api`. Read-only, no SQL here (G-15)."""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from .. import (
    as_of,
    db,
    queries_app,
    queries_app_all_portals,
    queries_app_home,
    queries_app_stores,
    servers,
    stores,
)
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
            found = queries_app.portal_list(conn, web.settings.portals_dir, c.env)
    except db.StoreMissing:
        found = queries_app.portal_list(None, web.settings.portals_dir, c.env)
    # R-61 (spec 031 US2): live MCP servers answering on another environment or checkout.
    strays = (
        servers.stray_warnings(
            servers.live_servers(web.settings.data_dir), c.env, web.settings.portals_dir.parent
        )
        if c.store.kind == "main"
        else []
    )
    return found.model_copy(update={"workbench": web.settings.workbench, "warnings": strays})


@router.get("/portals/overview")
def overview(request: Request, env: str | None = None) -> queries_app_all_portals.AllPortalsPage:
    """All portals (v2-15): a row per portal and Review's preview across portals."""
    web = web_of(request)
    c = web.ctx(request, env)
    with store(c) as conn:
        here = queries_app.portal_list(conn, web.settings.portals_dir, c.env).portals
        return queries_app_all_portals.all_portals_page(conn, [p.id for p in here])


@router.get("/stores")
def data_stores(
    request: Request, env: str | None = None, portal: str | None = None
) -> queries_app_stores.StoreList:
    """The header's data-store picker (spec 019 US5, R-71 (d)): the store read, and the ones
    holding `portal`'s scans to switch to (`?store=` on every page and API address)."""
    web = web_of(request)
    c = web.ctx(request, env)
    every = stores.list_stores(web.settings.data_dir, web.settings.eval_root)
    return queries_app_stores.store_list(every, c.store, c.store_note, portal)


class ModelVersion(BaseModel):
    seq: int
    built_at: str
    #: "9c21 · App kalkulator", one per part that got a new release with it.
    releases: list[str]
    scan: str | None


class ModelVersions(BaseModel):
    """The As of menu (spec 040 FR-001): the portal's model versions, newest (Now) first."""

    versions: list[ModelVersion]


@router.get("/portals/{portal}/model-versions")
def model_versions(
    request: Request,
    portal: str,
    env: str | None = None,
    kind: Literal["screen", "rule", "process"] | None = None,
    key: str | None = None,
) -> ModelVersions:
    """The As of menu's versions; on one screen, rule or process (`kind`, `key`) only those it is
    in (spec 042 F-09, lost in the React port and restored in spec 074)."""
    web = web_of(request)
    c = web.ctx(request, env)
    known_portal(web, c, portal)
    with store(c) as conn:
        found = as_of.versions(conn, portal)
        since = as_of.first_seq(conn, portal, kind, key) if kind and key else None
    if since is not None:
        found = [v for v in found if v.seq >= since]
    return ModelVersions(
        versions=[
            ModelVersion(seq=v.seq, built_at=v.built_at, releases=list(v.releases), scan=v.scan)
            for v in found
        ]
    )


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
