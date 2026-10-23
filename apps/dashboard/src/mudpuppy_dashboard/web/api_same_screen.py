"""The React console's Same screen? (R-100, spec 071): one pair of page versions and the person's
answer, sent to the chat service signed with the reviewer's name (the dashboard never writes).
No SQL here (G-15)."""

from __future__ import annotations

from typing import Annotated
from urllib.parse import quote

from fastapi import APIRouter, Query, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from .. import queries_app_same_screen, queries_same_screen
from .api_common import known_portal, store
from .chat_forward import read_json
from .chat_writes import WriteResult, chat_write, write_answer, write_refused
from .deps import web_of

router = APIRouter(prefix="/api/portals/{portal}/same-screen")


class SameScreenQuery(BaseModel):
    """The pair to show (`a`, `b`) and the screen whose queue to walk."""

    env: str | None = None
    screen: str | None = None
    a: str | None = None
    b: str | None = None


class SameScreenView(BaseModel):
    page: queries_app_same_screen.SameScreenPage
    #: The reviewer's name is set, so an answer can be saved.
    can_answer: bool


@router.get("")
def same_screen(
    request: Request, portal: str, q: Annotated[SameScreenQuery, Query()]
) -> SameScreenView:
    web = web_of(request)
    c = web.ctx(request, q.env)
    known_portal(web, c, portal)
    with store(c) as conn:
        page = queries_app_same_screen.same_screen_page(conn, portal, q.screen or None, (q.a, q.b))
    return SameScreenView(page=page, can_answer=bool(web.settings.reviewer))


@router.post("/label", response_model=WriteResult)
async def label(request: Request, portal: str) -> JSONResponse:
    """Same screen, same with different data, or different screens, with an optional reason."""
    if (no := write_refused(request, "answer")) is not None:
        return no
    form = await read_json(request)
    a, b, answer = str(form.get("a") or ""), str(form.get("b") or ""), str(form.get("answer") or "")
    if answer not in queries_same_screen.ANSWERS or not (a and b):
        return write_answer(422, "Pick an answer: 1, 2 or 3.")
    web = web_of(request)
    c = web.ctx(request, None)
    body = {"a": a, "b": b, "answer": answer, "by": web.settings.reviewer}
    if why := str(form.get("why") or "").strip():
        body["reason"] = why
    path = f"/portals/{quote(portal, safe='')}/model/label"
    status, reply = await chat_write(web, c.env, "POST", path, body)
    if status != 201:
        return write_answer(502, f"Not saved: {reply.get('message') or status}.")
    word = queries_same_screen.WORDS[answer]
    return write_answer(200, f"Saved: {word}. The next model rebuild applies it.")
