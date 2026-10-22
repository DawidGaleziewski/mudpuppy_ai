"""The Review inbox (spec 022 screen 09, T029): every decision that waits for a person, in one
place, with the selected item in a side pane. New page: Salvage Yard only.

Deciding goes the usual ways: records through `pnpm docs:review` (the dashboard never writes),
amendments and proposals through the chat service (forms.js posts to the `/chat/...` routes)."""

from __future__ import annotations

import re
import sqlite3
from datetime import UTC, datetime
from typing import Any
from urllib.parse import parse_qs, quote

from fastapi import APIRouter, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import HTMLResponse, PlainTextResponse, RedirectResponse, Response

from .. import (
    chat_client,
    db,
    neighbours,
    pager,
    queries_chat,
    queries_docs,
    queries_queue,
    queries_review,
    queries_same_screen,
    queries_suites,
    review,
    suite_form,
)
from . import views_access
from .deps import Ctx, same_origin, web_of
from .views_review import also_settle, model_call

router = APIRouter()


KIND_KEYS = tuple(k for k, _ in queries_review.KINDS)
CHANGE_PAGE = re.compile(r"^/changes/[A-Za-z0-9_-]{1,64}$")  # where a decision bar may return


def _selected(
    inbox: queries_review.Inbox, select: str | None, show: str | None
) -> tuple[str, Any] | None:
    """`kind:id` → the item; default: the first item of the first shown group that has one."""
    kind, _, ident = (select or "").partition(":")
    finders = {
        "records": lambda: next((r for r in inbox.records if r.key == ident), None),
        "assumptions": lambda: next((r for r in inbox.assumptions if r.key == ident), None),
        "differences": lambda: next((d for d in inbox.differences if d.id == ident), None),
        "reanchor": lambda: next((a for a in inbox.reanchor if a.key == ident), None),
        "proposals": lambda: next((p for p in inbox.proposals if p.p.id == ident), None),
        "suites": lambda: next((s for s in inbox.suites if s.id == ident), None),
        **{
            k: (lambda k=k: queries_queue.by_id(getattr(inbox, k), ident))
            for k in ("findings", "rules", "removals", "processes")
        },
    }
    if kind in finders and (item := finders[kind]()) is not None:
        return kind, item
    for k in KIND_KEYS:
        items = getattr(inbox, k)
        if items and show in (None, k):
            return k, items[0]
    return None


def _ident(kind: str, item: Any) -> str:
    """The `select=kind:<this>` part of an inbox item (the same ids `_selected` looks up)."""
    if kind in ("records", "assumptions", "reanchor"):
        return str(item.key)
    if kind == "proposals":
        return str(item.p.id)
    return str(item.id)


def _review_neighbours(
    c: Ctx, inbox: queries_review.Inbox, selected: tuple[str, Any] | None, show: str | None
) -> neighbours.Neighbours | None:
    """Prev / Next through the selected item's group (R-71 (b)), in inbox order."""
    if selected is None:
        return None
    kind, item = selected
    ids = [_ident(kind, it) for it in getattr(inbox, kind)]
    i = ids.index(_ident(kind, item))
    label = dict(queries_review.KINDS)[kind]

    def link(j: int) -> str | None:
        return c.url("/review", show=show, select=f"{kind}:{ids[j]}") if 0 <= j < len(ids) else None

    return neighbours.Neighbours(
        i + 1, len(ids), c.url("/review", show=kind), label, link(i - 1), link(i + 1)
    )


