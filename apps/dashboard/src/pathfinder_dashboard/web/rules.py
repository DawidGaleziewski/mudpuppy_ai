"""Business rules (spec 039 T100, UX-R60–R63; designer screens v2-11 and v2-12): the portal's
decision rules, exceptions first, and one rule as a decision table with its boundary tests and
history. Read-only: a person confirms or rejects a rule in Review. The export (owner answer OV-5):
every rule as DMN and Markdown plus `rules.csv`, built by `pnpm model:rules-export`."""

from __future__ import annotations

from fastapi import APIRouter, Request
from fastapi.responses import FileResponse, HTMLResponse, Response

from .. import db, rules_export
from ..queries_rules import rule_detail, rules_view
from .deps import web_of

router = APIRouter()


@router.get("/rules", response_class=HTMLResponse)
def rules_page(
    request: Request,
    env: str | None = None,
    status: str | None = None,
    check_note: str | None = None,
) -> HTMLResponse:
    web = web_of(request)
    c = web.ctx(request, env)
    try:
        with c.conn() as conn:
            v = rules_view(conn, c.portal, status)
    except db.StoreMissing as err:
        return web.missing(c, err)
    return web.render(c, "salvage/rules.html", nav_current="rules", v=v, check_note=check_note)


@router.get("/rules/export.zip", response_model=None)
def rules_zip(request: Request, env: str | None = None) -> Response:
    """Every rule as DMN and Markdown, `rules.csv` and the README (owner answer OV-5)."""
    web = web_of(request)
    c = web.ctx(request, env)
    if not c.portal:
        return Response("Pick a portal first.", status_code=404, media_type="text/plain")
    try:
        exported = rules_export.export(web.settings, c.data_dir, c.env, c.portal)
    except rules_export.ExportFailed as err:
        return Response(f"No export: {err}", status_code=404, media_type="text/plain")
    top = f"{c.portal}-rules"
    return Response(
        exported.zip_bytes(top),
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{top}.zip"'},
    )


@router.get("/rules/export/{name}", response_model=None)
def rules_file(request: Request, name: str, env: str | None = None) -> Response:
    """One file of the export: a rule's `.md` or `.dmn`, `rules.csv` or the README."""
    web = web_of(request)
    c = web.ctx(request, env)
    path = None
    if c.portal:
        try:
            path = rules_export.export(web.settings, c.data_dir, c.env, c.portal).file(name)
        except rules_export.ExportFailed:
            path = None
    if path is None:
        return Response(status_code=404)
    return FileResponse(
        path,
        media_type=rules_export.MEDIA.get(path.suffix, "text/plain"),
        filename=f"{c.portal}-{name}",
    )


@router.get("/fragments/rules/{key}/export", response_class=HTMLResponse)
def rule_export_fragment(request: Request, key: str, env: str | None = None) -> HTMLResponse:
    """A rule as the migration team reads it (v2-12 "In the export"), loaded after the page."""
    web = web_of(request)
    c = web.ctx(request, env)
    md, error = None, None
    if c.portal:
        try:
            md = rules_export.export(web.settings, c.data_dir, c.env, c.portal).markdown(key)
        except rules_export.ExportFailed as err:
            error = str(err)
    return web.render(c, "salvage/partials/rule_export.html", key=key, md=md, error=error)


@router.get("/rules/{key}", response_class=HTMLResponse)
def rule_page(request: Request, key: str, env: str | None = None) -> HTMLResponse:
    web = web_of(request)
    c = web.ctx(request, env)
    try:
        with c.conn() as conn:
            r = rule_detail(conn, c.portal, key) if c.portal else None
    except db.StoreMissing as err:
        return web.missing(c, err)
    if r is None:
        return web.render(
            c, "salvage/rule.html", status_code=404, nav_current="rules", r=None, key=key
        )
    return web.render(c, "salvage/rule.html", nav_current="rules", r=r, key=key)
