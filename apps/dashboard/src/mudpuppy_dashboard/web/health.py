"""`/healthz`: whether the store exists, and which code is running."""

from __future__ import annotations

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from .. import db
from ..version import STARTUP_FINGERPRINT
from .deps import web_of

router = APIRouter()


@router.get("/healthz")
def healthz(request: Request, env: str | None = None) -> JSONResponse:
    web = web_of(request)
    c = web.ctx(request, env)
    info = db.store_info(c.data_dir, c.env)
    return JSONResponse(
        {"ok": info.exists, "store": info.model_dump(), "code": STARTUP_FINGERPRINT},
        status_code=200 if info.exists else 503,
        headers={"Cache-Control": "no-store"},
    )
