"""The React console (R-96, spec 050), served at `/app/` from `apps/web/dist` once built.

Files of the build are served as they are; any other path under `/app/` gets `index.html`, so the
React router handles deep links (`/app/portals/x/scans`). Without a build, `/app/` says how to make
one. In development Vite serves the app itself (`pnpm --dir apps/web dev`) and proxies `/api` here.
"""

from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, Request
from fastapi.responses import FileResponse, HTMLResponse, Response

from .deps import web_of

router = APIRouter()

NO_BUILD = (
    "<!doctype html><title>MudPuppy</title><p>The React console is not built yet: run "
    "<code>pnpm --dir apps/web build</code>, or <code>pnpm --dir apps/web dev</code> "
    "for development.</p>"
)


IMMUTABLE = "public, max-age=31536000, immutable"
# The designer's policy (17-genui-architecture.md § 6; R-94 (6), spec 043 F-08): code, fonts,
# pictures and connections (the API, the chat relay, the live Workbench's WebSocket) from this
# origin only. Styles allow inline: the design system sets custom properties in `style`, and
# Mermaid writes a `<style>` into each diagram; they never carry model strings. The page is a
# static build, so there is no per-response nonce.
CSP = (
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; "
    "img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; "
    "frame-ancestors 'none'; form-action 'self'"
)


def _inside(root: Path, rel: str) -> Path | None:
    """The file `rel` under `root`, refusing anything that leaves it."""
    target = (root / rel).resolve()
    return target if target.is_file() and target.is_relative_to(root.resolve()) else None


@router.get("/app/{rest:path}", include_in_schema=False)
def app_file(request: Request, rest: str = "") -> Response:
    dist = web_of(request).settings.web_dist
    if not (dist / "index.html").is_file():
        return HTMLResponse(NO_BUILD, 404)
    file = _inside(dist, rest) if rest else None
    if file is None:
        # The page shell names the build's assets, so it is asked for again every time.
        return FileResponse(
            dist / "index.html",
            headers={"Cache-Control": "no-cache", "Content-Security-Policy": CSP},
        )
    # A build's assets carry their content hash in the name: cached for good (R-100).
    cache = IMMUTABLE if rest.startswith("assets/") else "no-cache"
    return FileResponse(file, headers={"Cache-Control": cache})
