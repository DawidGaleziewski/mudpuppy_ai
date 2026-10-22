"""Same screen? (spec 039 T100, designer screen v2-14, UX-R34): one pair of page versions side by
side, a person answers same screen, same with different data, or different screens. Conflicts come
first. The answer goes through the chat service, signed with the reviewer's name (the dashboard
never writes), then on to the next pair."""

from __future__ import annotations

from urllib.parse import parse_qs, quote

from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse, PlainTextResponse, RedirectResponse, Response

from .. import chat_client, db, queries_same_screen
from .deps import Web, same_origin, web_of

router = APIRouter()


@router.get("/same-screen", response_class=HTMLResponse)
def same_screen_page(
    request: Request,
    env: str | None = None,
    screen: str | None = None,
    a: str | None = None,
    b: str | None = None,
    note: str | None = None,
) -> HTMLResponse:
    """The pair `a`/`b`, or the first in the queue (of one screen with `screen=SC-…`)."""
    web = web_of(request)
    c = web.ctx(request, env)
    d, tau = None, None
    try:
        with c.conn() as conn:
            tau = queries_same_screen.tau_in_force(conn, c.portal) if c.portal else None
            if c.portal and not (a and b):
                first = queries_same_screen.queue(conn, c.portal, screen or None)[:1]
                a, b = (first[0].a.state_id, first[0].b.state_id) if first else (None, None)
            if c.portal and a and b:
                d = queries_same_screen.pair_detail(conn, c.portal, a, b, screen or None)
    except db.StoreMissing as err:
        return web.missing(c, err)
    return web.render(
        c,
        "salvage/same_screen.html",
        status_code=404 if a and b and d is None else 200,
        nav_current="review",
        d=d,
        screen=screen or None,
        note=note,
        words=queries_same_screen.WORDS,
        tau=tau,
        window=queries_same_screen.LABEL_WINDOW,
    )


@router.post("/same-screen/{portal}", response_model=None)
async def label_pair(request: Request, portal: str, env: str | None = None) -> Response:
    """The answer, through the chat service; then the next pair with the outcome as a note."""
    if not same_origin(request):
        return PlainTextResponse("Cross-origin request refused.", status_code=403)
    web = web_of(request)
    c = web.ctx(request, env)
    form = {k: v[0] for k, v in parse_qs((await request.body()).decode("utf-8", "replace")).items()}
    a, b, answer = form.get("a", ""), form.get("b", ""), form.get("answer", "")
    screen = form.get("screen") or None
    if not web.settings.reviewer:
        note = "Set MUDPUPPY_REVIEWER to your name to answer."
    elif answer not in queries_same_screen.ANSWERS or not (a and b):
        note = "Pick an answer: 1, 2 or 3."
    else:
        note = await _label(web, c.env, portal, a, b, answer, form.get("why", "").strip())
    stay = note.startswith(("Not", "Pick", "Set"))
    nxt = (form.get("next_a"), form.get("next_b")) if not stay else (a, b)
    return RedirectResponse(
        c.url("/same-screen", portal=portal, screen=screen, a=nxt[0], b=nxt[1], note=note), 303
    )


async def _label(web: Web, env: str, portal: str, a: str, b: str, answer: str, why: str) -> str:
    body = {"a": a, "b": b, "answer": answer, "by": web.settings.reviewer}
    if why:
        body["reason"] = why
    try:
        status, reply = await chat_client.call(
            web.settings,
            "POST",
            f"/portals/{quote(portal, safe='')}/model/label",
            body,
            web.chat_transport,
        )
    except chat_client.ChatUnavailable:
        return chat_client.not_running(env)
    if status == 201:
        word = queries_same_screen.WORDS[answer]
        return f"Saved: {word}. The next model rebuild applies it."
    message = reply.get("message") if isinstance(reply, dict) else None
    return f"Not saved: {message or status}."
