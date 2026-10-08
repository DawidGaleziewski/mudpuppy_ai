"""Portals: the "+ new portal" form (spec 011 T005, FR-004, FR-005) and a portal's settings, to add,
change and revoke environments (FR-012). The chat service writes the files; these routes forward."""

from __future__ import annotations

from typing import Any
from urllib.parse import parse_qs, quote

from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse, PlainTextResponse, RedirectResponse, Response

from .. import chat_client
from .deps import PORTAL_COOKIE, Ctx, Web, same_origin, web_of

router = APIRouter()

# A portal's environments, in the order pages show them (spec 011 FR-008).
PORTAL_ENVS = ("production", "staging", "sandbox")
# The "+ new portal" form's fields and defaults (spec 011 FR-004, FR-011; user decisions
# 2026-10-06): an address and a limit per environment, robots ignored, forms may be submitted.
NEW_PORTAL_DEFAULTS = {
    "id": "",
    "robots": "ignore",
    **{f"url_{e}": "" for e in PORTAL_ENVS},
    **{f"limit_{e}": "external-side-effect" for e in PORTAL_ENVS},
}
# How far the crawler may go, as the forms say it.
ACTION_LIMITS = (
    ("external-side-effect", "fill and submit forms (everything)"),
    ("destructive", "up to deleting things, no outside effects"),
    ("mutating", "change data, never delete"),
    ("read", "only look, never submit"),
)


def form_fields(body: bytes, defaults: dict[str, str]) -> dict[str, str]:
    """A url-encoded form post as {field: value}, with the defaults for missing fields."""
    fields = parse_qs(body.decode("utf-8", "replace"))
    return {k: (fields.get(k) or [v])[0].strip() for k, v in defaults.items()}


@router.get("/portals/new", response_class=HTMLResponse)
async def portal_new(request: Request, env: str | None = None) -> HTMLResponse:
    web = web_of(request)
    c = web.ctx(request, env)
    up = await chat_client.service_up(web.settings, web.chat_transport)
    return web.render(c, "portal_new.html", service_up=up, form=NEW_PORTAL_DEFAULTS, error=None)


@router.post("/portals/new", response_class=HTMLResponse, response_model=None)
async def portal_create(request: Request, env: str | None = None) -> Response:
    """A plain form post (works without JavaScript). The chat service writes the files; on
    success the portal is chosen in the header and a chat conversation opens for it."""
    if not same_origin(request):
        return PlainTextResponse("Cross-origin request refused.", status_code=403)
    web = web_of(request)
    c = web.ctx(request, env)
    form = form_fields(await request.body(), NEW_PORTAL_DEFAULTS)
    payload: dict[str, Any] = {
        "robots": form["robots"],
        "environments": {
            e: {"base_url": form[f"url_{e}"], "max_action_class": form[f"limit_{e}"]}
            for e in PORTAL_ENVS
            if form[f"url_{e}"]
        },
    }
    if form["id"]:
        payload["id"] = form["id"]

    def again(message: str, status: int) -> HTMLResponse:
        return web.render(c, "portal_new.html", status, service_up=True, form=form, error=message)

    try:
        status, body = await chat_client.call(
            web.settings, "POST", "/portals", payload, web.chat_transport
        )
    except chat_client.ChatUnavailable:
        return web.render(c, "portal_new.html", 503, service_up=False, form=form, error=None)
    if status != 201 or not isinstance(body, dict):
        message = body.get("message") if isinstance(body, dict) else None
        return again(str(message or "The portal could not be saved."), 400)
    portal = str(body["portal"])
    target = c.url("/chat", portal=portal)  # the middleware keeps the choice in the cookie
    try:
        status, made = await chat_client.call(
            web.settings,
            "POST",
            "/conversations",
            {"portal": portal, "fresh": True},
            web.chat_transport,
        )
        if status < 300 and isinstance(made, dict) and isinstance(made.get("id"), str):
            target = c.url("/chat", portal=portal, conversation=made["id"])
    except chat_client.ChatUnavailable:
        pass
    response = RedirectResponse(target, status_code=303)
    response.set_cookie(PORTAL_COOKIE, portal, samesite="lax", httponly=True)
    return response


