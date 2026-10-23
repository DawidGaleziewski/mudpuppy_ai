"""The React console's Processes list (R-96, spec 057; designer screen 04) and its writes: a new
process from screens, Restore an archived one, and Accept, Dismiss, Split or Merge a suggestion.
Every write is the chat call the htmx forwarder sends (contracts/processes-api.md), signed with
the reviewer, and answers `{ok, message, href}`. No SQL here (G-15)."""

from __future__ import annotations

import re
from typing import Any, NamedTuple
from urllib.parse import quote

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from .. import queries_app_processes
from ..queries_processes import ENVIRONMENTS, STAGES
from .api_common import known_portal, store
from .chat_forward import read_json
from .chat_writes import CHECK_RUNS, WriteResult, chat_write, write_answer, write_refused
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


class Target(NamedTuple):
    """Where a process write goes on the chat service: the portal, the path under it, the method."""

    portal: str
    rest: str
    method: str = "POST"


async def _send(
    request: Request, portal: str, rest: str, body: dict[str, Any], done: str
) -> JSONResponse:
    """One process write (POST), signed; a process it made or changed answers its page."""
    return await _send_to(request, Target(portal, rest), body, done)


async def _send_to(
    request: Request, target: Target, body: dict[str, Any], done: str
) -> JSONResponse:
    if (no := write_refused(request, "change processes")) is not None:
        return no
    web = web_of(request)
    c = web.ctx(request, None)
    signed = {**body, "author": web.settings.reviewer}
    path = f"/portals/{quote(target.portal, safe='')}/{target.rest}"
    status, answer = await chat_write(web, c.env, target.method, path, signed)
    if status in (200, 201):
        return write_answer(200, done, _page_of(target.portal, answer))
    message = answer.get("message") or f"the chat service answered {status}"
    return write_answer(502, f"Not done: {message}.")


def _page_of(portal: str, answer: dict[str, Any]) -> str | None:
    """The React page of the process an answer names, on the model it made (A otherwise)."""
    process = answer.get("process")
    key = process.get("key") if isinstance(process, dict) else None
    if not isinstance(key, str):
        return None
    made = answer.get("variant") or answer.get("model")
    label = made.get("label") if isinstance(made, dict) else None
    model = label if isinstance(label, str) else "A"
    return f"/app/portals/{quote(portal, safe='')}/processes/{quote(key, safe='')}?model={model}"


async def _stage(request: Request, portal: str, process: str, stage: str, base: object):
    rest = f"processes/{quote(process, safe='')}"
    body = {"stage": stage, "base_rev": base}
    return await _send(request, portal, rest, body, "Stage set; it shows in History.")


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


@router.post("/processes/{process}/archive", response_model=WriteResult)
async def archive(request: Request, portal: str, process: str) -> JSONResponse:
    """Archive a process (`base_rev`): out of the list, nothing deleted."""
    form = await read_json(request)
    rest = f"processes/{quote(process, safe='')}/archive"
    done = "Archived: it left the list; Restore puts it back."
    return await _send(request, portal, rest, {"base_rev": form.get("base_rev")}, done)


@router.post("/processes/{process}/stage", response_model=WriteResult)
async def stage(request: Request, portal: str, process: str) -> JSONResponse:
    """Move the process to a stage (`stage`, `base_rev`); as-is documented signs A off."""
    form = await read_json(request)
    value = str(form.get("stage", ""))
    if value not in STAGES:
        if (no := write_refused(request, "change processes")) is not None:
            return no
        return write_answer(422, "Pick one of the stages.")
    return await _stage(request, portal, process, value, form.get("base_rev"))


@router.post("/processes/{process}/models", response_model=WriteResult)
async def new_model(request: Request, portal: str, process: str) -> JSONResponse:
    """A new to-be model copied from model `from` (A by default); answers its page."""
    form = await read_json(request)
    source = str(form.get("from") or "A")
    rest = f"processes/{quote(process, safe='')}/models"
    done = f"A new process model, copied from {source}."
    return await _send(request, portal, rest, {"from": source}, done)


