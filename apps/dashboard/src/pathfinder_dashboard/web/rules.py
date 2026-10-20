"""Business rules (spec 039 T100, UX-R60–R63; designer screens v2-11 and v2-12): the portal's
decision rules, exceptions first, and one rule as a decision table with its boundary tests and
history. Read-only: a person confirms or rejects a rule in What changed (`pnpm model:decide`)."""

from __future__ import annotations

from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse

from .. import db
from ..queries_rules import rule_detail, rules_view
from .deps import web_of

router = APIRouter()


@router.get("/rules", response_class=HTMLResponse)
def rules_page(request: Request, env: str | None = None, status: str | None = None) -> HTMLResponse:
    web = web_of(request)
    c = web.ctx(request, env)
    try:
        with c.conn() as conn:
            v = rules_view(conn, c.portal, status)
    except db.StoreMissing as err:
        return web.missing(c, err)
    return web.render(c, "salvage/rules.html", nav_current="rules", v=v)


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
