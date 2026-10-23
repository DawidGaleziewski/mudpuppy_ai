"""The React console's amendment writes on a recorded screen (R-100, spec 071; spec 022 T031,
T032): add one (on the whole screen or an element, an attachment optional), edit its wording as a
new revision, withdraw it. Each is a chat service call signed with the reviewer; every write
answers `{ok, message, href}`. No SQL here (G-15)."""

from __future__ import annotations

from typing import Any
from urllib.parse import quote

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from .chat_forward import read_json
from .chat_writes import WriteResult, chat_write, write_answer, write_refused
from .deps import web_of

router = APIRouter(prefix="/api/portals/{portal}/amendments")

# The chat service takes 8 MB of file content; base64 adds a third.
MAX_ATTACHMENT_B64 = (8 * 1024 * 1024 * 4 + 2) // 3


def _path(portal: str, *parts: str) -> str:
    return "/portals/" + "/".join(quote(p, safe="") for p in (portal, "amendments", *parts))


async def _signed(
    request: Request, method: str, path: str, body: dict[str, Any]
) -> JSONResponse | dict[str, Any]:
    web = web_of(request)
    c = web.ctx(request, None)
    status, answer = await chat_write(
        web, c.env, method, path, {**body, "author": web.settings.reviewer}
    )
    if status not in (200, 201):
        message = answer.get("message") or f"the chat service answered {status}"
        return write_answer(502, f"Not recorded: {message}.")
    return answer


def _target(form: dict[str, Any]) -> dict[str, str] | None:
    state = str(form.get("state_id") or "").strip()
    element = str(form.get("element") or "").strip()
    if not state:
        return None
    if element:
        return {
            "kind": "element_ref",
            "target_kind": "wireframe_element",
            "target_id": f"{state}#{element}",
        }
    return {"kind": "note", "target_kind": "state", "target_id": state}


@router.post("", response_model=WriteResult)
async def add(request: Request, portal: str) -> JSONResponse:
    """A new amendment on the screen or one of its elements, with a note and an attachment."""
    if (no := write_refused(request, "add amendments")) is not None:
        return no
    form = await read_json(request)
    body: dict[str, Any] | None = _target(form)
    if body is None:
        return write_answer(422, "The amendment has no screen.")
    text = str(form.get("text") or "").strip()
    attachment = form.get("attachment")
    if not text and not isinstance(attachment, dict):
        return write_answer(422, "Write what should be different, or attach a file.")
    if text:
        body["text"] = text
    elif isinstance(attachment, dict):
        body["kind"] = "attachment"  # a file without a note
    if isinstance(attachment, dict):
        name, content = attachment.get("name"), attachment.get("content_base64")
        if not isinstance(name, str) or not isinstance(content, str) or not content:
            return write_answer(422, "The attachment could not be read.")
        if len(content) > MAX_ATTACHMENT_B64:
            return write_answer(413, "The attachment is larger than 8 MB.")
        body["attachment"] = {"name": name, "content_base64": content}
    answer = await _signed(request, "POST", _path(portal), body)
    if isinstance(answer, JSONResponse):
        return answer
    return write_answer(200, f"{answer.get('key') or 'The amendment'} added.")


@router.post("/{amendment}/edit", response_model=WriteResult)
async def edit(request: Request, portal: str, amendment: str) -> JSONResponse:
    """New wording as the next revision; the chat service checks it was made on the newest one."""
    if (no := write_refused(request, "edit amendments")) is not None:
        return no
    form = await read_json(request)
    text, base_rev = str(form.get("text") or "").strip(), form.get("base_rev")
    if not text:
        return write_answer(422, "Write the new wording.")
    if not isinstance(base_rev, int) or isinstance(base_rev, bool) or base_rev < 1:
        return write_answer(422, "Reload the page: the revision it was edited from is unknown.")
    answer = await _signed(
        request, "PATCH", _path(portal, amendment), {"text": text, "base_rev": base_rev}
    )
    if isinstance(answer, JSONResponse):
        return answer
    rev = f" as r{answer['rev']}" if answer.get("rev") else ""
    return write_answer(200, f"{answer.get('key') or 'The amendment'} saved{rev}.")


@router.post("/{amendment}/withdraw", response_model=WriteResult)
async def withdraw(request: Request, portal: str, amendment: str) -> JSONResponse:
    """Withdraw an amendment: it stays in the history, no longer active."""
    if (no := write_refused(request, "withdraw amendments")) is not None:
        return no
    answer = await _signed(request, "DELETE", _path(portal, amendment), {})
    if isinstance(answer, JSONResponse):
        return answer
    return write_answer(200, "Withdrawn.")
