"""The Review inbox (spec 022 screen 09, T029): every decision that waits for a person, in one
place, with the selected item in a side pane. New page: Salvage Yard only.

Deciding goes the usual ways: records through `pnpm docs:review` (the dashboard never writes),
amendments and proposals through the chat service (forms.js posts to the `/chat/...` routes)."""

from __future__ import annotations

import sqlite3
from typing import Any
from urllib.parse import parse_qs, quote

from fastapi import APIRouter, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import HTMLResponse, PlainTextResponse, RedirectResponse, Response

from .. import (
    chat_client,
    db,
    queries_chat,
    queries_docs,
    queries_reconcile,
    queries_review,
    queries_suites,
    review,
    suite_form,
)
from . import views_access
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
        "assumptions": lambda: next((r for r in inbox.assumptions if r.key == ident), None),
        "differences": lambda: next((d for d in inbox.differences if d.id == ident), None),
        "differing": lambda: next((d for d in inbox.differing if d.id == ident), None),
        "reanchor": lambda: next((a for a in inbox.reanchor if a.key == ident), None),
        "proposals": lambda: next((p for p in inbox.proposals if p.p.id == ident), None),
        "suites": lambda: next((s for s in inbox.suites if s.id == ident), None),
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
    if portal and selected and selected[0] in ("records", "assumptions"):
        cited = queries_review.cited_screens(conn, portal, selected[1].key, selected[1].rev)
    attrs: dict[str, str] = {}
    if portal and selected and selected[0] == "differences":
        attrs = views_access.attributes_by_persona(c.settings.personas_dir, portal)
    return {
        "attrs": attrs,
        "inbox": inbox,
        "kinds": queries_review.KINDS,
        "verdicts": queries_reconcile.VERDICTS,
        "hypotheses": queries_reconcile.HYPOTHESES,
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
            record = queries_docs.get_record(conn, portal, key)
    except db.StoreMissing as err:
        return web.missing(c, err)
    known = record is not None
    group = "assumptions" if record and record.kind == "assumption" else "records"
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
    target = c.url("/review", portal=portal, select=f"{group}:{key}", note=note)
    return RedirectResponse(target, status_code=303)


SUITE_DONE = {
    "save": "Changes saved; the suite waits for approval.",
    "approve": "Suite approved: written into traces.yaml.",
    "dismiss": "Suite dismissed.",
}


def suite_calls(
    action: str, trace: dict[str, Any] | None, form: dict[str, list[str]], author: str
) -> list[tuple[str, dict[str, Any]]] | None:
    """The chat service calls for a probe suite form (spec 032 US3): Save keeps the edited suite
    open; Approve saves the edit first, then approves it; Dismiss. None for an unknown action."""
    if action == "dismiss":
        return [("dismiss", {"author": author})]
    if action not in ("save", "approve") or trace is None:
        return None
    calls = [("edit", {"author": author, "trace": suite_form.edited_trace(trace, form)})]
    return calls + ([("approve", {"author": author})] if action == "approve" else [])


async def _suite_call(web: Any, path: str, body: dict[str, Any]) -> str | None:
    """One chat service call; the refusal's message, or None when it went through."""
    try:
        status, answer = await chat_client.call(
            web.settings, "POST", path, body, web.chat_transport
        )
    except chat_client.ChatUnavailable:
        return chat_client.NOT_RUNNING
    if status == 200:
        return None
    message = answer.get("message") if isinstance(answer, dict) else None
    return str(message or status)


@router.post("/review/suites/{portal}/{suite_id}", response_model=None)
async def review_suite(
    request: Request, portal: str, suite_id: str, env: str | None = None
) -> Response:
    """Save, approve or dismiss a probe suite through the chat service (the dashboard never
    writes), then back to the suite with the outcome as a note (post, redirect, get)."""
    if not same_origin(request):
        return PlainTextResponse("Cross-origin request refused.", status_code=403)
    web = web_of(request)
    c = web.ctx(request, env)
    form = parse_qs((await request.body()).decode("utf-8", "replace"), keep_blank_values=True)
    action = (form.get("action") or [""])[0]
    author = web.settings.reviewer
    try:
        with c.conn() as conn:
            suite = queries_suites.suite_by_id(conn, portal, suite_id)
    except db.StoreMissing as err:
        return web.missing(c, err)
    calls = suite_calls(action, suite.trace if suite else None, form, author) if author else None
    if not author:
        note = "Set PATHFINDER_REVIEWER to your name to decide on suites."
    elif calls is None:
        note = "Unknown action or suite."
    else:
        base = f"/portals/{quote(portal, safe='')}/probe-suites/{quote(suite_id, safe='')}/"
        refused = None
        for verb, body in calls:
            refused = await _suite_call(web, base + verb, body)
            if refused:
                break
        note = f"Not recorded: {refused}." if refused else SUITE_DONE[action]
    select = f"suites:{suite_id}" if action == "save" else None
    target = c.url("/review", portal=portal, show="suites", select=select, note=note)
    return RedirectResponse(target, status_code=303)


@router.post("/review/differing/{portal}/{reconciliation_id}", response_model=None)
async def review_differing(
    request: Request, portal: str, reconciliation_id: str, env: str | None = None
) -> Response:
    """Confirm the verdicts on differing states (spec 033 US4), kept or changed per outcome
    (`verdict:<state id>` fields), through the chat service; back to Review with a note."""
    if not same_origin(request):
        return PlainTextResponse("Cross-origin request refused.", status_code=403)
    web = web_of(request)
    c = web.ctx(request, env)
    form = parse_qs((await request.body()).decode("utf-8", "replace"))
    author = web.settings.reviewer
    try:
        with c.conn() as conn:
            item = next(
                (
                    d
                    for d in queries_reconcile.open_reconciliations(conn, portal)
                    if d.id == reconciliation_id
                ),
                None,
            )
    except db.StoreMissing as err:
        return web.missing(c, err)
    if not author:
        note = "Set PATHFINDER_REVIEWER to your name to confirm verdicts."
    elif item is None:
        note = "This proposal is no longer open."
    elif not item.proposed_by:
        note = "The BA has not proposed verdicts for this group yet."
    else:
        verdicts = [
            {
                "state_id": o.state_id,
                "verdict": (form.get(f"verdict:{o.state_id}") or [o.verdict])[0],
            }
            for o in item.outcomes
        ]
        path = (
            f"/portals/{quote(portal, safe='')}/reconciliations/"
            f"{quote(reconciliation_id, safe='')}/confirm"
        )
        refused = await _suite_call(web, path, {"author": author, "verdicts": verdicts})
        note = f"Not recorded: {refused}." if refused else "Verdicts confirmed."
    target = c.url("/review", portal=portal, show="differing", note=note)
    return RedirectResponse(target, status_code=303)
