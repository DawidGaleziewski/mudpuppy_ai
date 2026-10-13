"""The Review inbox (spec 022 screen 09, T029): every decision that waits for a person, in one
place, with the selected item in a side pane. New page: Salvage Yard only.

Deciding goes the usual ways: records through `pnpm docs:review` (the dashboard never writes),
amendments and proposals through the chat service (forms.js posts to the `/chat/...` routes)."""

from __future__ import annotations

import sqlite3
from typing import Any
from urllib.parse import parse_qs

from fastapi import APIRouter, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import HTMLResponse, PlainTextResponse, RedirectResponse, Response

from .. import db, queries_chat, queries_docs, queries_review, review
from .deps import Ctx, same_origin, web_of

router = APIRouter()


KIND_KEYS = tuple(k for k, _ in queries_review.KINDS)


def _selected(
    inbox: queries_review.Inbox, select: str | None, show: str | None
) -> tuple[str, Any] | None:
    """`kind:id` → the item; default: the first item of the first shown group that has one."""
    kind, _, ident = (select or "").partition(":")
    finders = {
        "records": lambda: next((r for r in inbox.records if r.key == ident), None),
        "reanchor": lambda: next((a for a in inbox.reanchor if a.key == ident), None),
        "proposals": lambda: next((p for p in inbox.proposals if p.p.id == ident), None),
    }
    if kind in finders and (item := finders[kind]()) is not None:
        return kind, item
    for k in KIND_KEYS:
        items = getattr(inbox, k)
        if items and show in (None, k):
            return k, items[0]
    return None


def review_values(
    c: Ctx, conn: sqlite3.Connection, select: str | None, show: str | None, note: str | None
) -> dict[str, Any]:
    portal = c.portal
    show = show if show in KIND_KEYS else None
    inbox = queries_review.inbox(conn, portal)
    selected = _selected(inbox, select, show)
    cited: list[queries_review.CitedScreen] = []
    if portal and selected and selected[0] == "records":
        cited = queries_review.cited_screens(conn, portal, selected[1].key, selected[1].rev)
    return {
        "inbox": inbox,
        "kinds": queries_review.KINDS,
        "show": show,
        "selected": selected,
        "cited": cited,
        "states": queries_chat.portal_states(conn, portal) if portal else [],
        "note": note,
        "self_url": c.url("/fragments/review", select=select, show=show),
    }


@router.get("/review", response_class=HTMLResponse)
def review_page(
    request: Request,
    env: str | None = None,
    select: str | None = None,
    show: str | None = None,
    note: str | None = None,
) -> HTMLResponse:
    web = web_of(request)
    c = web.ctx(request, env)
    try:
        with c.conn() as conn:
            v = review_values(c, conn, select, show, note)
    except db.StoreMissing as err:
        return web.missing(c, err)
    return web.render(c, "salvage/review.html", nav_current="review", v=v)


@router.get("/fragments/review", response_class=HTMLResponse)
def fragment_review(
    request: Request, env: str | None = None, select: str | None = None, show: str | None = None
) -> HTMLResponse:
    web = web_of(request)
    c = web.ctx(request, env)
    try:
        with c.conn() as conn:
            v = review_values(c, conn, select, show, None)
    except db.StoreMissing as err:
        return web.missing(c, err, fragment=True)
    return web.render(c, "salvage/partials/review_inbox.html", v=v)


@router.post("/review/records/{portal}/{key}", response_model=None)
async def review_record(
    request: Request, portal: str, key: str, env: str | None = None
) -> Response:
    """Confirm / reject / comment from the inbox: the same `docs:review` write as the Docs tab,
    then back to the inbox with the outcome as a note (post, redirect, get)."""
    if not same_origin(request):
        return PlainTextResponse("Cross-origin request refused.", status_code=403)
    web = web_of(request)
    c = web.ctx(request, env)
    raw = parse_qs((await request.body()).decode("utf-8", "replace"), keep_blank_values=True)
    form = {k: v[0] for k, v in raw.items()}
    action = form.get("action", "")
    text = (form.get(action) or "").strip() if action in ("reject", "comment") else ""
    rev_no = int(form["rev_no"]) if form.get("rev_no", "").isdigit() else None
    try:
        with c.conn() as conn:
            known = queries_docs.get_record(conn, portal, key) is not None
    except db.StoreMissing as err:
        return web.missing(c, err)
    if not known:
        note = f"No record {key} in {portal}."
    elif action not in ("confirm", "reject", "comment") or rev_no is None:
        note = "Unknown action or revision."
    elif action != "confirm" and not text:
        note = f"A {action} needs a text: say why."
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
        note = (
            f"Recorded {action} on {key} revision {rev_no}."
            if outcome.ok
            else f"Not recorded: {outcome.message or outcome.code or 'failed'}."
        )
    target = c.url("/review", portal=portal, select=f"records:{key}", note=note)
    return RedirectResponse(target, status_code=303)
