"""The console's addresses before R-100 (spec 071): every one answers a permanent redirect to its
page in the React console, so documentation evidence, exports, the assistant's links and old
bookmarks keep working. The portal comes from `?portal=`, else the old header choice (cookie)."""

from __future__ import annotations

from urllib.parse import quote, urlencode

from fastapi import APIRouter, Request
from fastapi.responses import RedirectResponse

router = APIRouter(include_in_schema=False)

PORTAL_COOKIE = "pf_portal"

#: Old address (a FastAPI path) → its React page; `{portal}` is filled from the request, and the
#: query parameters named after `?` are carried over. A page that needs a portal falls back to
#: the Portals page without one.
ROUTES: tuple[tuple[str, str], ...] = (
    ("/", "/app/portals/{portal}"),
    ("/scans", "/app/portals/{portal}/scans"),
    ("/scans/plan", "/app/portals/{portal}/scans/plan"),
    ("/scans/by-process", "/app/portals/{portal}/scans/by-process"),
    ("/scans/recover/{scan}", "/app/scans/{scan}/recover"),
    ("/activity", "/app/portals/{portal}/scans/activity"),
    ("/runs/{scan}", "/app/scans/{scan}"),
    ("/states/{state}", "/app/states/{state}?hl"),
    ("/screens", "/app/portals/{portal}/screens"),
    ("/screens/{key}", "/app/portals/{portal}/screens/{key}"),
    ("/map", "/app/portals/{portal}/screens/map?view&open"),
    ("/access", "/app/portals/{portal}/screens/access"),
    ("/processes", "/app/portals/{portal}/processes"),
    ("/processes/{key}", "/app/portals/{portal}/processes/{key}?model"),
    ("/processes/{key}/compare", "/app/portals/{portal}/processes/{key}/compare?left&right"),
    ("/processes/{key}/history", "/app/portals/{portal}/processes/{key}/history"),
    ("/processes/{key}/export", "/app/portals/{portal}/processes/{key}/documentation?tab"),
    ("/docs", "/app/portals/{portal}/docs"),
    ("/docs/{p}", "/app/portals/{p}/docs"),
    ("/docs/{p}/sessions/{session}", "/app/portals/{p}/docs/sessions/{session}"),
    ("/docs/{p}/{key}", "/app/portals/{p}/docs/{key}"),
    ("/docs/{p}/{key}/export", "/app/portals/{p}/processes/{key}/documentation?tab"),
    ("/review", "/app/portals/{portal}/review?show&select"),
    ("/amendments/superseded", "/app/portals/{portal}/review?show=reanchor"),
    ("/changes", "/app/portals/{portal}/changes"),
    ("/changes/{change}", "/app/portals/{portal}/changes/{change}"),
    ("/rules", "/app/portals/{portal}/rules"),
    ("/rules/{key}", "/app/portals/{portal}/rules/{key}"),
    ("/same-screen", "/app/portals/{portal}/same-screen?a&b&screen"),
    ("/search", "/app/search?q&portal"),
    ("/glossary", "/app/glossary?q"),
    ("/glossary/pages/{slug}", "/app/glossary/pages/{slug}"),
    ("/glossary/wiki", "/app/glossary/wiki"),
    ("/glossary/wiki/{slug}", "/app/glossary/wiki/{slug}"),
    ("/chat", "/app/portals/{portal}?assistant=open"),
    ("/chat/errors/{ref}", "/app/errors/{ref}"),
    ("/portals/new", "/app/portals/new"),
    ("/portals/{p}/settings", "/app/portals/{p}/settings"),
    ("/workbench", "/app/portals/{portal}/workbench?c"),
)


def target(template: str, request: Request) -> str:
    """The React address for one old request; Portals when it needs a portal and has none."""
    path, _, carried = template.partition("?")
    params = dict(request.path_params)
    if "{portal}" in path:
        portal = request.query_params.get("portal") or request.cookies.get(PORTAL_COOKIE)
        if not portal:
            return "/app/"
        params["portal"] = portal
    for name, value in params.items():
        path = path.replace("{" + name + "}", quote(str(value), safe=""))
    fixed = dict(p.split("=", 1) for p in carried.split("&") if "=" in p)
    kept = {
        k: v
        for k in carried.split("&")
        if k and "=" not in k and (v := request.query_params.get(k))
    }
    query = urlencode({**kept, **fixed})
    return f"{path}?{query}" if query else path


def _route(template: str):
    def redirect(request: Request) -> RedirectResponse:
        return RedirectResponse(target(template, request), status_code=301)

    return redirect


for old, new in ROUTES:
    router.add_api_route(old, _route(new), methods=["GET"])
