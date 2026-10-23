"""The React console's Settings (R-96, spec 068; screen 11) and its writes, each through the chat
service: save or revoke an environment, save the hints or the budgets, accept the calibrated τ or
the classifier. Every write answers `{ok, message, href}`. No SQL here (G-15)."""

from __future__ import annotations

from typing import Any
from urllib.parse import quote

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from .. import chat_client, db, queries_app_settings, queries_identity, queries_settings
from ..settings_forms import hints_body
from .chat_forward import read_json
from .chat_writes import WriteResult, chat_write, write_answer, write_refused
from .deps import Ctx, Web, web_of

router = APIRouter(prefix="/api/portals/{portal}")

ACCEPTED = {"tau": "The calibrated τ", "classifier": "The classifier"}


async def _chat_get(web: Web, path: str) -> tuple[int, dict[str, Any]] | None:
    """A read from the chat service; None when it does not answer."""
    try:
        code, body = await chat_client.call(web.settings, "GET", path, None, web.chat_transport)
    except chat_client.ChatUnavailable:
        return None
    return code, body if isinstance(body, dict) else {}


def _from_store(c: Ctx, portal: str):
    """Credentials (names only) and screen identity; nothing without a store yet."""
    try:
        with c.conn() as conn:
            return (
                queries_settings.stored_credentials(conn, portal),
                queries_identity.screen_identity(conn, portal),
            )
    except db.StoreMissing:
        return [], queries_identity.Identity(None, None, 0, 0, None)


@router.get("/settings")
async def settings_page(
    request: Request, portal: str, env: str | None = None
) -> queries_app_settings.SettingsPage:
    web = web_of(request)
    c = web.ctx(request, env)
    got = await _chat_get(web, f"/portals/{quote(portal, safe='')}")
    chat, error = None, None
    if got is not None:
        code, body = got
        chat = body if code == 200 else {}
        if code != 200:
            error = str(body.get("message") or "The portal file could not be read.")
    usage = None
    if got is not None and web.settings.workbench:
        answer = await _chat_get(web, "/workbench/usage")
        usage = answer[1] if answer and answer[0] == 200 else None
    credentials, identity = _from_store(c, portal)
    s = web.settings
    read = queries_app_settings.SettingsRead(
        portal=portal,
        chat=chat,
        error=error,
        usage=usage,
        credentials=credentials,
        personas=queries_settings.persona_rows(s.personas_dir, portal),
        rules=queries_settings.crawl_rules(s.portals_dir, portal),
        hints=queries_settings.hints(s.portals_dir, portal),
        identity=identity,
        store=db.store_info(c.data_dir, c.env),
        reviewer=bool(s.reviewer),
        start_hint=chat_client.start_hint(c.env),
    )
    return queries_app_settings.settings_page(read)


async def _send(request: Request, method: str, path: str, body: Any, done: str) -> JSONResponse:
    web = web_of(request)
    c = web.ctx(request, None)
    status, answer = await chat_write(web, c.env, method, path, body)
    if status in (200, 201):
        return write_answer(200, done)
    message = answer.get("message") or f"the chat service answered {status}"
    return write_answer(502 if status in (0, 500, 502, 503) else 409, f"Not done: {message}.")


@router.post("/environments", response_model=WriteResult)
async def save_environment(request: Request, portal: str) -> JSONResponse:
    """Add an environment, or change its address and how far the crawler may go there."""
    if (no := write_refused(request, "change settings")) is not None:
        return no
    form = await read_json(request)
    name = str(form.get("environment") or "")
    url = str(form.get("base_url") or "").strip()
    limit = str(form.get("limit") or queries_app_settings.DEFAULT_LIMIT)
    known = dict(queries_app_settings.ACTION_LIMITS)
    if name not in queries_app_settings.PORTAL_ENVS or not url or limit not in known:
        return write_answer(422, "Pick an environment, give its address and a limit.")
    path = f"/portals/{quote(portal, safe='')}/environments/{quote(name, safe='')}"
    body = {"base_url": url, "max_action_class": limit}
    return await _send(request, "PUT", path, body, f"{name} saved.")


@router.post("/environments/{environment}/revoke", response_model=WriteResult)
async def revoke_environment(request: Request, portal: str, environment: str) -> JSONResponse:
    """Revoke an environment; the chat service keeps the last one. Recorded scans are kept."""
    if (no := write_refused(request, "change settings")) is not None:
        return no
    path = f"/portals/{quote(portal, safe='')}/environments/{quote(environment, safe='')}"
    return await _send(request, "DELETE", path, None, f"{environment} revoked.")


@router.post("/hints/{part}", response_model=WriteResult)
async def save_hints(request: Request, portal: str, part: str) -> JSONResponse:
    """The hints (release marker, A/B cookies, business refusals; lists one per line) or the
    budgets, written to the portal file by the chat service."""
    if (no := write_refused(request, "change settings")) is not None:
        return no
    form = await read_json(request)
    fields = {k: [str(v)] for k, v in form.items() if isinstance(v, str | int)}
    body = hints_body(fields, part) if part in ("hints", "budgets") else None
    word = "Budgets" if part == "budgets" else "Hints"
    if body is None:
        return write_answer(422, f"{word} not saved: each budget is a whole number, 0 or more.")
    path = f"/portals/{quote(portal, safe='')}/hints"
    return await _send(request, "PUT", path, body, f"{word} saved.")


@router.post("/personas", response_model=WriteResult)
async def add_persona(request: Request, portal: str) -> JSONResponse:
    """Add a persona (spec 072, designer 19/04: the `persona.add` args); the chat service checks
    the name, the credential (a vault name, never a value) and the test data, and writes it."""
    if (no := write_refused(request, "add a persona")) is not None:
        return no
    args = await read_json(request)
    name = str(args.get("name") or "")
    path = f"/portals/{quote(portal, safe='')}/personas"
    return await _send(request, "POST", path, args, f"Persona {name} added to {portal}.")


@router.post("/personas/{name}/remove", response_model=WriteResult)
async def remove_persona(request: Request, portal: str, name: str) -> JSONResponse:
    """Remove a persona no scan used yet (a used one stays: its scans cite it)."""
    if (no := write_refused(request, "remove a persona")) is not None:
        return no
    path = f"/portals/{quote(portal, safe='')}/personas/{quote(name, safe='')}"
    return await _send(request, "DELETE", path, None, f"Persona {name} removed.")


@router.post("/model/accept", response_model=WriteResult)
async def accept_model(request: Request, portal: str) -> JSONResponse:
    """Put the calibrated τ or the trained classifier in force (owner answers 5 and 14)."""
    if (no := write_refused(request, "accept τ or the classifier")) is not None:
        return no
    what = str((await read_json(request)).get("what") or "")
    if what not in ACCEPTED:
        return write_answer(422, "Accept τ or the classifier.")
    body = {"what": what, "by": web_of(request).settings.reviewer}
    path = f"/portals/{quote(portal, safe='')}/model/accept"
    done = f"{ACCEPTED[what]} is in force from the next rebuild."
    return await _send(request, "POST", path, body, done)
