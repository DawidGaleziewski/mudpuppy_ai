"""FastAPI app: builds the app and mounts one router per page (`web/`; guideline G-13).

Pages and fragments are GET and read-only; the few POST/DELETE routes only forward a form to the
chat service (spec 010), which is the only writer of chat tables. A page renders the same
partials its fragments return, so a live region re-fetching itself and a full page load produce
identical markup.
"""

from __future__ import annotations

import itertools
import json
from pathlib import Path
from typing import Any

import httpx2
from fastapi import FastAPI, Request
from fastapi.responses import RedirectResponse, Response
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from . import glossary, live, nav, queries_docs, queries_map_node, status_map
from .models import DECISION_KINDS, FRONTIER_STATUSES, RUN_STATUSES, SAFETY_CLASSES
from .settings import Settings
from .web import access as access_page
from .web import activity as activity_page
from .web import amendments as amendments_page
from .web import chat as chat_page
from .web import docs as docs_page
from .web import events as events_page
from .web import evidence as evidence_page
from .web import glossary as glossary_page
from .web import health as health_page
from .web import map as map_page
from .web import overview as overview_page
from .web import plan as plan_page
from .web import portals as portals_page
from .web import process_export as process_export_page
from .web import processes as processes_page
from .web import review as review_page
from .web import run_groups as run_groups_page
from .web import runs as runs_page
from .web import scans as scans_page
from .web import screens as screens_page
from .web import states as states_page
from .web.amendments import MAX_ATTACHMENT_B64
from .web.deps import PORTAL_COOKIE, PORTAL_ID, Web, build_url
from .web.runs import SECTIONS

__all__ = ["MAX_ATTACHMENT_B64", "create_app"]

PACKAGE = Path(__file__).parent
# "+ new portal" in the header's portal dropdown (spec 011).
NEW_PORTAL = "__new__"


