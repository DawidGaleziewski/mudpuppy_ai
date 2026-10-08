"""Screenshots and wireframes by content address."""

from __future__ import annotations

import re

from fastapi import APIRouter, Request
from fastapi.responses import Response
from starlette.exceptions import HTTPException

from .. import visuals
from .deps import web_of

router = APIRouter()


@router.get("/evidence/{ref}")
def evidence_file(request: Request, ref: str, download: str | None = None) -> Response:
    """Screenshots and wireframes only, by content address (contracts/dashboard-routes.md)."""
    settings = web_of(request).settings
    match = visuals.EVIDENCE_IMAGE.match(ref)
    path = visuals.evidence_path(settings.data_dir, ref) if match else None
    if match is None or path is None or not path.is_file():
        raise HTTPException(404)
    ext = match.group(1)
    headers = {"Cache-Control": "public, max-age=31536000, immutable"}
    media = {"png": "image/png", "svg": "image/svg+xml", "excalidraw": "application/json"}[ext]
    if ext == "svg":
        headers["Content-Security-Policy"] = "default-src 'none'; style-src 'unsafe-inline'"
    if download:
        name = re.sub(r"[^A-Za-z0-9._-]+", "-", download).strip("-")[:80] or "file"
        headers["Content-Disposition"] = f'attachment; filename="{name}.{ext}"'
    return Response(path.read_bytes(), media_type=media, headers=headers)
