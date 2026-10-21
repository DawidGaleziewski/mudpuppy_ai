"""Plan next scan (screen 14) and a stopped scan's recovery (screen 15), spec 034 R-66.

Read-only like every page: "Start scan" sends one precise request to the portal's conversation
through the chat service (the assistant calls `request_scan` with the run type and plan, and the
crawler replays to each start point); "Skip it" sets a Skip mark through the chat service.
"""

from __future__ import annotations

import json
from typing import Any
from urllib.parse import parse_qs, quote

from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse, PlainTextResponse, RedirectResponse, Response

from .. import chat_client, db, queries_plan
from .deps import Ctx, same_origin, web_of

router = APIRouter()

SCAN_TYPES = (
    ("focused", "Focused", "Replays to the Start here and Focus marks and explores from there."),
    ("recheck", "Recheck", "Replays to the Recheck marks and records what each shows now."),
    ("retry", "Retry a path", "Replays to a failed action and tries it again, with a variation."),
    ("continue", "Continue a stopped scan", "Picks up where a stopped scan left off."),
)
TYPE_LABELS = {t: label for t, label, _ in SCAN_TYPES}
VARIATIONS = queries_plan.VARIATIONS


def scan_request_text(
    portal: str, persona: str, environment: str | None, run_type: str, plan: dict[str, Any]
) -> str:
    """The chat message a "Start scan" sends: precise enough that the assistant makes exactly
    this `request_scan` call."""
    where = f" in environment “{environment}”" if environment else ""
    args = {"portal": portal, "persona": persona, "run_type": run_type, "plan": plan}
    if environment:
        args["environment"] = environment
    return (
        f"Start a {TYPE_LABELS[run_type].lower()} scan of {portal} as {persona}{where}, as planned "
        f"on the Plan next scan page: call request_scan with {json.dumps(args)} and start the "
        "crawler with the hand-off."
    )


def _plan_from_form(run_type: str, form: dict[str, str]) -> dict[str, Any] | None:
    """The `plan` for the type, or None when the form misses what the type needs."""
    plan: dict[str, Any] = {}
    if run_type == "focused":
        depth = form.get("depth", "2")
        plan["depth"] = int(depth) if depth.isdigit() and int(depth) <= 10 else 2
    if run_type in ("continue", "retry") and form.get("parent_run_id"):
        plan["parent_run_id"] = form["parent_run_id"]
    if run_type == "retry":
        if form.get("target_transition_id"):
            plan["target_transition_id"] = form["target_transition_id"]
        variation = form.get("variation", "none")
        plan["variation"] = variation if variation in dict(VARIATIONS) else "none"
    if run_type == "continue" and "parent_run_id" not in plan:
        return None
    return plan


@router.get("/scans/plan", response_class=HTMLResponse)
def plan_page(request: Request, env: str | None = None, note: str | None = None) -> HTMLResponse:
    web = web_of(request)
    c = web.ctx(request, env)
    p = None
    try:
        with c.conn() as conn:
            if c.portal:
                p = queries_plan.plan(conn, c.portal)
    except db.StoreMissing as err:
        return web.missing(c, err)
    return web.render(
        c,
        "salvage/scan_plan.html",
        nav_current="scans",
        plan=p,
        types=SCAN_TYPES,
        variations=VARIATIONS,
        labels=queries_plan.MARK_LABELS,
        note=note,
    )


@router.get("/scans/recover/{run_id}", response_class=HTMLResponse)
def recover_page(
    request: Request, run_id: str, env: str | None = None, note: str | None = None
) -> HTMLResponse:
    web = web_of(request)
    c = web.ctx(request, env)
    try:
        with c.conn() as conn:
            r = queries_plan.recovery(conn, run_id)
    except db.StoreMissing as err:
        return web.missing(c, err)
    if r is None:
        return web.not_found(c, run_id)
    return web.render(
        c,
        "salvage/scan_recover.html",
        nav_current="scans",
        r=r,
        variations=VARIATIONS,
        labels=TYPE_LABELS,
        note=note,
    )


