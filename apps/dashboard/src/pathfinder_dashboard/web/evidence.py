"""Screenshots and wireframes by content address."""

from __future__ import annotations

import re
from pathlib import Path

from fastapi import APIRouter, Request
from fastapi.responses import Response
from starlette.exceptions import HTTPException

from .. import stores, visuals
from .deps import web_of

router = APIRouter()


def _find(data_dir: Path, eval_root: Path | None, ref: str) -> Path | None:
    """The file in the main store's evidence, else in an eval workspace's (spec 019 US5). Files are
    named by their content hash, so the same name anywhere is the same image."""
    for d in [data_dir, *(s.data_dir for s in stores.eval_stores(eval_root))]:
        path = visuals.evidence_path(d, ref)
        if path is not None and path.is_file():
            return path
    return None


@router.get("/evidence/{ref}")
def evidence_file(request: Request, ref: str, download: str | None = None) -> Response:
    """Screenshots and wireframes only, by content address (contracts/dashboard-routes.md)."""
    settings = web_of(request).settings
    match = visuals.EVIDENCE_IMAGE.match(ref)
    path = _find(settings.data_dir, settings.eval_root, ref) if match else None
    if match is None or path is None:
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