# ---- portal settings: add, change and revoke environments (spec 011 FR-012) -------------


async def settings_page(
    web: Web, c: Ctx, portal: str, status: int = 200, error: str | None = None, form: Any = None
) -> HTMLResponse:
    """The portal's environments as the chat service reads them from its file."""
    environments: list[dict[str, Any]] = []
    up = True
    try:
        code, body = await chat_client.call(
            web.settings, "GET", f"/portals/{quote(portal, safe='')}", None, web.chat_transport
        )
    except chat_client.ChatUnavailable:
        up = False
    else:
        if code == 200 and isinstance(body, dict):
            environments = list(body.get("environments") or [])
        else:
            status = 404 if code == 404 else status
            if error is None:
                error = str(body.get("message") if isinstance(body, dict) else "unreadable")
    missing = [e for e in PORTAL_ENVS if e not in {x["environment"] for x in environments}]
    return web.render(
        c,
        "portal_settings.html",
        status,
        portal=portal,
        environments=environments,
        limits=ACTION_LIMITS,
        missing=missing,
        form=form
        or {
            "environment": missing[0] if missing else "production",
            "base_url": "",
            "limit": "external-side-effect",
        },
        error=error,
        saved=c.request.query_params.get("saved"),
        service_up=up,
    )


@router.get("/portals/{portal}/settings", response_class=HTMLResponse)
async def portal_settings(request: Request, portal: str, env: str | None = None) -> HTMLResponse:
    web = web_of(request)
    return await settings_page(web, web.ctx(request, env), portal)


@router.post("/portals/{portal}/environments", response_class=HTMLResponse, response_model=None)
async def portal_env_set(request: Request, portal: str, env: str | None = None) -> Response:
    """Add an environment, or change its address and limit (a plain form post)."""
    if not same_origin(request):
        return PlainTextResponse("Cross-origin request refused.", status_code=403)
    web = web_of(request)
    c = web.ctx(request, env)
    form = form_fields(
        await request.body(),
        {"environment": "", "base_url": "", "limit": "external-side-effect"},
    )
    path = f"/portals/{quote(portal, safe='')}/environments/{quote(form['environment'], safe='')}"
    try:
        code, body = await chat_client.call(
            web.settings,
            "PUT",
            path,
            {"base_url": form["base_url"], "max_action_class": form["limit"]},
            web.chat_transport,
        )
    except chat_client.ChatUnavailable:
        return await settings_page(web, c, portal, 503, form=form)
    if code != 200:
        message = body.get("message") if isinstance(body, dict) else None
        return await settings_page(web, c, portal, 400, str(message or "Not saved."), form)
    target = c.url(f"/portals/{quote(portal, safe='')}/settings", saved=form["environment"])
    return RedirectResponse(target, status_code=303)


@router.post(
    "/portals/{portal}/environments/{environment}/revoke",
    response_class=HTMLResponse,
    response_model=None,
)
async def portal_env_revoke(
    request: Request, portal: str, environment: str, env: str | None = None
) -> Response:
    """Revoke an environment; the chat service keeps the last one."""
    if not same_origin(request):
        return PlainTextResponse("Cross-origin request refused.", status_code=403)
    web = web_of(request)
    c = web.ctx(request, env)
    path = f"/portals/{quote(portal, safe='')}/environments/{quote(environment, safe='')}"
    try:
        code, body = await chat_client.call(web.settings, "DELETE", path, None, web.chat_transport)
    except chat_client.ChatUnavailable:
        return await settings_page(web, c, portal, 503)
    if code != 200:
        message = body.get("message") if isinstance(body, dict) else None
        return await settings_page(web, c, portal, 409, str(message or "Not revoked."))
    target = c.url(f"/portals/{quote(portal, safe='')}/settings")
    return RedirectResponse(target, status_code=303)
