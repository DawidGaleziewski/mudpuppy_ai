"""A documented process in the export's layout for the React console (R-100, spec 071; spec 034
R-68): one tab per file of the process folder rendered as HTML, its pictures and data files, and
the folder as a zip. For a workspace process (PRC-…) and a BA process record (PROC-…), the portal
named in the address. No SQL here (G-15)."""

from __future__ import annotations

from urllib.parse import quote

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel

from .. import process_export
from .deps import web_of

router = APIRouter(prefix="/api/portals/{portal}/processes/{key}")


class ExportTab(BaseModel):
    file: str
    label: str


class ExportPage(BaseModel):
    portal: str
    key: str
    tabs: list[ExportTab]
    tab: str
    #: The file as HTML (markdown rendered without raw HTML); None when the export failed.
    html: str | None
    error: str | None
    zip: str


def _base(portal: str, key: str) -> str:
    return f"/api/portals/{quote(portal, safe='')}/processes/{quote(key, safe='')}/export"


def _exported(request: Request, portal: str, key: str, env: str | None) -> process_export.Exported:
    web = web_of(request)
    c = web.ctx(request, env)
    try:
        return process_export.export(web.settings, c.data_dir, c.env, portal, key)
    except process_export.ExportFailed as err:
        raise HTTPException(404, f"No export: {err}") from err


@router.get("/export")
def export_page(
    request: Request, portal: str, key: str, env: str | None = None, tab: str = "README.md"
) -> ExportPage:
    tab = tab if tab in process_export.TAB_FILES else "README.md"
    page = f"/app/portals/{quote(portal, safe='')}/processes/{quote(key, safe='')}/documentation"
    tabs = [ExportTab(file=f, label=label) for f, label in process_export.TABS]
    base = _base(portal, key)
    try:
        web = web_of(request)
        c = web.ctx(request, env)
        exported = process_export.export(web.settings, c.data_dir, c.env, portal, key)
    except process_export.ExportFailed as err:
        return ExportPage(
            portal=portal, key=key, tabs=tabs, tab=tab, html=None, error=str(err), zip=f"{base}.zip"
        )
    html = process_export.render(
        exported.text(tab), page + "?tab={file}", base + "/images/{name}", base + "/files/{name}"
    )
    # pictures fit the column
    html = str(html).replace("<img ", '<img style="max-width: 100%; height: auto" ')
    return ExportPage(
        portal=portal, key=key, tabs=tabs, tab=tab, html=html, error=None, zip=f"{base}.zip"
    )


@router.get("/export/images/{name}", response_model=None)
def image(request: Request, portal: str, key: str, name: str, env: str | None = None) -> Response:
    path = _exported(request, portal, key, env).image(name)
    if path is None:
        return Response(status_code=404)
    return FileResponse(path, media_type="image/svg+xml" if name.endswith(".svg") else "image/png")


@router.get("/export/files/{name}", response_model=None)
def data_file(
    request: Request, portal: str, key: str, name: str, env: str | None = None
) -> Response:
    path = _exported(request, portal, key, env).data_file(name)
    if path is None:
        return Response(status_code=404)
    return FileResponse(path, media_type=process_export.DATA_FILES[name])


@router.get("/export.zip", response_model=None)
def folder_zip(request: Request, portal: str, key: str, env: str | None = None) -> Response:
    top = f"{portal}-{key.lower()}"
    return Response(
        _exported(request, portal, key, env).zip_bytes(top),
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{top}.zip"'},
    )
