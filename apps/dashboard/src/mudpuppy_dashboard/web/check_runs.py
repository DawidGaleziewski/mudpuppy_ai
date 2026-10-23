"""The portal model's person-started actions, through the chat service and signed with the
reviewer's name (the dashboard itself never writes): a check run (spec 039 owner answer 12: the
button starts `pnpm model:replay` or `model:explore` on the headless driver; pressing it is the
owner's yes) and accepting τ or the classifier (owner answers 5 and 14)."""

from __future__ import annotations

from typing import Any
from urllib.parse import parse_qs, quote, urlencode

from fastapi import APIRouter, Request
from fastapi.responses import PlainTextResponse, RedirectResponse, Response

from .. import chat_client
from .chat_writes import CHECK_RUNS as KINDS
from .deps import same_origin, web_of

router = APIRouter()


def _back(target: str, note: str) -> str:
    """Only an address of this dashboard is followed; the note is shown there."""
    if not target.startswith("/") or target.startswith("//"):
        target = "/"
    sep = "&" if "?" in target else "?"
    return f"{target}{sep}{urlencode({'check_note': note})}"


@router.post("/portals/{portal}/check-runs", response_model=None)
async def start_check_run(request: Request, portal: str, env: str | None = None) -> Response:
    if not same_origin(request):
        return PlainTextResponse("Cross-origin request refused.", status_code=403)
    web = web_of(request)
    form = parse_qs((await request.body()).decode("utf-8", "replace"))
    kind = (form.get("kind") or [""])[0]
    key = (form.get("process_key") or [""])[0]
    back = (form.get("back") or ["/"])[0]
    author = web.settings.reviewer
    if not author:
        return RedirectResponse(
            _back(back, "Set MUDPUPPY_REVIEWER to your name to start check runs."),
            status_code=303,
        )
    if kind not in KINDS:
        return RedirectResponse(_back(back, "Unknown check run."), status_code=303)
    body: dict[str, Any] = {"kind": kind, "author": author}
    if key:
        body["process_key"] = key
    try:
        status, answer = await chat_client.call(
            web.settings,
            "POST",
            f"/portals/{quote(portal, safe='')}/check-runs",
            body,
            web.chat_transport,
        )
    except chat_client.ChatUnavailable:
        note = chat_client.not_running(web.ctx(request, env).env)
    else:
        if status == 201:
            note = f"{KINDS[kind]} started; the model takes the results on its next rebuild."
        else:
            message = answer.get("message") if isinstance(answer, dict) else None
            note = f"Not started: {message or status}."
    return RedirectResponse(_back(back, note), status_code=303)


ACCEPTED = {"tau": "The calibrated τ", "classifier": "The classifier"}


@router.post("/portals/{portal}/model/accept", response_model=None)
async def accept_model(request: Request, portal: str, env: str | None = None) -> Response:
    """Settings ▸ Screen identity (owner answers 5 and 14): a person puts the calibrated τ or the
    trained classifier in force, through the chat service; back to Settings with what happened."""
    if not same_origin(request):
        return PlainTextResponse("Cross-origin request refused.", status_code=403)
    web = web_of(request)
    form = parse_qs((await request.body()).decode("utf-8", "replace"))
    what = (form.get("what") or [""])[0]
    author = web.settings.reviewer
    if not author or what not in ACCEPTED:
        note = "Set MUDPUPPY_REVIEWER to your name to accept." if not author else "Unknown."
    else:
        try:
            status, answer = await chat_client.call(
                web.settings,
                "POST",
                f"/portals/{quote(portal, safe='')}/model/accept",
                {"what": what, "by": author},
                web.chat_transport,
            )
        except chat_client.ChatUnavailable:
            note = chat_client.not_running(web.ctx(request, env).env)
        else:
            message = answer.get("message") if isinstance(answer, dict) else None
            note = (
                f"{ACCEPTED[what]} is in force from the next rebuild."
                if status == 201
                else f"Not accepted: {message or status}."
            )
    target = f"/portals/{quote(portal, safe='')}/settings?{urlencode({'identity_note': note})}"
    return RedirectResponse(target + "#identity-h", status_code=303)
