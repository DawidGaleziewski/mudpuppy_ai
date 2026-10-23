"""The React console's Processes list (R-96, spec 057; designer screen 04) and its writes: a new
process from screens, Restore an archived one, and Accept, Dismiss, Split or Merge a suggestion.
Every write is the chat call the htmx forwarder sends (contracts/processes-api.md), signed with
the reviewer, and answers `{ok, message, href}`. No SQL here (G-15)."""

from __future__ import annotations

from typing import Any
from urllib.parse import quote

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from .. import queries_app_processes
from .api_common import known_portal, store
from .chat_forward import read_json
from .chat_writes import WriteResult, chat_write, write_answer, write_refused
from .deps import web_of

router = APIRouter(prefix="/api/portals/{portal}")

SUGGESTION_DONE = {
    "accept": "Accepted: it is a process now.",
    "dismiss": "Dismissed: the assistant does not suggest these screens again.",
    "split": "Split in two: both halves are suggested instead.",
    "merge": "Merged: one suggestion replaces the two.",
}


@router.get("/processes")
def processes(
    request: Request,
    portal: str,
    env: str | None = None,
    archived: bool = False,
    page: str | None = None,
) -> queries_app_processes.ProcessList:
    """Screen 04: the processes, the assistant's suggestions and the screens in no process."""
    web = web_of(request)
    c = web.ctx(request, env)
    known_portal(web, c, portal)
    with store(c) as conn:
        return queries_app_processes.process_list(conn, portal, archived, page)


async def _send(
    request: Request, portal: str, rest: str, body: dict[str, Any], done: str
) -> JSONResponse:
    """One process write, signed; a process it made or changed answers its page."""
    if (no := write_refused(request, "change processes")) is not None:
        return no
    web = web_of(request)
    c = web.ctx(request, None)
    signed = {**body, "author": web.settings.reviewer}
    path = f"/portals/{quote(portal, safe='')}/{rest}"
    status, answer = await chat_write(web, c.env, "POST", path, signed)
    if status in (200, 201):
        process = answer.get("process")
        key = process.get("key") if isinstance(process, dict) else None
        href = f"/processes/{quote(key, safe='')}?model=A" if isinstance(key, str) else None
        return write_answer(200, done, href)
    message = answer.get("message") or f"the chat service answered {status}"
    return write_answer(502, f"Not done: {message}.")


def _ids(value: object) -> list[str]:
    return [v for v in value if isinstance(v, str) and v] if isinstance(value, list) else []


@router.post("/processes", response_model=WriteResult)
async def new_process(request: Request, portal: str) -> JSONResponse:
    """A new process from screens ticked in walking order (`name`, `persona`, `state_ids`)."""
    form = await read_json(request)
    name, persona = str(form.get("name", "")).strip(), str(form.get("persona", "")).strip()
    states = _ids(form.get("state_ids"))
    if not name or not persona or not states:
        if (no := write_refused(request, "change processes")) is not None:
            return no
        return write_answer(422, "Name the process and its persona, and tick at least one screen.")
    body = {"name": name, "persona": persona, "state_ids": states}
    return await _send(request, portal, "processes", body, f"Made {name}.")


@router.post("/processes/{process}/unarchive", response_model=WriteResult)
async def unarchive(request: Request, portal: str, process: str) -> JSONResponse:
    """Restore an archived process to the list (`base_rev`)."""
    form = await read_json(request)
    base = form.get("base_rev")
    rest = f"processes/{quote(process, safe='')}/unarchive"
    done = "Restored: it is back in the list."
    return await _send(request, portal, rest, {"base_rev": base}, done)


@router.post("/suggestions/{suggestion}/{action}", response_model=WriteResult)
async def suggestion(request: Request, portal: str, suggestion: str, action: str) -> JSONResponse:
    """Accept, Dismiss, Split (`at`, the step it starts the second half at) or Merge (`with`,
    the other suggestion) one of the assistant's suggestions."""
    if action not in SUGGESTION_DONE:
        return write_answer(404, "This address does not exist.")
    form = await read_json(request)
    body = {k: form[k] for k in ("at", "with", "name") if k in form}
    rest = f"suggestions/{quote(suggestion, safe='')}/{action}"
    return await _send(request, portal, rest, body, SUGGESTION_DONE[action])
