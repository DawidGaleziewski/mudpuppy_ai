"""The React console's "+ new portal" (R-100, spec 071; spec 011 T005, FR-004, FR-005, FR-011):
a site to work on, with an address and a limit per environment. The chat service writes
`portals/<id>/portal.yaml` and a guest persona; this forwards. No SQL here (G-15)."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from .. import chat_client, queries_app_settings
from .chat_forward import read_json
from .chat_writes import WriteResult, assistant_href, chat_write, write_answer
from .deps import same_origin, web_of

router = APIRouter(prefix="/api/portals")


class Option(BaseModel):
    value: str
    label: str


class NewPortalForm(BaseModel):
    #: The assistant service saves the portal; while it is down nothing can be saved.
    service_up: bool
    start_hint: str
    environments: list[str]
    limits: list[Option]


@router.get("/new")
async def new_portal_form(request: Request, env: str | None = None) -> NewPortalForm:
    web = web_of(request)
    c = web.ctx(request, env)
    return NewPortalForm(
        service_up=await chat_client.service_up(web.settings, web.chat_transport),
        start_hint=chat_client.start_hint(c.env),
        environments=list(queries_app_settings.PORTAL_ENVS),
        limits=[Option(value=v, label=t) for v, t in queries_app_settings.ACTION_LIMITS],
    )


@router.post("", response_model=WriteResult)
async def create(request: Request, env: str | None = None) -> JSONResponse:
    """`id` (optional), `robots` (ignore or respect), `environments` {name: {base_url, limit}};
    on success the portal's Home opens with the assistant."""
    if not same_origin(request):
        return write_answer(403, "Cross-origin request refused.")
    web = web_of(request)
    c = web.ctx(request, env)
    form = await read_json(request)
    given = form.get("environments") if isinstance(form.get("environments"), dict) else {}
    environments = {
        e: {
            "base_url": str(v.get("base_url", "")).strip(),
            "max_action_class": str(v.get("limit", "")),
        }
        for e, v in given.items()
        if e in queries_app_settings.PORTAL_ENVS
        and isinstance(v, dict)
        and str(v.get("base_url", "")).strip()
    }
    if not environments:
        return write_answer(422, "Give the address of at least one environment.")
    payload: dict[str, Any] = {
        "robots": str(form.get("robots") or "ignore"),
        "environments": environments,
    }
    if portal_id := str(form.get("id") or "").strip():
        payload["id"] = portal_id
    status, body = await chat_write(web, c.env, "POST", "/portals", payload)
    if status != 201 or not isinstance(body.get("portal"), str):
        return write_answer(
            400 if status else 503, str(body.get("message") or "The portal could not be saved.")
        )
    portal = body["portal"]
    # a fresh conversation for it (a failure here leaves the portal saved)
    await chat_write(web, c.env, "POST", "/conversations", {"portal": portal, "fresh": True})
    return write_answer(
        200, f"Saved {portal}. Ask the assistant to scan it.", assistant_href(portal)
    )
