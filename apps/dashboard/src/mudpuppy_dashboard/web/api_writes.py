"""The React console's writes (R-96, spec 054): the marks a person sets on a screen (Start here,
Focus, Recheck, Retry, Skip; Probe on a form step), Skip on a scan's failed action, and a restart
of a scan (Resume, Retry this path). Each asks the chat service through `chat_writes`; the
dashboard never writes the store. The page asks the person
first; this checks the origin, the reviewer's name and the target, and answers `{ok, message}`.
No SQL here (G-15)."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from .. import db, queries_plan, queries_screens, queries_suites
from .chat_forward import read_json
from .chat_writes import (
    PROBE_MARK_DONE,
    SCREEN_MARK_KINDS,
    WriteResult,
    assistant_href,
    mark_call,
    plan_from_form,
    scan_request_text,
    send_to_chat,
    write_refused,
)
from .chat_writes import write_answer as _answer
from .deps import Ctx, same_origin, web_of

router = APIRouter(prefix="/api")


def _refused(request: Request) -> JSONResponse | None:
    return write_refused(request, "mark screens")


async def _mark(c: Ctx, portal: str, action: str, body: dict[str, Any], done: str):
    method = "POST" if action == "mark" else "DELETE"
    refused = await mark_call(web_of(c.request), c.env, method, portal, body)
    return _answer(502, f"Not recorded: {refused}.") if refused else _answer(200, done)


@router.post("/states/{state_id}/marks", response_model=WriteResult)
async def screen_mark(request: Request, state_id: str, env: str | None = None) -> JSONResponse:
    """Set (`action` mark) or remove a next-scan mark (`kind`) on a screen state."""
    if (no := _refused(request)) is not None:
        return no
    web = web_of(request)
    c = web.ctx(request, env)
    form = await read_json(request)
    kind, action = str(form.get("kind", "")), str(form.get("action", ""))
    try:
        with c.conn() as conn:
            portal = queries_screens.portal_of_state(conn, state_id)
    except db.StoreMissing:
        portal = None
    if portal is None or kind not in SCREEN_MARK_KINDS or action not in ("mark", "remove"):
        return _answer(422, "Unknown mark, action or screen.")
    label = SCREEN_MARK_KINDS[kind]
    done = f"Marked {label}." if action == "mark" else f"{label} mark removed."
    body = {
        "author": web.settings.reviewer,
        "kind": kind,
        "target_kind": "state",
        "target_id": state_id,
    }
    return await _mark(c, portal, action, body, done)


@router.post("/states/{state_id}/probe-mark", response_model=WriteResult)
async def probe_mark(request: Request, state_id: str, env: str | None = None) -> JSONResponse:
    """Mark the state's form step for probing (`action` mark), or remove the mark."""
    if (no := _refused(request)) is not None:
        return no
    web = web_of(request)
    c = web.ctx(request, env)
    action = str((await read_json(request)).get("action", ""))
    try:
        with c.conn() as conn:
            fs = queries_suites.form_step_of_state(conn, state_id)
    except db.StoreMissing:
        fs = None
    if fs is None or action not in PROBE_MARK_DONE:
        return _answer(422, "Unknown action, or this screen is no form step.")
    author = web.settings.reviewer
    body = {"author": author, "kind": "probe", "target_kind": "form_step", "target_id": fs.id}
    return await _mark(c, fs.portal, action, body, PROBE_MARK_DONE[action])


def _recovery(c: Ctx, scan: str) -> queries_plan.Recovery | None:
    try:
        with c.conn() as conn:
            return queries_plan.recovery(conn, scan)
    except db.StoreMissing:
        return None


@router.post("/scans/{scan}/skip", response_model=WriteResult)
async def skip_action(request: Request, scan: str, env: str | None = None) -> JSONResponse:
    """A Skip mark on one of the scan's failed actions (`transition_id`): the next scans leave
    it out."""
    if (no := _refused(request)) is not None:
        return no
    web = web_of(request)
    c = web.ctx(request, env)
    transition = str((await read_json(request)).get("transition_id", ""))
    r = _recovery(c, scan)
    if r is None or transition not in {f.transition_id for f in r.failed}:
        return _answer(422, "Skip a failed action of this scan.")
    body = {
        "author": web.settings.reviewer,
        "kind": "skip",
        "target_kind": "transition",
        "target_id": transition,
    }
    done = "Skipped: the next scans leave this action out."
    return await _mark(c, r.portal, "mark", body, done)


@router.post("/scans/{scan}/restart", response_model=WriteResult)
async def restart(request: Request, scan: str, env: str | None = None) -> JSONResponse:
    """Resume a stopped scan (`run_type` continue) or retry one failed action (`retry`, with
    `transition_id` and `variation`): the request goes to the portal's conversation."""
    if not same_origin(request):
        return _answer(403, "Cross-origin request refused.")
    web = web_of(request)
    c = web.ctx(request, env)
    form = await read_json(request)
    run_type = str(form.get("run_type", ""))
    r = _recovery(c, scan)
    failed = {f.transition_id for f in r.failed} if r else set()
    transition = str(form.get("transition_id", ""))
    if r is None or run_type not in ("continue", "retry"):
        return _answer(422, "Resume or retry a scan of this store.")
    if run_type == "retry" and transition not in failed:
        return _answer(422, "Retry a failed action of this scan.")
    fields = {
        "parent_run_id": scan,
        "target_transition_id": transition,
        "variation": str(form.get("variation", "none")),
    }
    plan = plan_from_form(run_type, fields) or {}
    text = scan_request_text(r.portal, r.persona, r.environment or None, run_type, plan)
    _, refused = await send_to_chat(web, c.env, r.portal, text)
    if refused:
        return _answer(502, f"Not started: {refused}.")
    return _answer(
        200,
        "Sent to the assistant: it starts the scan in the portal's conversation.",
        assistant_href(r.portal),
    )
