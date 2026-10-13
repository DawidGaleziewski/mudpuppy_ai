"""TO-BE amendments: the forms' posts and the assistant's proposals (spec 022), forwarded to the
chat service (T031, T033); the old superseded-amendments URL redirects to Review (FR-009)."""

from __future__ import annotations

from typing import Any
from urllib.parse import quote

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse, RedirectResponse

from .chat_forward import chat_json, chat_refused, forward, invalid, read_json
from .deps import same_origin, web_of

router = APIRouter()

# Largest attachment the chat service takes is 8 MB of file content; base64 adds a third.
MAX_ATTACHMENT_B64 = (8 * 1024 * 1024 * 4 + 2) // 3


def _author(request: Request) -> dict[str, str]:
    """Who makes the change (spec 022: every revision is signed): the configured reviewer name;
    without one the chat service records `BA`."""
    reviewer = web_of(request).settings.reviewer
    return {"author": reviewer} if reviewer else {}


@router.post("/chat/portals/{portal}/amendments")
async def amendment_create(request: Request, portal: str) -> JSONResponse:
    if not same_origin(request):
        return chat_refused()
    web = web_of(request)
    fields = await read_json(request)
    sent: dict[str, Any] = {
        k: fields[k]
        for k in ("kind", "target_kind", "target_id", "text", "author")
        if isinstance(fields.get(k), str) and fields[k].strip()
    }
    attachment = fields.get("attachment")
    if isinstance(attachment, dict):
        name, content = attachment.get("name"), attachment.get("content_base64")
        if not isinstance(name, str) or not isinstance(content, str) or not content:
            return invalid("The attachment could not be read.")
        if len(content) > MAX_ATTACHMENT_B64:
            return chat_json(413, {"ref": None, "message": "The attachment is larger than 8 MB."})
        sent["attachment"] = {"name": name, "content_base64": content}
    if not all(k in sent for k in ("kind", "target_kind", "target_id")):
        return invalid("The amendment has no target.")
    sent = {**_author(request), **sent}
    return await forward(web, "POST", f"/portals/{quote(portal, safe='')}/amendments", sent)


@router.delete("/chat/portals/{portal}/amendments/{amendment_id}")
async def amendment_withdraw(request: Request, portal: str, amendment_id: str) -> JSONResponse:
    if not same_origin(request):
        return chat_refused()
    web = web_of(request)
    return await forward(
        web,
        "DELETE",
        f"/portals/{quote(portal, safe='')}/amendments/{quote(amendment_id, safe='')}",
        _author(request) or None,
    )


@router.patch("/chat/portals/{portal}/amendments/{amendment_id}")
async def amendment_edit(request: Request, portal: str, amendment_id: str) -> JSONResponse:
    """New wording as a new revision (spec 022 T032), signed; the chat service checks the base."""
    if not same_origin(request):
        return chat_refused()
    web = web_of(request)
    fields = await read_json(request)
    text, base_rev = fields.get("text"), fields.get("base_rev")
    if not isinstance(text, str) or not text.strip():
        return invalid("Write the new wording.")
    if not isinstance(base_rev, int) or isinstance(base_rev, bool) or base_rev < 1:
        return invalid("Reload the page: the revision it was edited from is unknown.")
    return await forward(
        web,
        "PATCH",
        f"/portals/{quote(portal, safe='')}/amendments/{quote(amendment_id, safe='')}",
        {**_author(request), "text": text.strip(), "base_rev": base_rev},
    )


@router.post("/chat/portals/{portal}/amendments/{amendment_id}/reapply")
async def amendment_reapply(request: Request, portal: str, amendment_id: str) -> JSONResponse:
    if not same_origin(request):
        return chat_refused()
    web = web_of(request)
    fields = await read_json(request)
    sent = {
        k: fields[k]
        for k in ("target_kind", "target_id", "text")
        if isinstance(fields.get(k), str) and fields[k].strip()
    }
    if "target_kind" not in sent or "target_id" not in sent:
        return invalid("Choose the state to apply it to.")
    return await forward(
        web,
        "POST",
        f"/portals/{quote(portal, safe='')}/amendments/{quote(amendment_id, safe='')}/reapply",
        {**_author(request), **sent},
    )


@router.post("/chat/portals/{portal}/amendments/{amendment_id}/dismiss")
async def amendment_dismiss(request: Request, portal: str, amendment_id: str) -> JSONResponse:
    if not same_origin(request):
        return chat_refused()
    web = web_of(request)
    return await forward(
        web,
        "POST",
        f"/portals/{quote(portal, safe='')}/amendments/{quote(amendment_id, safe='')}/dismiss",
        _author(request),
    )


@router.post("/chat/portals/{portal}/proposals/{proposal_id}/{verb}")
async def proposal_decide(
    request: Request, portal: str, proposal_id: str, verb: str
) -> JSONResponse:
    """Apply, discard or undo an assistant proposal (spec 022 FE-A04), signed like an edit."""
    if not same_origin(request):
        return chat_refused()
    if verb not in ("apply", "discard", "undo"):
        return invalid("Apply, discard or undo.")
    web = web_of(request)
    return await forward(
        web,
        "POST",
        f"/portals/{quote(portal, safe='')}/proposals/{quote(proposal_id, safe='')}/{verb}",
        _author(request),
    )


@router.get("/amendments/superseded", response_model=None)
def superseded_page(
    request: Request, env: str | None = None, portal: str | None = None
) -> RedirectResponse:
    """FR-009: the old page is the Review inbox's re-anchor group now."""
    c = web_of(request).ctx(request, env)
    return RedirectResponse(c.url("/review", portal=portal, show="reanchor"), status_code=307)