@router.post("/processes/{process}/models/A/edit", response_model=WriteResult)
async def edit_as_is(request: Request, portal: str, process: str) -> JSONResponse:
    """A's screens in a new order, without one, or with one more (`base_rev`, `state_ids`): one
    signed revision of A."""
    form = await read_json(request)
    states = _ids(form.get("state_ids"))
    if not states:
        if (no := write_refused(request, "change processes")) is not None:
            return no
        return write_answer(422, "A keeps at least one screen.")
    rest = f"processes/{quote(process, safe='')}/models/A/edit"
    body = {"base_rev": form.get("base_rev"), "state_ids": states}
    return await _send(request, portal, rest, body, "A changed: a new signed revision.")


#: A to-be model's label (the as-is is A and is never drawn in a draft).
TO_BE = re.compile(r"^(?!A$)[A-Z]{1,2}$")

DRAFT_OPS: dict[str, tuple[str, str, str]] = {
    # op → (method, path under the model, what the person reads after it)
    "draft": ("PUT", "draft", "Draft saved; only you see it until you save."),
    "discard": ("DELETE", "draft", "Draft discarded; the last revision stays."),
    "save": ("POST", "save", "Saved as a new revision."),
    "rebase": ("POST", "rebase", "Your draft now sits on the latest revision, its steps kept."),
    "restore": ("POST", "restore", "Restored as a new revision; nothing was deleted."),
}


@router.post("/processes/{process}/models/{label}/{op}", response_model=WriteResult)
async def draft_op(
    request: Request, portal: str, process: str, label: str, op: str
) -> JSONResponse:
    """The person's draft of to-be model `label`: autosave its steps (`draft`: `base_rev`,
    `steps`), `discard` it, `save` it as the next revision (`base_rev`, `note`), or `rebase` it
    onto the latest revision. A draft is the person's own until saved."""
    if op not in DRAFT_OPS or not TO_BE.match(label):
        return write_answer(404, "This address does not exist.")
    form = await read_json(request)
    method, sub, done = DRAFT_OPS[op]
    body = {k: form[k] for k in ("base_rev", "steps", "note", "rev") if k in form}
    rest = f"processes/{quote(process, safe='')}/models/{label}/{sub}"
    return await _send_to(request, Target(portal, rest, method), body, done)


@router.post("/processes/{process}/live", response_model=WriteResult)
async def mark_live(request: Request, portal: str, process: str) -> JSONResponse:
    """Record which model revision runs in an environment (`environment`, `label`, `reason`).
    It deploys nothing; the newest mark wins and earlier ones stay."""
    form = await read_json(request)
    env = str(form.get("environment", ""))
    if env not in ENVIRONMENTS or not str(form.get("label", "")):
        if (no := write_refused(request, "change processes")) is not None:
            return no
        return write_answer(422, "Pick an environment and a process model.")
    body = {k: form[k] for k in ("environment", "label", "rev", "reason") if form.get(k)}
    rest = f"processes/{quote(process, safe='')}/live"
    return await _send(request, portal, rest, body, f"Marked live in {env}.")


@router.post("/processes/{process}/change-spec", response_model=WriteResult)
async def change_spec(request: Request, portal: str, process: str) -> JSONResponse:
    """Save the change spec of a pair of models as its next revision (`left` and `right` as
    `{label, rev}`, every section, `base_rev` when one is saved already)."""
    form = await read_json(request)
    if not isinstance(form.get("sections"), dict):
        if (no := write_refused(request, "change processes")) is not None:
            return no
        return write_answer(422, "Send every section of the change spec.")
    body = {k: form[k] for k in ("left", "right", "sections", "base_rev") if k in form}
    rest = f"processes/{quote(process, safe='')}/change-spec"
    return await _send(request, portal, rest, body, "Change spec saved as a new revision.")


@router.post("/check-runs", response_model=WriteResult)
async def check_run(request: Request, portal: str) -> JSONResponse:
    """Start the exploration of a process on the headless driver (`kind` explore or replay,
    `process_key`); pressing it is the owner's yes (spec 039 owner answer 12)."""
    form = await read_json(request)
    kind = str(form.get("kind", ""))
    if kind not in CHECK_RUNS:
        if (no := write_refused(request, "start check runs")) is not None:
            return no
        return write_answer(422, "Unknown check run.")
    body = {
        "kind": kind,
        **({"process_key": form["process_key"]} if form.get("process_key") else {}),
    }
    done = f"{CHECK_RUNS[kind]} started; the model takes the results on its next rebuild."
    return await _send(request, portal, "check-runs", body, done)


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
