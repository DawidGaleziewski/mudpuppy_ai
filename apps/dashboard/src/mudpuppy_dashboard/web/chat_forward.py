"""Forwarding to the local chat service (spec 010), shared by the chat and amendment routers.
The browser never reaches the service; these helpers answer for it, or say it is not running."""

from __future__ import annotations

from typing import Any

from fastapi import Request
from fastapi.responses import JSONResponse

from .. import chat_client, db
from .deps import Web


def chat_json(status: int, body: object) -> JSONResponse:
    return JSONResponse(body, status_code=status, headers={"Cache-Control": "no-store"})


def chat_down(web: Web) -> JSONResponse:
    """503 with the start command for the environment the dashboard opens by default."""
    env = db.resolve_env(web.settings.data_dir, None, web.settings.default_env)
    return chat_json(503, {"ref": None, "message": chat_client.not_running(env)})


def chat_refused() -> JSONResponse:
    return chat_json(403, {"ref": None, "message": "Cross-origin request refused."})


def invalid(message: str) -> JSONResponse:
    return chat_json(422, {"ref": None, "message": message})


async def read_json(request: Request) -> dict[str, Any]:
    try:
        payload = await request.json()
    except ValueError:
        return {}
    return payload if isinstance(payload, dict) else {}


async def forward(web: Web, method: str, path: str, payload: object | None = None) -> JSONResponse:
    """One call to the chat service; its answer (or a plain "not running") goes back as is."""
    try:
        status, body = await chat_client.call(
            web.settings, method, path, payload, web.chat_transport
        )
    except chat_client.ChatUnavailable:
        return chat_down(web)
    return chat_json(status, body)
