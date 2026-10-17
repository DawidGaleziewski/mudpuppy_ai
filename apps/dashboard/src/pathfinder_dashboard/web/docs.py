"""Documentation pages (spec 004, R-15; contracts/http-routes-docs.md): the BA's records as an SRS,
their sessions, and the review POST (the dashboard's only write path, a subprocess)."""

from __future__ import annotations

import sqlite3
from urllib.parse import parse_qs, quote

from fastapi import APIRouter, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import HTMLResponse, PlainTextResponse, RedirectResponse, Response
from starlette.exceptions import HTTPException

from .. import db, neighbours, queries, queries_docs, review, stores
from .deps import Ctx, Web, build_url, same_origin, web_of
from .views_docs import (
    docs_index_values,
    docs_portals_values,
    docs_section_values,
    record_values,
    refusal,
    session_values,
)

router = APIRouter()


def docs_not_found(web: Web, c: Ctx, what: str, fragment: bool = False) -> HTMLResponse:
    template = "partials/docs/not_found.html" if fragment else "docs/not_found.html"
    return web.render(c, template, status_code=404, what=what, nav_current="docs")


def portal_elsewhere(web: Web, c: Ctx, portal: str) -> HTMLResponse:
    """A portal with no data in this store (spec 019 AS5.3, spec 015 F-21): name the stores that
    hold its runs, eval workspaces included, instead of a bare 404. Unknown anywhere: 404."""
    others = [s for s in c.stores if s.key != c.store.key]
    found = stores.stores_with_portal(others, portal)
    configured = (c.settings.portals_dir / portal / "portal.yaml").is_file()
    if not found and not configured:
        return docs_not_found(web, c, f"portal “{portal}”")
    links = [(s, build_url(f"/docs/{quote(portal, safe='')}", store=s.key)) for s in found]
    return web.render(
        c, "docs/portal_empty.html", nav_current="docs", portal=portal, elsewhere=links
    )


def portal_exists(conn: sqlite3.Connection, portal: str) -> bool:
    return queries_docs.portal_known(conn, portal) or portal in queries.portals(conn)


@router.get("/docs", response_class=HTMLResponse, response_model=None)
def docs_portals(request: Request, env: str | None = None) -> Response:
    web = web_of(request)
    c = web.ctx(request, env)
    if c.portal:  # spec 011: a portal chosen in the header opens its documentation
        return RedirectResponse(c.url(f"/docs/{quote(c.portal, safe='')}"), status_code=303)
    try:
        with c.conn() as conn:
            return web.render(
                c, "docs/portals.html", nav_current="docs", p=docs_portals_values(c, conn)
            )
    except db.StoreMissing as err:
        return web.missing(c, err)


@router.get("/fragments/docs/portals", response_class=HTMLResponse)
def fragment_docs_portals(request: Request, env: str | None = None) -> HTMLResponse:
    web = web_of(request)
    c = web.ctx(request, env)
    try:
        with c.conn() as conn:
            return web.render(c, "partials/docs/portals.html", p=docs_portals_values(c, conn))
    except db.StoreMissing as err:
        return web.missing(c, err, fragment=True)


@router.get("/docs/{portal}", response_class=HTMLResponse)
def docs_portal(
    request: Request, portal: str, env: str | None = None, section: str = "overview"
) -> HTMLResponse:
    web = web_of(request)
    c = web.ctx(request, env)
    section = section if section in queries_docs.DOC_SECTION_IDS else "overview"
    try:
        with c.conn() as conn:
            if not portal_exists(conn, portal):
                return portal_elsewhere(web, c, portal)
            return web.render(
                c,
                "docs/portal.html",
                nav_current="docs",
                portal=portal,
                index=docs_index_values(c, conn, portal, section),
                section=docs_section_values(c, conn, portal, section, request.query_params),
            )
    except db.StoreMissing as err:
        return web.missing(c, err)


@router.get("/fragments/docs/{portal}/index", response_class=HTMLResponse)
def fragment_docs_index(
    request: Request, portal: str, env: str | None = None, section: str = "overview"
) -> HTMLResponse:
    web = web_of(request)
    c = web.ctx(request, env)
    section = section if section in queries_docs.DOC_SECTION_IDS else "overview"
    try:
        with c.conn() as conn:
            if not portal_exists(conn, portal):
                return docs_not_found(web, c, f"portal “{portal}”", fragment=True)
            return web.render(
                c,
                "partials/docs/index.html",
                portal=portal,
                index=docs_index_values(c, conn, portal, section),
            )
    except db.StoreMissing as err:
        return web.missing(c, err, fragment=True)


@router.get("/fragments/docs/{portal}/section/{section}", response_class=HTMLResponse)
def fragment_docs_section(
    request: Request, portal: str, section: str, env: str | None = None, push: bool = False
) -> HTMLResponse:
    if section not in queries_docs.DOC_SECTION_IDS:
        raise HTTPException(404)
    web = web_of(request)
    c = web.ctx(request, env)
    try:
        with c.conn() as conn:
            if not portal_exists(conn, portal):
                return docs_not_found(web, c, f"portal “{portal}”", fragment=True)
            values = docs_section_values(c, conn, portal, section, request.query_params)
            return web.render(
                c,
                "partials/docs/section.html",
                portal=portal,
                section=values,
                push=values["page_url"] if push else None,
            )
    except db.StoreMissing as err:
        return web.missing(c, err, fragment=True)


