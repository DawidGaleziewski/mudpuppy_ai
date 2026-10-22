"""A documented process in the export's layout (spec 034 R-68): one tab per file of the process
folder, its pictures, and the folder as a zip. For a BA process record (`/docs/{portal}/PROC-…/
export`) and a workspace process (`/processes/PRC-…/export`, the header's portal)."""

from __future__ import annotations

from fastapi import APIRouter, Request
from fastapi.responses import FileResponse, HTMLResponse, Response

from .. import process_export
from .deps import Ctx, web_of

router = APIRouter()


def _page(request: Request, c: Ctx, portal: str, key: str, *, tab: str, base: str) -> Response:
    web = web_of(request)
    tab = tab if tab in process_export.TAB_FILES else "README.md"
    try:
        exported = process_export.export(web.settings, c.data_dir, c.env, portal, key)
    except process_export.ExportFailed as err:
        return web.render(
            c,
            "salvage/process_export.html",
            status_code=404,
            nav_current="docs",
            portal=portal,
            key=key,
            error=str(err),
            tabs=process_export.TABS,
            tab=tab,
            base=base,
            html=None,
        )
    html = process_export.render(
        exported.text(tab),
        c.url(base, tab="FILE").replace("FILE", "{file}"),
        c.url(f"{base}/images/NAME").replace("NAME", "{name}"),
        c.url(f"{base}/files/NAME").replace("NAME", "{name}"),
    )
    return web.render(
        c,
        "salvage/process_export.html",
        nav_current="docs",
        portal=portal,
        key=key,
        error=None,
        tabs=process_export.TABS,
        tab=tab,
        base=base,
        html=html,
    )


@router.get("/docs/{portal}/{key}/export", response_class=HTMLResponse)
def record_export(
    request: Request, portal: str, key: str, env: str | None = None, tab: str = "README.md"
) -> Response:
    c = web_of(request).ctx(request, env)
    return _page(request, c, portal, key, tab=tab, base=f"/docs/{portal}/{key}/export")


@router.get("/processes/{key}/export", response_class=HTMLResponse)
def workspace_export(
    request: Request, key: str, env: str | None = None, tab: str = "README.md"
) -> Response:
    c = web_of(request).ctx(request, env)
    return _page(request, c, c.portal or "", key, tab=tab, base=f"/processes/{key}/export")


def _image(request: Request, portal: str, key: str, name: str, env: str | None) -> Response:
    web = web_of(request)
    c = web.ctx(request, env)
    try:
        path = process_export.export(web.settings, c.data_dir, c.env, portal, key).image(name)
    except process_export.ExportFailed:
        path = None
    if path is None:
        return Response(status_code=404)
    return FileResponse(path, media_type="image/svg+xml" if name.endswith(".svg") else "image/png")


@router.get("/docs/{portal}/{key}/export/images/{name}", response_model=None)
def record_image(
    request: Request, portal: str, key: str, name: str, env: str | None = None
) -> Response:
    return _image(request, portal, key, name, env)


@router.get("/processes/{key}/export/images/{name}", response_model=None)
def workspace_image(request: Request, key: str, name: str, env: str | None = None) -> Response:
    c = web_of(request).ctx(request, env)
    return _image(request, c.portal or "", key, name, env)


def _data_file(request: Request, portal: str, key: str, name: str, env: str | None) -> Response:
    web = web_of(request)
    c = web.ctx(request, env)
    try:
        path = process_export.export(web.settings, c.data_dir, c.env, portal, key).data_file(name)
    except process_export.ExportFailed:
        path = None
    if path is None:
        return Response(status_code=404)
    return FileResponse(path, media_type=process_export.DATA_FILES[name])


@router.get("/docs/{portal}/{key}/export/files/{name}", response_model=None)
def record_file(
    request: Request, portal: str, key: str, name: str, env: str | None = None
) -> Response:
    return _data_file(request, portal, key, name, env)


@router.get("/processes/{key}/export/files/{name}", response_model=None)
def workspace_file(request: Request, key: str, name: str, env: str | None = None) -> Response:
    c = web_of(request).ctx(request, env)
    return _data_file(request, c.portal or "", key, name, env)


def _zip(request: Request, portal: str, key: str, env: str | None) -> Response:
    web = web_of(request)
    c = web.ctx(request, env)
    try:
        exported = process_export.export(web.settings, c.data_dir, c.env, portal, key)
    except process_export.ExportFailed as err:
        return Response(f"No export: {err}", status_code=404, media_type="text/plain")
    top = f"{portal}-{key.lower()}"
    return Response(
        exported.zip_bytes(top),
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{top}.zip"'},
    )


@router.get("/docs/{portal}/{key}/export.zip", response_model=None)
def record_zip(request: Request, portal: str, key: str, env: str | None = None) -> Response:
    return _zip(request, portal, key, env)


@router.get("/processes/{key}/export.zip", response_model=None)
def workspace_zip(request: Request, key: str, env: str | None = None) -> Response:
    c = web_of(request).ctx(request, env)
    return _zip(request, c.portal or "", key, env)