def review_values(
    c: Ctx,
    conn: sqlite3.Connection,
    select: str | None,
    show: str | None,
    note: str | None,
    page: str | None = None,
    part: str | None = None,
    age: str | None = None,
) -> dict[str, Any]:
    portal = c.portal
    show = show if show in KIND_KEYS else None
    inbox = queries_review.inbox(conn, portal)
    # Designer § 5.1: part and age filters with counts over the model groups.
    now = datetime.now(UTC)
    model = ("findings", "rules", "removals")
    facets = queries_queue.facets([getattr(inbox, k) for k in model], part, age, now)
    if facets.active:
        inbox = inbox._replace(
            **{k: queries_queue.keep(getattr(inbox, k), facets, now) for k in model}
        )
    selected = _selected(inbox, select, show)
    # A group's own tab lists every item, 25 a page (R-71); "All" keeps the first 10 of each.
    group = pager.paginate(getattr(inbox, show), pager.page_number(page)) if show else None
    shown_page = group.page if group and group.page > 1 else None
    cited: list[queries_review.CitedScreen] = []
    if portal and selected and selected[0] in ("records", "assumptions"):
        cited = queries_review.cited_screens(conn, portal, selected[1].key, selected[1].rev)
    attrs: dict[str, str] = {}
    if portal and selected and selected[0] == "differences":
        attrs = views_access.attributes_by_persona(c.settings.personas_dir, portal)
    also = []  # Also settles (designer § 5.5, spec 040 T023)
    if portal and selected and selected[0] == "findings" and selected[1].keys:
        also = queries_same_screen.linked(conn, portal, selected[1].id)
    return {
        "also": also,
        "attrs": attrs,
        "inbox": inbox,
        "kinds": queries_review.KINDS,
        "show": show,
        "selected": selected,
        "cited": cited,
        "states": queries_chat.portal_states(conn, portal) if portal else [],
        "note": note,
        "group": group,
        "pages": pager.links(group, lambda n: c.url("/review", show=show, page=n))
        if group
        else None,
        "nb": _review_neighbours(c, inbox, selected, show),
        "reasons": queries_queue.recent_reasons(conn, portal) if portal else {},
        "facets": facets,
        "self_url": c.url(
            "/fragments/review",
            select=select,
            show=show,
            page=shown_page,
            part=facets.part,
            age=facets.age,
        ),
    }


TABS = ("needs", "explained", "decided")


@router.get("/review", response_class=HTMLResponse)
def review_page(
    request: Request,
    env: str | None = None,
    select: str | None = None,
    show: str | None = None,
    note: str | None = None,
    page: str | None = None,
    tab: str = "needs",
    undo: str | None = None,
    part: str | None = None,
    age: str | None = None,
) -> HTMLResponse:
    """Three tabs (v2-04 / v2-05 / v2-16): Needs you is the inbox; Explained automatically and
    Decided list the portal model's changes a rule explained and a person's decisions."""
    web = web_of(request)
    c = web.ctx(request, env)
    tab = tab if tab in TABS else "needs"
    try:
        with c.conn() as conn:
            v = review_values(c, conn, select, show, note, page, part, age)
            other: dict[str, Any] = {"explained": [], "decided": [], "pairs": []}
            if c.portal:
                other["explained"] = queries_queue.explained(conn, c.portal)
                other["decided"] = queries_queue.decided(conn, c.portal)
                other["pairs"] = queries_same_screen.queue(conn, c.portal)
    except db.StoreMissing as err:
        return web.missing(c, err)
    return web.render(
        c, "salvage/review.html", nav_current="review", v=v, tab=tab, undo=undo, **other
    )