async def _send_to_chat(
    web: Any, env: str, portal: str, text: str
) -> tuple[str | None, str | None]:
    """Post the request to the portal's conversation: (conversation id, refusal message)."""
    try:
        status, body = await chat_client.call(
            web.settings, "POST", "/conversations", {"portal": portal}, web.chat_transport
        )
        conv = body.get("id") if isinstance(body, dict) else None
        if status >= 300 or not isinstance(conv, str):
            return None, "the chat service did not open a conversation"
        status, body = await chat_client.call(
            web.settings,
            "POST",
            f"/conversations/{quote(conv, safe='')}/messages",
            {"text": text},
            web.chat_transport,
        )
    except chat_client.ChatUnavailable:
        return None, chat_client.not_running(env)
    if status >= 300:
        message = body.get("message") if isinstance(body, dict) else None
        return conv, str(message or status)
    return conv, None


def _back(c: Ctx, form: dict[str, str], note: str) -> RedirectResponse:
    run = form.get("parent_run_id")
    if form.get("from") == "graph" and run:  # the scan's graph, on the screen it was sent from
        url = c.url(f"/runs/{run}", tab="graph", node=form.get("node") or None, note=note)
        return RedirectResponse(url, status_code=303)
    path = f"/scans/recover/{run}" if form.get("from") == "recover" and run else "/scans/plan"
    return RedirectResponse(c.url(path, note=note), status_code=303)


@router.post("/scans/plan/start", response_model=None)
async def plan_start(request: Request, env: str | None = None) -> Response:
    if not same_origin(request):
        return PlainTextResponse("Cross-origin request refused.", status_code=403)
    web = web_of(request)
    c = web.ctx(request, env)
    raw = parse_qs((await request.body()).decode("utf-8", "replace"))
    form = {k: v[0] for k, v in raw.items()}
    run_type = form.get("run_type", "")
    persona = form.get("persona", "").strip()
    portal = c.portal
    if not portal or run_type not in TYPE_LABELS or not persona:
        return _back(c, form, "Pick a portal, a scan type and a persona first.")
    plan = _plan_from_form(run_type, form)
    if plan is None:
        return _back(c, form, "Continuing needs the stopped scan; start it from its recovery page.")
    text = scan_request_text(portal, persona, form.get("environment") or None, run_type, plan)
    conv, refused = await _send_to_chat(web, c.env, portal, text)
    if refused:
        return _back(c, form, f"Not started: {refused}.")
    return RedirectResponse(c.url("/chat", conversation=conv), status_code=303)


@router.post("/scans/recover/{run_id}/skip", response_model=None)
async def recover_skip(request: Request, run_id: str, env: str | None = None) -> Response:
    """Skip it (screen 15): a Skip mark on the failed action, so the next scans leave it out."""
    if not same_origin(request):
        return PlainTextResponse("Cross-origin request refused.", status_code=403)
    web = web_of(request)
    c = web.ctx(request, env)
    raw = parse_qs((await request.body()).decode("utf-8", "replace"))
    transition_id = (raw.get("transition_id") or [""])[0]
    try:
        with c.conn() as conn:
            r = queries_plan.recovery(conn, run_id)
    except db.StoreMissing as err:
        return web.missing(c, err)
    if (
        r is None
        or not web.settings.reviewer
        or transition_id not in {f.transition_id for f in r.failed}
    ):
        note = "Not recorded: set PATHFINDER_REVIEWER, and skip a failed action of this scan."
    else:
        body = {
            "author": web.settings.reviewer,
            "kind": "skip",
            "target_kind": "transition",
            "target_id": transition_id,
        }
        try:
            status, answer = await chat_client.call(
                web.settings,
                "POST",
                f"/portals/{quote(r.portal, safe='')}/marks",
                body,
                web.chat_transport,
            )
            ok = status in (200, 201)
            note = (
                "Skipped: the next scans leave this action out."
                if ok
                else f"Not recorded: {answer}."
            )
        except chat_client.ChatUnavailable:
            note = f"Not recorded: {chat_client.not_running(c.env)}"
    form = {k: v[0] for k, v in raw.items()}
    if form.get("from") == "graph":
        return _back(c, {**form, "parent_run_id": run_id}, note)
    return RedirectResponse(c.url(f"/scans/recover/{run_id}", note=note), status_code=303)
