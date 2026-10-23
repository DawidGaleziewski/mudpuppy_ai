"""The React console's Review writes for the kinds spec 063 moves (R-96): re-anchor or dismiss an
amendment, apply or discard an assistant proposal, save, approve or dismiss a probe suite. Each
is a chat service call signed with the reviewer; every write answers `{ok, message, href}`. No SQL
here (G-15)."""

from __future__ import annotations

from typing import Any
from urllib.parse import quote

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from .. import queries_suites, suite_form
from .api_common import store
from .chat_forward import read_json
from .chat_writes import WriteResult, chat_write, write_answer, write_refused
from .deps import web_of

router = APIRouter(prefix="/api/portals/{portal}/review")

PROPOSAL_DONE = {"apply": "Applied.", "discard": "Discarded."}


def _path(portal: str, *parts: str) -> str:
    return "/portals/" + "/".join(quote(p, safe="") for p in (portal, *parts))


async def _signed(request: Request, path: str, body: dict[str, Any]) -> tuple[int, dict[str, Any]]:
    web = web_of(request)
    c = web.ctx(request, None)
    return await chat_write(web, c.env, "POST", path, {**body, "author": web.settings.reviewer})


def _refusal(status: int, answer: dict[str, Any]) -> JSONResponse:
    message = answer.get("message") or f"the chat service answered {status}"
    return write_answer(502, f"Not done: {message}.")


@router.post("/amendments/{amendment}/reanchor", response_model=WriteResult)
async def reanchor(request: Request, portal: str, amendment: str) -> JSONResponse:
    """Put an amendment back on a screen (an element optional, new wording optional): a new
    revision through the chat service."""
    if (no := write_refused(request, "re-anchor amendments")) is not None:
        return no
    form = await read_json(request)
    state = str(form.get("state_id") or "").strip()
    element = str(form.get("element") or "").strip()
    text = str(form.get("text") or "").strip()
    if not state:
        return write_answer(422, "Choose the screen to anchor it on.")
    body: dict[str, Any] = (
        {"target_kind": "wireframe_element", "target_id": f"{state}#{element}"}
        if element
        else {"target_kind": "state", "target_id": state}
    )
    if text:
        body["text"] = text
    status, answer = await _signed(request, _path(portal, "amendments", amendment, "reapply"), body)
    if status not in (200, 201):
        return _refusal(status, answer)
    key = answer.get("key") or "The amendment"
    rev = f" as r{answer['rev']}" if answer.get("rev") else ""
    return write_answer(200, f"{key} re-anchored{rev}.")


@router.post("/amendments/{amendment}/dismiss", response_model=WriteResult)
async def dismiss(request: Request, portal: str, amendment: str) -> JSONResponse:
    """Dismiss an amendment that lost its place: it leaves Review; nothing is deleted."""
    if (no := write_refused(request, "dismiss amendments")) is not None:
        return no
    status, answer = await _signed(request, _path(portal, "amendments", amendment, "dismiss"), {})
    if status not in (200, 201):
        return _refusal(status, answer)
    return write_answer(200, "Dismissed: it left Review.")


@router.post("/proposals/{proposal}/{verb}", response_model=WriteResult)
async def decide_proposal(request: Request, portal: str, proposal: str, verb: str) -> JSONResponse:
    """Apply an assistant proposal as the amendment's next revision, or discard it."""
    if (no := write_refused(request, "apply proposals")) is not None:
        return no
    if verb not in PROPOSAL_DONE:
        return write_answer(422, "Apply or discard.")
    status, answer = await _signed(request, _path(portal, "proposals", proposal, verb), {})
    if status not in (200, 201):
        return _refusal(status, answer)
    rev = answer.get("applied_rev") or answer.get("rev")
    done = f"Applied as r{rev}." if verb == "apply" and rev else PROPOSAL_DONE[verb]
    return write_answer(200, done)


@router.post("/suites/{suite}", response_model=WriteResult)
async def decide_suite(request: Request, portal: str, suite: str) -> JSONResponse:
    """Save the edited suite, approve it (save, then approve: written into traces.yaml) or dismiss
    it, through the chat service; the edit goes through `suite_form`."""
    if (no := write_refused(request, "decide on suites")) is not None:
        return no
    body = await read_json(request)
    action = str(body.get("action") or "")
    web = web_of(request)
    with store(web.ctx(request, None)) as conn:
        found = queries_suites.suite_by_id(conn, portal, suite)
    if found is None:
        return write_answer(404, f"There is no suite {suite} in {portal}.")
    form = suite_form.form_of(body)
    calls = suite_form.suite_calls(action, found.trace, form, str(web.settings.reviewer))
    if calls is None:
        return write_answer(422, "Save, approve or dismiss.")
    for verb, payload in calls:
        status, answer = await _signed(request, _path(portal, "probe-suites", suite, verb), payload)
        if status != 200:
            return _refusal(status, answer)
    return write_answer(200, suite_form.SUITE_DONE[action])