@router.post("/review/hypotheses/{portal}", response_model=None)
async def review_hypotheses(request: Request, portal: str, env: str | None = None) -> Response:
    """Confirm or reject findings, rules or a group of removals (v2-04) through the chat service
    (the dashboard never writes), then back to the queue with the outcome as a note."""
    if not same_origin(request):
        return PlainTextResponse("Cross-origin request refused.", status_code=403)
    web = web_of(request)
    c = web.ctx(request, env)
    form = parse_qs((await request.body()).decode("utf-8", "replace"), keep_blank_values=True)
    # A selected row sends its keys comma-joined (a removal row may settle several).
    keys = [k for v in form.get("keys", []) for k in v.split(",") if k]
    action = (form.get("action") or [""])[0]
    reason = (form.get("reason") or [""])[0].strip()
    select = (form.get("select") or [""])[0] or None
    author = web.settings.reviewer
    undo: str | None = None  # the command's id, for the toast's Undo
    if not author:
        note = "Set PATHFINDER_REVIEWER to your name to decide."
    elif action not in ("confirm", "reject") or not keys:
        note = "Unknown action, or nothing to decide."
    elif action == "reject" and not reason:
        note = "A reject needs a reason: say why."
    else:
        body = {
            "keys": keys,
            "decision": action,
            "by": author,
            "reason": reason or "Confirmed in Review.",
        }
        refused, answer = await model_call(web, c.env, portal, "decide", body)
        done = "Confirmed" if action == "confirm" else "Rejected"
        note = f"Not recorded: {refused}." if refused else f"{done}: {', '.join(keys)}."
        if not refused and answer.get("decision"):
            undo = str(answer["decision"])
        if not refused and action == "confirm":
            note += await also_settle(web, c.env, portal, form.get("also", []), keys, reason)
    keep = select if note.startswith(("Not", "A reject", "Unknown")) else None
    # Before / after's decision bar (spec 040 T018) comes back to the change it decided.
    back = (form.get("back") or [""])[0]
    if CHANGE_PAGE.match(back):
        return RedirectResponse(c.url(back, portal=portal, note=note, undo=undo), 303)
    target = c.url("/review", portal=portal, select=keep, note=note, undo=undo)
    return RedirectResponse(target, 303)


@router.post("/review/undo/{portal}", response_model=None)
async def review_undo(request: Request, portal: str, env: str | None = None) -> Response:
    """Undo one decision command from the toast (designer § 5.4, § 5.8): every item it decided
    goes back to the queue. The chat service refuses when anything changed since."""
    if not same_origin(request):
        return PlainTextResponse("Cross-origin request refused.", status_code=403)
    web = web_of(request)
    c = web.ctx(request, env)
    form = parse_qs((await request.body()).decode("utf-8", "replace"), keep_blank_values=True)
    decision = (form.get("decision") or [""])[0]
    author = web.settings.reviewer
    if not author or not decision:
        note = "Nothing to undo."
    else:
        body = {"decision": decision, "by": author}
        refused, answer = await model_call(web, c.env, portal, "undo", body)
        keys = [str(u.get("key")) for u in answer.get("undone", []) if isinstance(u, dict)]
        note = f"Not undone: {refused}." if refused else f"Undone: {', '.join(keys)}."
    return RedirectResponse(c.url("/review", portal=portal, note=note), 303)


@router.get("/fragments/review", response_class=HTMLResponse)
def fragment_review(
    request: Request,
    env: str | None = None,
    select: str | None = None,
    show: str | None = None,
    page: str | None = None,
    part: str | None = None,
    age: str | None = None,
) -> HTMLResponse:
    web = web_of(request)
    c = web.ctx(request, env)
    try:
        with c.conn() as conn:
            v = review_values(c, conn, select, show, None, page, part, age)
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


async def _suite_call(
    web: Any, env: str, path: str, body: dict[str, Any], ok: int = 200
) -> str | None:
    """One chat service call; the refusal's message, or None when it went through."""
    try:
        status, answer = await chat_client.call(
            web.settings, "POST", path, body, web.chat_transport
        )
    except chat_client.ChatUnavailable:
        return chat_client.not_running(env)
    if status == ok:
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
            refused = await _suite_call(web, c.env, base + verb, body)
            if refused:
                break
        note = f"Not recorded: {refused}." if refused else SUITE_DONE[action]
    select = f"suites:{suite_id}" if action == "save" else None
    target = c.url("/review", portal=portal, show="suites", select=select, note=note)
    return RedirectResponse(target, status_code=303)