def create_app(
    settings: Settings | None = None,
    chat_transport: httpx2.AsyncBaseTransport | None = None,
) -> FastAPI:
    """`chat_transport` replaces the network to the chat service (tests mock it)."""
    settings = settings or Settings()
    app = FastAPI(title="pathfinder://console", docs_url=None, redoc_url=None, openapi_url=None)
    app.state.settings = settings
    templates = Jinja2Templates(directory=PACKAGE / "templates")
    templates.env.globals.update(
        RUN_STATUSES=RUN_STATUSES,
        FRONTIER_STATUSES=FRONTIER_STATUSES,
        DECISION_KINDS=DECISION_KINDS,
        SAFETY_CLASSES=SAFETY_CLASSES,
        SECTIONS=SECTIONS,
        DOC_STATUSES=queries_docs.DOC_STATUSES,
        DOC_CONFIDENCES=queries_docs.CONFIDENCES,
        DOC_FLAGS=queries_docs.FLAGS,
        EVIDENCE_TABS=queries_docs.EVIDENCE_TABS,
        BOOT_ID=live.BOOT_ID,
    )
    templates.env.filters["duration"] = fmt_duration
    templates.env.filters["when"] = fmt_when
    templates.env.filters["pretty_json"] = pretty_json
    templates.env.filters["kb"] = lambda n: f"{n / 1024:,.0f} KB"
    templates.env.filters["jget"] = jget
    templates.env.filters["short_id"] = short_id
    templates.env.filters["top_locator"] = top_locator
    templates.env.filters["markdown"] = glossary.markdown_html
    # Salvage Yard (spec 022): the one status mapping, used by `salvage/macros.html`.
    templates.env.globals["sy_status_of"] = status_map.status_of
    templates.env.globals["sy_options"] = status_map.options
    templates.env.globals["NAV_SECTIONS"] = nav.SECTIONS
    templates.env.globals["SCREEN_MARKS"] = queries_map_node.SCREEN_MARKS
    templates.env.globals["nav_section"] = nav.current_section
    templates.env.globals["section_href"] = nav.href_of

    # Shared page helpers (web/deps.py); the page routers get them with `web_of(request)`.
    web = Web(settings, templates, chat_transport)
    app.state.web = web

    # Templates call GLOSSARY() so the macros see a reload; None means "no tooltips" (FR-011).
    templates.env.globals["GLOSSARY"] = web.glossary_or_none
    # Tooltip ids must be unique on a page even when a term repeats; a process-wide counter is.
    templates.env.globals["GL_UID"] = itertools.count(1).__next__

    class StaticWithCache(StaticFiles):
        async def get_response(self, path: str, scope: Any) -> Response:
            response = await super().get_response(path, scope)
            response.headers["Cache-Control"] = "public, max-age=3600"
            return response

    app.mount("/static", StaticWithCache(directory=PACKAGE / "static"), name="static")

    @app.middleware("http")
    async def remember_portal(request: Request, call_next: Any) -> Response:
        """The header's portal dropdown (spec 011 FR-002): `?portal=` is kept in a cookie;
        "+ new portal" opens the form."""
        chosen = request.query_params.get("portal")
        if chosen == NEW_PORTAL:
            return RedirectResponse(build_url("/portals/new", env=request.query_params.get("env")))
        response: Response = await call_next(request)
        if chosen is not None and request.method == "GET":
            if chosen and PORTAL_ID.match(chosen):
                response.set_cookie(PORTAL_COOKIE, chosen, samesite="lax", httponly=True)
            elif not chosen:
                response.delete_cookie(PORTAL_COOKIE)
        return response

    # Order matters where paths overlap, inside a router and between them.
    app.include_router(overview_page.router)
    app.include_router(runs_page.router)
    app.include_router(states_page.router)
    app.include_router(evidence_page.router)
    app.include_router(health_page.router)
    app.include_router(activity_page.router)
    app.include_router(docs_page.router)
    app.include_router(glossary_page.router)
    app.include_router(chat_page.router)
    app.include_router(portals_page.router)
    app.include_router(amendments_page.router)
    app.include_router(events_page.router)
    app.include_router(screens_page.router)
    app.include_router(access_page.router)
    app.include_router(review_page.router)
    app.include_router(scans_page.router)
    app.include_router(run_groups_page.router)
    app.include_router(plan_page.router)
    app.include_router(process_export_page.router)
    app.include_router(map_page.router)
    # Last: its /chat/portals/{portal}/{rest} forwarder must not shadow the routes above.
    app.include_router(processes_page.router)
    return app


# ---- formatting filters --------------------------------------------------------------------


def fmt_duration(ms: int | None) -> str:
    if ms is None:
        return "—"
    seconds = ms // 1000
    if seconds < 60:
        return f"{seconds}s" if seconds else f"{ms}ms"
    minutes, seconds = divmod(seconds, 60)
    if minutes < 60:
        return f"{minutes}m {seconds:02d}s"
    hours, minutes = divmod(minutes, 60)
    return f"{hours}h {minutes:02d}m"


def fmt_when(iso: str | None) -> str:
    """`2026-09-25T19:44:01.776Z` → `2026-09-25 19:44:01Z` (UTC, as stored)."""
    if not iso:
        return "—"
    return iso.replace("T", " ")[:19] + "Z"


def short_id(value: str, keep: int = 13) -> str:
    """`01a0da64-3bf1-7000-…` → `01a0da64-3bf1…`: enough to tell UUIDv7 runs apart at a glance."""
    return value if len(value) <= keep + 1 else value[:keep] + "…"


def jget(value: Any, key: str) -> Any:
    """`value[key]` for a parsed JSON object, None for any other shape."""
    return value.get(key) if isinstance(value, dict) else None


def top_locator(value: Any) -> str | None:
    """The rank-0 locator of an action descriptor (what QA would use first)."""
    locators = jget(value, "locators")
    if isinstance(locators, list) and locators and isinstance(locators[0], dict):
        best = min(locators, key=lambda loc: loc.get("rank", 99) if isinstance(loc, dict) else 99)
        return str(best.get("value")) if isinstance(best, dict) else None
    return None


def pretty_json(value: Any) -> str:

    if isinstance(value, str):
        return value
    return json.dumps(value, indent=2, ensure_ascii=False, sort_keys=True)