@router.get("/docs/{portal}/sessions/{session_id}", response_class=HTMLResponse)
def docs_session(
    request: Request, portal: str, session_id: str, env: str | None = None
) -> HTMLResponse:
    web = web_of(request)
    c = web.ctx(request, env)
    try:
        with c.conn() as conn:
            values = session_values(c, conn, portal, session_id, request.query_params)
            if values is None:
                return docs_not_found(web, c, f"session “{session_id}”")
            return web.render(c, "docs/session.html", nav_current="docs", portal=portal, v=values)
    except db.StoreMissing as err:
        return web.missing(c, err)


@router.get("/fragments/docs/{portal}/sessions/{session_id}", response_class=HTMLResponse)
def fragment_docs_session(
    request: Request, portal: str, session_id: str, env: str | None = None
) -> HTMLResponse:
    web = web_of(request)
    c = web.ctx(request, env)
    try:
        with c.conn() as conn:
            values = session_values(c, conn, portal, session_id, request.query_params)
            if values is None:
                return docs_not_found(web, c, f"session “{session_id}”", fragment=True)
            return web.render(c, "partials/docs/session.html", portal=portal, v=values)
    except db.StoreMissing as err:
        return web.missing(c, err, fragment=True)


@router.get("/docs/{portal}/{key}", response_class=HTMLResponse)
def docs_record(
    request: Request, portal: str, key: str, env: str | None = None, rev: str | None = None
) -> HTMLResponse:
    web = web_of(request)
    c = web.ctx(request, env)
    try:
        with c.conn() as conn:
            values = record_values(c, conn, portal, key, rev)
            if values is None:
                return docs_not_found(web, c, f"record “{key}” in portal “{portal}”")
            nb = neighbours.neighbours(conn, portal, request.query_params.get("list"), key, c.url)
            return web.render(
                c, "docs/record.html", nav_current="docs", portal=portal, r=values, nb=nb
            )
    except db.StoreMissing as err:
        return web.missing(c, err)


@router.get("/fragments/docs/{portal}/{key}/{part}", response_class=HTMLResponse)
def fragment_docs_record(
    request: Request,
    portal: str,
    key: str,
    part: str,
    env: str | None = None,
    rev: str | None = None,
) -> HTMLResponse:
    if part not in ("header", "body", "reviews"):
        raise HTTPException(404)
    web = web_of(request)
    c = web.ctx(request, env)
    try:
        with c.conn() as conn:
            values = record_values(c, conn, portal, key, rev)
            if values is None:
                return docs_not_found(web, c, f"record “{key}” in portal “{portal}”", fragment=True)
            return web.render(
                c, f"partials/docs/{part}.html", portal=portal, r=values, panel=values["panel"]
            )
    except db.StoreMissing as err:
        return web.missing(c, err, fragment=True)


@router.post("/docs/{portal}/{key}/reviews", response_class=HTMLResponse)
async def docs_review(request: Request, portal: str, key: str, env: str | None = None) -> Response:
    """Confirm / reject / comment on a revision (FR-037..039). The only write path of the
    dashboard, and it is a subprocess (`pnpm docs:review`): this process never writes."""
    if not same_origin(request):
        return PlainTextResponse("Cross-origin request refused.", status_code=403)
    web = web_of(request)
    c = web.ctx(request, env)
    raw = parse_qs((await request.body()).decode("utf-8", "replace"), keep_blank_values=True)
    form = {k: v[0] for k, v in raw.items()}
    action = form.get("action", "")
    text = (form.get("text") or "").strip()
    rev_no = int(form["rev_no"]) if form.get("rev_no", "").isdigit() else None
    try:
        with c.conn() as conn:
            if queries_docs.get_record(conn, portal, key) is None:
                return docs_not_found(web, c, f"record “{key}” in portal “{portal}”", fragment=True)
        status, result = 200, None
        if not web.settings.reviewer:
            status, result = (
                403,
                refusal(
                    "REVIEW_DISABLED",
                    "Review actions are disabled: PATHFINDER_REVIEWER is not set.",
                ),
            )
        elif action not in ("confirm", "reject", "comment") or rev_no is None:
            status, result = 422, refusal("SCHEMA_INVALID", "Unknown action or revision.")
        elif action != "confirm" and not text:
            what = "reject" if action == "reject" else "comment"
            status, result = 422, refusal("SCHEMA_INVALID", f"A {what} needs a text: say why.")
        else:
            outcome = await run_in_threadpool(
                review.submit_review,
                web.settings,
                c.env,
                portal_id=portal,
                key=key,
                rev_no=rev_no,
                action=action,
                text=text or None,
            )
            status = outcome.http_status
            if outcome.ok:
                result = {
                    "ok": True,
                    "code": None,
                    "message": f"Recorded {action} on {key} revision {rev_no}.",
                    "action": action,
                }
            else:
                result = refusal(outcome.code or "UNEXPECTED", outcome.message or "failed")
        with c.conn() as conn:
            values = record_values(c, conn, portal, key, None, result=result)
            if values is None:
                return docs_not_found(web, c, f"record “{key}” in portal “{portal}”", fragment=True)
            response = web.render(
                c,
                "partials/docs/review_response.html",
                status_code=status,
                portal=portal,
                r=values,
                panel=values["panel"],
                oob=True,
            )
            return response
    except db.StoreMissing as err:
        return web.missing(c, err, fragment=True)
