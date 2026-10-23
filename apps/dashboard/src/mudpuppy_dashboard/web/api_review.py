"""The React console's Review page (R-96, spec 062; designer screens v2-04, v2-05, v2-16) and its
writes: confirm or reject findings, rules and removals (alone, alike or selected), Undo a decision,
and confirm, reject or comment a record's revision, through the chat service and `docs:review`;
every write answers `{ok, message, href}`, a decision also the
`undo` it can be taken back with. No SQL here (G-15)."""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Query, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from .. import queries_app_review, queries_docs, queries_settings, review
from .api_common import known_portal, store
from .chat_forward import read_json
from .chat_writes import WriteResult, write_answer, write_refused
from .deps import web_of
from .review_calls import Confirmed, also_settle, model_call

router = APIRouter(prefix="/api/portals/{portal}/review")


class ReviewParams(BaseModel):
    """The page's query: its tab, a group's tab and page, the selection and the filters."""

    env: str | None = None
    tab: str = "needs"
    show: str | None = None
    select: str | None = None
    page: str | None = None
    part: str | None = None
    age: str | None = None


class DecisionResult(WriteResult):
    """A decision's answer: the command Undo takes back."""

    undo: str | None = None


@router.get("")
def review_page(
    request: Request, portal: str, q: Annotated[ReviewParams, Query()]
) -> queries_app_review.ReviewPage:
    web = web_of(request)
    c = web.ctx(request, q.env)
    known_portal(web, c, portal)
    asked = queries_app_review.ReviewQuery(q.tab, q.show, q.select, q.page, q.part, q.age)
    attrs = queries_settings.attributes_by_persona(web.settings.personas_dir, portal)
    who = queries_app_review.Viewer(bool(web.settings.reviewer), attrs)
    with store(c) as conn:
        return queries_app_review.review_page(conn, portal, asked, who)


def _decision(status: int, message: str, undo: str | None = None) -> JSONResponse:
    body = DecisionResult(ok=status == 200, message=message, undo=undo).model_dump()
    return JSONResponse(body, status_code=status, headers={"Cache-Control": "no-store"})


def _strings(value: Any) -> list[str]:
    return [str(v) for v in value if isinstance(v, str) and v] if isinstance(value, list) else []


@router.post("/decide", response_model=DecisionResult)
async def decide(request: Request, portal: str) -> JSONResponse:
    """Confirm or reject hypotheses (one item, an alike group or a selection); a reject needs a
    reason; a confirm also settles the Same screen? pairs it names."""
    if (no := write_refused(request, "decide")) is not None:
        return no
    form = await read_json(request)
    keys, action = _strings(form.get("keys")), form.get("action")
    reason = str(form.get("reason") or "").strip()
    if action not in ("confirm", "reject") or not keys:
        return _decision(422, "Unknown action, or nothing to decide.")
    if action == "reject" and not reason:
        return _decision(422, "A reject needs a reason: say why.")
    web = web_of(request)
    c = web.ctx(request, None)
    body = {
        "keys": keys,
        "decision": action,
        "by": web.settings.reviewer,
        "reason": reason or "Confirmed in Review.",
    }
    refused, answer = await model_call(web, c.env, portal, "decide", body)
    if refused:
        return _decision(502, f"Not recorded: {refused}.")
    done = "Confirmed" if action == "confirm" else "Rejected"
    note = f"{done}: {', '.join(keys)}."
    if action == "confirm":
        note += await also_settle(
            web, c.env, portal, Confirmed(keys, reason, _strings(form.get("also")))
        )
    undo = str(answer["decision"]) if answer.get("decision") else None
    return _decision(200, note, undo)


@router.post("/undo", response_model=WriteResult)
async def undo(request: Request, portal: str) -> JSONResponse:
    """Take one decision back: every item it decided goes back to the queue. The chat service
    refuses when anything changed since."""
    if (no := write_refused(request, "undo a decision")) is not None:
        return no
    decision = str((await read_json(request)).get("decision") or "")
    if not decision:
        return write_answer(422, "Nothing to undo.")
    web = web_of(request)
    c = web.ctx(request, None)
    body = {"decision": decision, "by": web.settings.reviewer}
    refused, answer = await model_call(web, c.env, portal, "undo", body)
    if refused:
        return write_answer(502, f"Not undone: {refused}.")
    keys = [str(u.get("key")) for u in answer.get("undone", []) if isinstance(u, dict)]
    return write_answer(200, f"Undone: {', '.join(keys)}.")


@router.post("/records/{key}", response_model=WriteResult)
async def record(request: Request, portal: str, key: str) -> JSONResponse:
    """Confirm, reject or comment one revision of a record: the `docs:review` write. A reject or
    a comment needs its text."""
    if (no := write_refused(request, "review records")) is not None:
        return no
    form = await read_json(request)
    action = form.get("action")
    text = str(form.get("text") or "").strip()
    rev = form.get("rev")
    if action not in ("confirm", "reject", "comment") or not isinstance(rev, int):
        return write_answer(422, "Unknown action or revision.")
    if action != "confirm" and not text:
        return write_answer(422, f"A {action} needs a text: say why.")
    web = web_of(request)
    c = web.ctx(request, None)
    with store(c) as conn:
        if queries_docs.get_record(conn, portal, key) is None:
            return write_answer(404, f"No record {key} in {portal}.")
    outcome = await run_in_threadpool(
        review.submit_review,
        web.settings,
        c.env,
        portal_id=portal,
        key=key,
        rev_no=rev,
        action=action,
        text=text or None,
    )
    if outcome.ok:
        return write_answer(200, f"Recorded {action} on {key} revision {rev}.")
    return write_answer(502, f"Not recorded: {outcome.message or outcome.code or 'failed'}.")
