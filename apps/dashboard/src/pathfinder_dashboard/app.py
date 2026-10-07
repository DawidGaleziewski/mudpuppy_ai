"""FastAPI app: pages, htmx fragments and the live event stream (contracts/http-routes.md).

Pages and fragments are GET and read-only; the few POST/DELETE routes only forward a form to the
chat service (spec 010), which is the only writer of chat tables. A page renders the same
partials its fragments return, so a live region re-fetching itself and a full page load produce
identical markup.
"""

from __future__ import annotations

import itertools
import json
import re
import sqlite3
from collections.abc import AsyncIterable, Iterator
from contextlib import contextmanager
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Annotated, Any
from urllib.parse import parse_qs, quote, urlencode, urlsplit

import httpx2
from fastapi import FastAPI, Header, Query, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import (
    HTMLResponse,
    JSONResponse,
    PlainTextResponse,
    RedirectResponse,
    Response,
    StreamingResponse,
)
from fastapi.sse import EventSourceResponse, ServerSentEvent
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from starlette.exceptions import HTTPException

from . import (
    chat_client,
    db,
    diagrams,
    glossary,
    live,
    live_map,
    queries,
    queries_chat,
    queries_docs,
    review,
    visuals,
)
from .models import DECISION_KINDS, FRONTIER_STATUSES, RUN_STATUSES, SAFETY_CLASSES, Run
from .settings import Settings
from .version import STARTUP_FINGERPRINT

PACKAGE = Path(__file__).parent
# Largest attachment the chat service takes is 8 MB of file content; base64 adds a third.
MAX_ATTACHMENT_B64 = (8 * 1024 * 1024 * 4 + 2) // 3
ERR_REF = re.compile(r"^ERR-[A-Za-z0-9-]{1,64}$")
# A running run with no recorded activity for this long is called out in the chat (T047, F-22).
QUIET_WARN_MS = 5 * 60_000
# The header's portal choice (spec 011): kept in a cookie; "" means all portals.
PORTAL_COOKIE = "pf_portal"
PORTAL_ID = re.compile(r"^[a-z0-9][a-z0-9_-]{0,63}$")
NEW_PORTAL = "__new__"
# The "+ new portal" form's fields and defaults (spec 011 FR-004; user decisions 2026-10-06).
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


def chosen_portal(request: Request) -> str | None:
    """`?portal=` wins over the cookie; an empty value is "all portals"."""
    value = request.query_params.get("portal")
    if value is None:
        value = request.cookies.get(PORTAL_COOKIE)
    return value if value and PORTAL_ID.match(value) else None


SECTIONS: tuple[tuple[str, str], ...] = (
    ("states", "States"),
    ("actions", "Actions"),
    ("frontier", "Frontier"),
    ("forms", "Forms"),
    ("network", "Network"),
    ("robots", "Robots"),
    ("decisions", "Decisions"),
    ("trace", "Trace"),
    ("process", "Process"),  # trace runs only (spec 004 R-14)
    ("docs", "Docs"),  # records citing this run (spec 004 FR-033)
)
SECTION_IDS = {s for s, _ in SECTIONS}
SPAN_STATUSES: tuple[str, ...] = ("running", "ok", "refused", "stopped", "error", "unfinished")
SPAN_CHILD_KINDS: tuple[str, ...] = ("phase", "event")


def _clean(params: dict[str, Any]) -> dict[str, Any]:
    return {k: v for k, v in params.items() if v not in (None, "", False) and v != []}


def build_url(path: str, **params: Any) -> str:
    """`doseq=True` so a list value (repeatable filters like `tool`/`status`) becomes one
    `k=v` pair per item instead of one mangled param; scalar strings are unaffected."""
    query = urlencode(_clean(params), doseq=True)
    return f"{path}?{query}" if query else path


@dataclass
class Ctx:
    """Per-request context: which store, and helpers that keep `env` on every link."""

    request: Request
    settings: Settings
    env: str
    envs: list[str]
    extra: dict[str, Any] = field(default_factory=dict)
    # The header's portal choice (spec 011): `?portal=` or the cookie; None = all portals.
    portal: str | None = None

    @property
    def env_param(self) -> str | None:
        """`env` goes into links only when it is not the default one."""
        default = db.resolve_env(self.settings.data_dir, None, self.settings.default_env)
        return None if self.env == default else self.env

    def url(self, path: str, **params: Any) -> str:
        return build_url(path, env=self.env_param, **params)

    @contextmanager
    def conn(self) -> Iterator[sqlite3.Connection]:
        conn = db.connect(self.settings.data_dir, self.env)
        try:
            yield conn
        finally:
            conn.close()


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

    # Glossary (spec 006): loaded once; re-read per request in dev so edits show on reload.
    loaded: list[glossary.Glossary | glossary.GlossaryError] = [
        glossary.load_glossary(settings.docs_dir)
    ]

    def current_glossary() -> glossary.Glossary | glossary.GlossaryError:
        if settings.dev:
            loaded[0] = glossary.load_glossary(settings.docs_dir)
        return loaded[0]

    def glossary_or_none() -> glossary.Glossary | None:
        g = current_glossary()
        return g if isinstance(g, glossary.Glossary) else None

    # Templates call GLOSSARY() so the macros see a reload; None means "no tooltips" (FR-011).
    templates.env.globals["GLOSSARY"] = glossary_or_none
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

    def ctx(request: Request, env: str | None) -> Ctx:
        envs = db.list_environments(settings.data_dir)
        resolved = db.resolve_env(settings.data_dir, env, settings.default_env)
        return Ctx(request, settings, resolved, envs, portal=chosen_portal(request))

    def header_portals(c: Ctx) -> list[str]:
        try:
            with c.conn() as conn:
                return queries_chat.known_portals(conn, settings.portals_dir)
        except db.StoreMissing:
            return queries_chat.known_portals(None, settings.portals_dir)

    def render(
        c: Ctx, template: str, status_code: int = 200, push: str | None = None, **values: Any
    ) -> HTMLResponse:
        response = templates.TemplateResponse(
            c.request,
            template,
            {
                "c": c,
                "env": c.env,
                "envs": c.envs,
                "dev": settings.dev,
                "store": db.store_info(settings.data_dir, c.env),
                # Spec 011: called by the header only, so fragment polls do not pay for it.
                "header_portals": lambda: header_portals(c),
                # [settings] only for a portal with a config file (a scanned-only one has none)
                "portal_configured": lambda p: bool(
                    p
                    and PORTAL_ID.match(p)
                    and (settings.portals_dir / p / "portal.yaml").is_file()
                ),
                **values,
            },
            status_code=status_code,
        )
        response.headers["Cache-Control"] = "no-store"
        if push:
            response.headers["HX-Push-Url"] = push
        return response

    def missing(c: Ctx, err: db.StoreMissing, fragment: bool = False) -> HTMLResponse:
        return render(
            c,
            "partials/states/store_missing.html" if fragment else "store_missing.html",
            path=str(err.path),
        )

    def not_found(c: Ctx, run_id: str, fragment: bool = False) -> HTMLResponse:
        template = "partials/states/not_found.html" if fragment else "not_found.html"
        return render(c, template, status_code=404, run_id=run_id)

    # ---- pages ------------------------------------------------------------------------------

    @app.get("/", response_class=HTMLResponse)
    def overview(
        request: Request,
        env: str | None = None,
        portal: str | None = None,
        status: str | None = None,
        cursor: str | None = None,
        page: int = 1,
    ) -> HTMLResponse:
        c = ctx(request, env)
        portal = portal if portal is not None else c.portal  # spec 011: the header's choice
        try:
            with c.conn() as conn:
                return render(
                    c,
                    "overview.html",
                    summary=summary_values(c, conn, portal),
                    runs=runs_values(c, conn, portal, status, cursor, page),
                )
        except db.StoreMissing as err:
            return missing(c, err)

    @app.get("/runs/{run_id}", response_class=HTMLResponse)
    def run_detail(
        request: Request, run_id: str, env: str | None = None, tab: str = "states"
    ) -> HTMLResponse:
        c = ctx(request, env)
        tab = tab if tab in SECTION_IDS else "states"
        try:
            with c.conn() as conn:
                summary = queries.run_summary(conn, run_id)
                if summary is None:
                    return not_found(c, run_id)
                return render(
                    c,
                    "run_detail.html",
                    s=summary,
                    tab=tab,
                    header=header_values(c, conn, summary, tab),
                    section=section_values(c, conn, summary.run, tab, request.query_params),
                )
        except db.StoreMissing as err:
            return missing(c, err)

    @app.get("/states/{state_id}", response_class=HTMLResponse)
    def state_detail(
        request: Request,
        state_id: str,
        env: str | None = None,
        view: str = "screenshot",
        elements: bool = False,
    ) -> HTMLResponse:
        """A recorded state's screenshot, wireframe and the records citing it (spec 008)."""
        c = ctx(request, env)
        try:
            with c.conn() as conn:
                page = visuals.state_page(conn, settings.data_dir, state_id)
                if page is None:
                    return render(c, "state_not_found.html", status_code=404, state_id=state_id)
                if not page.figure.has_screenshot:
                    view = "wireframe"
                return render(
                    c,
                    "state.html",
                    p=page,
                    am=state_amendments_values(c, conn, page.figure.state),
                    view="wireframe" if view == "wireframe" else "screenshot",
                    show_elements=elements,
                )
        except db.StoreMissing as err:
            return missing(c, err)

    @app.get("/evidence/{ref}")
    def evidence_file(ref: str, download: str | None = None) -> Response:
        """Screenshots and wireframes only, by content address (contracts/dashboard-routes.md)."""
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

    @app.get("/healthz")
    def healthz(request: Request, env: str | None = None) -> JSONResponse:
        c = ctx(request, env)
        info = db.store_info(settings.data_dir, c.env)
        return JSONResponse(
            {"ok": info.exists, "store": info.model_dump(), "code": STARTUP_FINGERPRINT},
            status_code=200 if info.exists else 503,
            headers={"Cache-Control": "no-store"},
        )

    # ---- fragments --------------------------------------------------------------------------

    @app.get("/fragments/summary", response_class=HTMLResponse)
    def fragment_summary(
        request: Request, env: str | None = None, portal: str | None = None
    ) -> HTMLResponse:
        c = ctx(request, env)
        try:
            with c.conn() as conn:
                return render(
                    c, "partials/portal_cards.html", summary=summary_values(c, conn, portal)
                )
        except db.StoreMissing as err:
            return missing(c, err, fragment=True)

    @app.get("/fragments/runs", response_class=HTMLResponse)
    def fragment_runs(
        request: Request,
        env: str | None = None,
        portal: str | None = None,
        status: str | None = None,
        cursor: str | None = None,
        page: int = 1,
        push: bool = False,
    ) -> HTMLResponse:
        c = ctx(request, env)
        try:
            with c.conn() as conn:
                values = runs_values(c, conn, portal, status, cursor, page)
                return render(
                    c,
                    "partials/runs_table.html",
                    runs=values,
                    push=values["page_url"] if push else None,
                )
        except db.StoreMissing as err:
            return missing(c, err, fragment=True)

    @app.get("/fragments/runs/{run_id}/header", response_class=HTMLResponse)
    def fragment_header(
        request: Request, run_id: str, env: str | None = None, tab: str = "states"
    ) -> HTMLResponse:
        c = ctx(request, env)
        tab = tab if tab in SECTION_IDS else "states"
        try:
            with c.conn() as conn:
                summary = queries.run_summary(conn, run_id)
                if summary is None:
                    return not_found(c, run_id, fragment=True)
                return render(
                    c,
                    "partials/run_header.html",
                    s=summary,
                    header=header_values(c, conn, summary, tab),
                )
        except db.StoreMissing as err:
            return missing(c, err, fragment=True)

    @app.get("/fragments/runs/{run_id}/{section}", response_class=HTMLResponse)
    def fragment_section(
        request: Request, run_id: str, section: str, env: str | None = None, push: bool = False
    ) -> HTMLResponse:
        if section not in SECTION_IDS:
            raise HTTPException(404)
        c = ctx(request, env)
        try:
            with c.conn() as conn:
                run = queries.get_run(conn, run_id)
                if run is None:
                    return not_found(c, run_id, fragment=True)
                values = section_values(c, conn, run, section, request.query_params)
                return render(
                    c,
                    f"partials/{section}.html",
                    section=values,
                    push=values["page_url"] if push else None,
                )
        except db.StoreMissing as err:
            return missing(c, err, fragment=True)

    @app.get("/fragments/runs/{run_id}/trace/summary", response_class=HTMLResponse)
    def fragment_trace_summary(
        request: Request, run_id: str, env: str | None = None
    ) -> HTMLResponse:
        c = ctx(request, env)
        try:
            with c.conn() as conn:
                run = queries.get_run(conn, run_id)
                if run is None:
                    return not_found(c, run_id, fragment=True)
                return render(
                    c, "partials/trace_summary.html", section=trace_summary_section(c, conn, run)
                )
        except db.StoreMissing as err:
            return missing(c, err, fragment=True)

    @app.get("/fragments/spans/{span_id}/children", response_class=HTMLResponse)
    def fragment_span_children(
        request: Request,
        span_id: str,
        env: str | None = None,
        kind: Annotated[list[str], Query()] = [],  # noqa: B006 - FastAPI reads this each request
        name: Annotated[list[str], Query()] = [],  # noqa: B006
    ) -> HTMLResponse:
        c = ctx(request, env)
        try:
            with c.conn() as conn:
                values = span_children_values(conn, span_id, kind, name)
                return render(c, "partials/trace_children.html", **values)
        except db.StoreMissing as err:
            return missing(c, err, fragment=True)

    @app.get("/activity", response_class=HTMLResponse)
    def activity(request: Request, env: str | None = None) -> HTMLResponse:
        c = ctx(request, env)
        try:
            with c.conn() as conn:
                return render(
                    c,
                    "activity.html",
                    nav_current="activity",
                    activity=activity_values(c, conn, request.query_params),
                )
        except db.StoreMissing as err:
            return missing(c, err)

    @app.get("/fragments/activity", response_class=HTMLResponse)
    def fragment_activity(
        request: Request, env: str | None = None, push: bool = False
    ) -> HTMLResponse:
        c = ctx(request, env)
        try:
            with c.conn() as conn:
                values = activity_values(c, conn, request.query_params)
                return render(
                    c,
                    "partials/activity_rows.html",
                    activity=values,
                    push=values["page_url"] if push else None,
                )
        except db.StoreMissing as err:
            return missing(c, err, fragment=True)

    # ---- docs (spec 004, R-15; contracts/http-routes-docs.md) ---------------------------------

    def docs_not_found(c: Ctx, what: str, fragment: bool = False) -> HTMLResponse:
        template = "partials/docs/not_found.html" if fragment else "docs/not_found.html"
        return render(c, template, status_code=404, what=what, nav_current="docs")

    def portal_exists(conn: sqlite3.Connection, portal: str) -> bool:
        return queries_docs.portal_known(conn, portal) or portal in queries.portals(conn)

    @app.get("/docs", response_class=HTMLResponse, response_model=None)
    def docs_portals(request: Request, env: str | None = None) -> Response:
        c = ctx(request, env)
        if c.portal:  # spec 011: a portal chosen in the header opens its documentation
            return RedirectResponse(c.url(f"/docs/{quote(c.portal, safe='')}"), status_code=303)
        try:
            with c.conn() as conn:
                return render(
                    c, "docs/portals.html", nav_current="docs", p=docs_portals_values(c, conn)
                )
        except db.StoreMissing as err:
            return missing(c, err)

    @app.get("/fragments/docs/portals", response_class=HTMLResponse)
    def fragment_docs_portals(request: Request, env: str | None = None) -> HTMLResponse:
        c = ctx(request, env)
        try:
            with c.conn() as conn:
                return render(c, "partials/docs/portals.html", p=docs_portals_values(c, conn))
        except db.StoreMissing as err:
            return missing(c, err, fragment=True)

    @app.get("/docs/{portal}", response_class=HTMLResponse)
    def docs_portal(
        request: Request, portal: str, env: str | None = None, section: str = "overview"
    ) -> HTMLResponse:
        c = ctx(request, env)
        section = section if section in queries_docs.DOC_SECTION_IDS else "overview"
        try:
            with c.conn() as conn:
                if not portal_exists(conn, portal):
                    return docs_not_found(c, f"portal “{portal}”")
                return render(
                    c,
                    "docs/portal.html",
                    nav_current="docs",
                    portal=portal,
                    index=docs_index_values(c, conn, portal, section),
                    section=docs_section_values(c, conn, portal, section, request.query_params),
                )
        except db.StoreMissing as err:
            return missing(c, err)

    @app.get("/fragments/docs/{portal}/index", response_class=HTMLResponse)
    def fragment_docs_index(
        request: Request, portal: str, env: str | None = None, section: str = "overview"
    ) -> HTMLResponse:
        c = ctx(request, env)
        section = section if section in queries_docs.DOC_SECTION_IDS else "overview"
        try:
            with c.conn() as conn:
                if not portal_exists(conn, portal):
                    return docs_not_found(c, f"portal “{portal}”", fragment=True)
                return render(
                    c,
                    "partials/docs/index.html",
                    portal=portal,
                    index=docs_index_values(c, conn, portal, section),
                )
        except db.StoreMissing as err:
            return missing(c, err, fragment=True)

    @app.get("/fragments/docs/{portal}/section/{section}", response_class=HTMLResponse)
    def fragment_docs_section(
        request: Request, portal: str, section: str, env: str | None = None, push: bool = False
    ) -> HTMLResponse:
        if section not in queries_docs.DOC_SECTION_IDS:
            raise HTTPException(404)
        c = ctx(request, env)
        try:
            with c.conn() as conn:
                if not portal_exists(conn, portal):
                    return docs_not_found(c, f"portal “{portal}”", fragment=True)
                values = docs_section_values(c, conn, portal, section, request.query_params)
                return render(
                    c,
                    "partials/docs/section.html",
                    portal=portal,
                    section=values,
                    push=values["page_url"] if push else None,
                )
        except db.StoreMissing as err:
            return missing(c, err, fragment=True)

    @app.get("/docs/{portal}/sessions/{session_id}", response_class=HTMLResponse)
    def docs_session(
        request: Request, portal: str, session_id: str, env: str | None = None
    ) -> HTMLResponse:
        c = ctx(request, env)
        try:
            with c.conn() as conn:
                values = session_values(c, conn, portal, session_id, request.query_params)
                if values is None:
                    return docs_not_found(c, f"session “{session_id}”")
                return render(c, "docs/session.html", nav_current="docs", portal=portal, v=values)
        except db.StoreMissing as err:
            return missing(c, err)

    @app.get("/fragments/docs/{portal}/sessions/{session_id}", response_class=HTMLResponse)
    def fragment_docs_session(
        request: Request, portal: str, session_id: str, env: str | None = None
    ) -> HTMLResponse:
        c = ctx(request, env)
        try:
            with c.conn() as conn:
                values = session_values(c, conn, portal, session_id, request.query_params)
                if values is None:
                    return docs_not_found(c, f"session “{session_id}”", fragment=True)
                return render(c, "partials/docs/session.html", portal=portal, v=values)
        except db.StoreMissing as err:
            return missing(c, err, fragment=True)

    @app.get("/docs/{portal}/{key}", response_class=HTMLResponse)
    def docs_record(
        request: Request, portal: str, key: str, env: str | None = None, rev: str | None = None
    ) -> HTMLResponse:
        c = ctx(request, env)
        try:
            with c.conn() as conn:
                values = record_values(c, conn, portal, key, rev)
                if values is None:
                    return docs_not_found(c, f"record “{key}” in portal “{portal}”")
                return render(c, "docs/record.html", nav_current="docs", portal=portal, r=values)
        except db.StoreMissing as err:
            return missing(c, err)

    @app.get("/fragments/docs/{portal}/{key}/{part}", response_class=HTMLResponse)
    def fragment_docs_record(
        request: Request,
        portal: str,
        key: str,
        part: str,
        env: str | None = None,
        rev: str | None = None,
    ) -> HTMLResponse:
        if part not in ("header", "body", "reviews"):
            raise HTTPException(404)
        c = ctx(request, env)
        try:
            with c.conn() as conn:
                values = record_values(c, conn, portal, key, rev)
                if values is None:
                    return docs_not_found(c, f"record “{key}” in portal “{portal}”", fragment=True)
                return render(
                    c, f"partials/docs/{part}.html", portal=portal, r=values, panel=values["panel"]
                )
        except db.StoreMissing as err:
            return missing(c, err, fragment=True)

    @app.post("/docs/{portal}/{key}/reviews", response_class=HTMLResponse)
    async def docs_review(
        request: Request, portal: str, key: str, env: str | None = None
    ) -> Response:
        """Confirm / reject / comment on a revision (FR-037..039). The only write path of the
        dashboard, and it is a subprocess (`pnpm docs:review`): this process never writes."""
        if not same_origin(request):
            return PlainTextResponse("Cross-origin request refused.", status_code=403)
        c = ctx(request, env)
        raw = parse_qs((await request.body()).decode("utf-8", "replace"), keep_blank_values=True)
        form = {k: v[0] for k, v in raw.items()}
        action = form.get("action", "")
        text = (form.get("text") or "").strip()
        rev_no = int(form["rev_no"]) if form.get("rev_no", "").isdigit() else None
        try:
            with c.conn() as conn:
                if queries_docs.get_record(conn, portal, key) is None:
                    return docs_not_found(c, f"record “{key}” in portal “{portal}”", fragment=True)
            status, result = 200, None
            if not settings.reviewer:
                status, result = (
                    403,
                    refusal(
                        "REVIEW_DISABLED",
                        "Review actions are disabled: PATHFINDER_REVIEWER is not set.",
                    ),
                )
            elif action not in ("confirm", "reject", "comment") or rev_no is None:
                status, result = 422, refusal("SCHEMA_INVALID", "Unknown action or revision.")
            elif action != "confirm" and not text:
                what = "reject" if action == "reject" else "comment"
                status, result = 422, refusal("SCHEMA_INVALID", f"A {what} needs a text: say why.")
            else:
                outcome = await run_in_threadpool(
                    review.submit_review,
                    settings,
                    c.env,
                    portal_id=portal,
                    key=key,
                    rev_no=rev_no,
                    action=action,
                    text=text or None,
                )
                status = outcome.http_status
                if outcome.ok:
                    result = {
                        "ok": True,
                        "code": None,
                        "message": f"Recorded {action} on {key} revision {rev_no}.",
                        "action": action,
                    }
                else:
                    result = refusal(outcome.code or "UNEXPECTED", outcome.message or "failed")
            with c.conn() as conn:
                values = record_values(c, conn, portal, key, None, result=result)
                if values is None:
                    return docs_not_found(c, f"record “{key}” in portal “{portal}”", fragment=True)
                response = render(
                    c,
                    "partials/docs/review_response.html",
                    status_code=status,
                    portal=portal,
                    r=values,
                    panel=values["panel"],
                    oob=True,
                )
                return response
        except db.StoreMissing as err:
            return missing(c, err, fragment=True)

    # ---- glossary (spec 006; contracts/dashboard-ui.md). No store needed. ------------------

    def glossary_not_found(c: Ctx, what: str) -> HTMLResponse:
        return render(c, "glossary_not_found.html", 404, what=what, nav_current="glossary")

    @app.get("/glossary", response_class=HTMLResponse)
    def glossary_index(request: Request, env: str | None = None, q: str = "") -> HTMLResponse:
        c = ctx(request, env)
        g = current_glossary()
        if isinstance(g, glossary.GlossaryError):
            return render(c, "glossary.html", nav_current="glossary", error=g, q=q, groups=[])
        return render(
            c,
            "glossary.html",
            nav_current="glossary",
            g=g,
            q=q.strip(),
            groups=glossary_groups(g, q),
            error=None,
        )

    @app.get("/glossary/pages/{slug}", response_class=HTMLResponse)
    def glossary_page(request: Request, slug: str, env: str | None = None) -> HTMLResponse:
        c = ctx(request, env)
        g = glossary_or_none()
        if g is None or slug not in g.pages:
            return glossary_not_found(c, f"glossary page {slug}")
        return render(
            c,
            "glossary_page.html",
            nav_current="glossary",
            title=g.page_title(slug),
            body=glossary.markdown_html(g.pages[slug], base="pages"),
        )

    @app.get("/glossary/wiki", response_class=HTMLResponse)
    def wiki_index(request: Request, env: str | None = None) -> HTMLResponse:
        c = ctx(request, env)
        g = glossary_or_none()
        if g is None:
            return glossary_not_found(c, "BA wiki (the glossary could not be loaded)")
        pages = sorted(g.wiki.values(), key=lambda p: p.front.title.casefold())
        return render(c, "wiki.html", nav_current="glossary", g=g, pages=pages)

    @app.get("/glossary/wiki/{slug}", response_class=HTMLResponse)
    def wiki_page(request: Request, slug: str, env: str | None = None) -> HTMLResponse:
        c = ctx(request, env)
        g = glossary_or_none()
        if g is None or slug not in g.wiki:
            return glossary_not_found(c, f"wiki page {slug}")
        page = g.wiki[slug]
        return render(
            c,
            "wiki_page.html",
            nav_current="glossary",
            g=g,
            page=page,
            body=glossary.markdown_html(page.body, base="wiki"),
        )

    # ---- chat (spec 010, R-30; contracts/chat-http-api.md) ------------------------------------
    # History and the step tracker come from the read-only store. Sending and streaming go
    # through the local chat service, called from here only: the browser never reaches it.

    def chat_json(status: int, body: object) -> JSONResponse:
        return JSONResponse(body, status_code=status, headers={"Cache-Control": "no-store"})

    def chat_down() -> JSONResponse:
        return chat_json(503, {"ref": None, "message": chat_client.NOT_RUNNING})

    def chat_refused() -> JSONResponse:
        return chat_json(403, {"ref": None, "message": "Cross-origin request refused."})

    def chat_values(
        c: Ctx, conn: sqlite3.Connection, conversation_id: str | None
    ) -> dict[str, Any] | None:
        """Newest active conversation, or the one asked for; None when that id does not exist."""
        conversation = (
            queries_chat.get_conversation(conn, conversation_id)
            if conversation_id
            else queries_chat.newest_active_conversation(conn, c.portal)  # spec 011
        )
        if conversation is None:
            return None if conversation_id else {"conversation": None}
        tracker = queries_chat.tracker(conn, conversation)
        progress = queries_chat.progress(conn, tracker)
        now = datetime.now(UTC)
        return {
            "conversation": conversation,
            "messages": queries_chat.list_messages(conn, conversation.id),
            "tracker": tracker,
            "superseded": queries_chat.superseded_counts(conn).get(tracker.portal_id or "", 0),
            # T047: the run's counters and activity feed, timed on the server (reload-safe)
            "progress": progress,
            "elapsed_ms": progress.elapsed_ms(now) if progress else None,
            "quiet_ms": progress.quiet_ms(now) if progress else None,
            "quiet_warn_ms": QUIET_WARN_MS,
        }

    def tools_values(
        c: Ctx, conn: sqlite3.Connection, conversation: Any, portal: str | None
    ) -> dict[str, Any]:
        """The credentials form and the scope checklist beside the chat (T020, T027)."""
        return {
            "tools": {
                "portal": portal,
                "states": queries_chat.portal_states(conn, portal),
                "personas": queries_chat.list_personas(settings.personas_dir, portal),
                "environments": queries_chat.ENVIRONMENTS,
                "self_url": c.url("/fragments/chat/tools", conversation=conversation.id),
            }
        }

    def state_amendments_values(c: Ctx, conn: sqlite3.Connection, state: Any) -> dict[str, Any]:
        """TO-BE amendments on one state, plus what its form needs (T031)."""
        return {
            "items": queries_chat.amendments_for_state(conn, state.portal_id, state.id),
            "elements": queries_chat.state_elements(settings.data_dir, state),
            "self_url": c.url(f"/fragments/states/{state.id}/amendments"),
        }

    async def read_json(request: Request) -> dict[str, Any]:
        try:
            payload = await request.json()
        except ValueError:
            return {}
        return payload if isinstance(payload, dict) else {}

    async def forward(method: str, path: str, payload: object | None = None) -> JSONResponse:
        """One call to the chat service; its answer (or a plain "not running") goes back as is."""
        try:
            status, body = await chat_client.call(settings, method, path, payload, chat_transport)
        except chat_client.ChatUnavailable:
            return chat_down()
        return chat_json(status, body)

    def invalid(message: str) -> JSONResponse:
        return chat_json(422, {"ref": None, "message": message})

    @app.get("/chat", response_class=HTMLResponse)
    async def chat_page(
        request: Request, env: str | None = None, conversation: str | None = None
    ) -> HTMLResponse:
        c = ctx(request, env)
        up = await chat_client.service_up(settings, chat_transport)
        try:
            with c.conn() as conn:
                values = chat_values(c, conn, conversation)
                if values and values.get("conversation"):
                    values.update(
                        tools_values(c, conn, values["conversation"], values["tracker"].portal_id)
                    )
                    values.update(map_values(c, conn, values))
        except db.StoreMissing as err:
            return missing(c, err)
        return render(
            c,
            "chat.html",
            status_code=200 if values is not None else 404,
            nav_current="chat",
            service_up=up,
            asked=conversation,
            **(values or {"conversation": None}),
        )

    @app.get("/fragments/chat/messages", response_class=HTMLResponse)
    def fragment_chat_messages(
        request: Request, env: str | None = None, conversation: str | None = None
    ) -> HTMLResponse:
        c = ctx(request, env)
        try:
            with c.conn() as conn:
                values = chat_values(c, conn, conversation)
        except db.StoreMissing as err:
            return missing(c, err, fragment=True)
        if values is None:
            return render(c, "partials/chat_missing.html", status_code=404, asked=conversation)
        return render(c, "partials/chat_messages.html", **values)

    @app.get("/fragments/chat/tracker", response_class=HTMLResponse)
    def fragment_chat_tracker(
        request: Request, env: str | None = None, conversation: str | None = None
    ) -> HTMLResponse:
        c = ctx(request, env)
        try:
            with c.conn() as conn:
                values = chat_values(c, conn, conversation)
        except db.StoreMissing as err:
            return missing(c, err, fragment=True)
        if values is None:
            return render(c, "partials/chat_missing.html", status_code=404, asked=conversation)
        return render(c, "partials/chat_tracker.html", **values)

    @app.get("/fragments/chat/progress", response_class=HTMLResponse)
    def fragment_chat_progress(
        request: Request, env: str | None = None, conversation: str | None = None
    ) -> HTMLResponse:
        """T047: counters and activity feed of the conversation's run."""
        c = ctx(request, env)
        try:
            with c.conn() as conn:
                values = chat_values(c, conn, conversation)
        except db.StoreMissing as err:
            return missing(c, err, fragment=True)
        if values is None or not values.get("conversation"):
            return render(c, "partials/chat_missing.html", status_code=404, asked=conversation)
        return render(c, "partials/chat_progress.html", **values)

    def map_values(c: Ctx, conn: sqlite3.Connection, values: dict[str, Any]) -> dict[str, Any]:
        """T049: the live map of the conversation's run; `map_version` also covers the status,
        so the map renders once more when the run ends (and stops polling)."""
        progress = values.get("progress")
        live = live_map.run_map(conn, progress.run_id, datetime.now(UTC)) if progress else None
        version = f"{live.version}-{progress.status}" if live and progress else ""
        return {"live_map": live, "map_version": version}

    @app.get("/fragments/chat/map", response_class=HTMLResponse, response_model=None)
    def fragment_chat_map(
        request: Request,
        env: str | None = None,
        conversation: str | None = None,
        v: str | None = None,
    ) -> HTMLResponse | Response:
        """T049: polled every 3 s while the run runs; 204 (htmx keeps the drawing) if unchanged."""
        c = ctx(request, env)
        try:
            with c.conn() as conn:
                values = chat_values(c, conn, conversation)
                if values and values.get("conversation"):
                    values.update(map_values(c, conn, values))
        except db.StoreMissing as err:
            return missing(c, err, fragment=True)
        if values is None or not values.get("conversation"):
            return render(c, "partials/chat_missing.html", status_code=404, asked=conversation)
        if v and v == values["map_version"]:
            return Response(status_code=204)
        return render(c, "partials/chat_map.html", **values)

    @app.get("/fragments/chat/tools", response_class=HTMLResponse)
    def fragment_chat_tools(
        request: Request, env: str | None = None, conversation: str | None = None
    ) -> HTMLResponse:
        c = ctx(request, env)
        try:
            with c.conn() as conn:
                values = chat_values(c, conn, conversation)
                if values and values.get("conversation"):
                    values.update(
                        tools_values(c, conn, values["conversation"], values["tracker"].portal_id)
                    )
        except db.StoreMissing as err:
            return missing(c, err, fragment=True)
        if values is None or not values.get("conversation"):
            return render(c, "partials/chat_missing.html", status_code=404, asked=conversation)
        return render(c, "partials/chat_tools.html", **values)

    # ---- new portal from the dashboard (spec 011 T005, FR-004, FR-005) ----------------------

    @app.get("/portals/new", response_class=HTMLResponse)
    async def portal_new(request: Request, env: str | None = None) -> HTMLResponse:
        c = ctx(request, env)
        up = await chat_client.service_up(settings, chat_transport)
        return render(c, "portal_new.html", service_up=up, form=NEW_PORTAL_DEFAULTS, error=None)

    @app.post("/portals/new", response_class=HTMLResponse, response_model=None)
    async def portal_create(request: Request, env: str | None = None) -> Response:
        """A plain form post (works without JavaScript). The chat service writes the files; on
        success the portal is chosen in the header and a chat conversation opens for it."""
        if not same_origin(request):
            return PlainTextResponse("Cross-origin request refused.", status_code=403)
        c = ctx(request, env)
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
            return render(c, "portal_new.html", status, service_up=True, form=form, error=message)

        try:
            status, body = await chat_client.call(
                settings, "POST", "/portals", payload, chat_transport
            )
        except chat_client.ChatUnavailable:
            return render(c, "portal_new.html", 503, service_up=False, form=form, error=None)
        if status != 201 or not isinstance(body, dict):
            message = body.get("message") if isinstance(body, dict) else None
            return again(str(message or "The portal could not be saved."), 400)
        portal = str(body["portal"])
        target = c.url("/chat", portal=portal)  # the middleware keeps the choice in the cookie
        try:
            status, made = await chat_client.call(
                settings,
                "POST",
                "/conversations",
                {"portal": portal, "fresh": True},
                chat_transport,
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
        c: Ctx, portal: str, status: int = 200, error: str | None = None, form: Any = None
    ) -> HTMLResponse:
        """The portal's environments as the chat service reads them from its file."""
        environments: list[dict[str, Any]] = []
        up = True
        try:
            code, body = await chat_client.call(
                settings, "GET", f"/portals/{quote(portal, safe='')}", None, chat_transport
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
        return render(
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

    @app.get("/portals/{portal}/settings", response_class=HTMLResponse)
    async def portal_settings(
        request: Request, portal: str, env: str | None = None
    ) -> HTMLResponse:
        return await settings_page(ctx(request, env), portal)

    @app.post("/portals/{portal}/environments", response_class=HTMLResponse, response_model=None)
    async def portal_env_set(request: Request, portal: str, env: str | None = None) -> Response:
        """Add an environment, or change its address and limit (a plain form post)."""
        if not same_origin(request):
            return PlainTextResponse("Cross-origin request refused.", status_code=403)
        c = ctx(request, env)
        form = form_fields(
            await request.body(),
            {"environment": "", "base_url": "", "limit": "external-side-effect"},
        )
        path = (
            f"/portals/{quote(portal, safe='')}/environments/{quote(form['environment'], safe='')}"
        )
        try:
            code, body = await chat_client.call(
                settings,
                "PUT",
                path,
                {"base_url": form["base_url"], "max_action_class": form["limit"]},
                chat_transport,
            )
        except chat_client.ChatUnavailable:
            return await settings_page(c, portal, 503, form=form)
        if code != 200:
            message = body.get("message") if isinstance(body, dict) else None
            return await settings_page(c, portal, 400, str(message or "Not saved."), form)
        target = c.url(f"/portals/{quote(portal, safe='')}/settings", saved=form["environment"])
        return RedirectResponse(target, status_code=303)

    @app.post(
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
        c = ctx(request, env)
        path = f"/portals/{quote(portal, safe='')}/environments/{quote(environment, safe='')}"
        try:
            code, body = await chat_client.call(settings, "DELETE", path, None, chat_transport)
        except chat_client.ChatUnavailable:
            return await settings_page(c, portal, 503)
        if code != 200:
            message = body.get("message") if isinstance(body, dict) else None
            return await settings_page(c, portal, 409, str(message or "Not revoked."))
        target = c.url(f"/portals/{quote(portal, safe='')}/settings")
        return RedirectResponse(target, status_code=303)

    @app.post("/chat/new")
    async def chat_new(request: Request, env: str | None = None) -> Response:
        """The "new conversation" button (a plain form post, so it works without JavaScript)."""
        if not same_origin(request):
            return PlainTextResponse("Cross-origin request refused.", status_code=403)
        c = ctx(request, env)
        # Spec 011: a new conversation is for the portal chosen in the header (always a new one).
        payload = {"portal": c.portal, "fresh": True} if c.portal else {}
        try:
            status, body = await chat_client.call(
                settings, "POST", "/conversations", payload, chat_transport
            )
        except chat_client.ChatUnavailable:
            return RedirectResponse(c.url("/chat"), status_code=303)
        new_id = body.get("id") if isinstance(body, dict) else None
        if status >= 300 or not isinstance(new_id, str):
            return RedirectResponse(c.url("/chat"), status_code=303)
        return RedirectResponse(c.url("/chat", conversation=new_id), status_code=303)

    @app.post("/chat/conversations")
    async def chat_create(request: Request) -> JSONResponse:
        if not same_origin(request):
            return chat_refused()
        try:
            payload = await request.json()
        except ValueError:
            payload = {}
        fields = payload if isinstance(payload, dict) else {}
        sent = {k: v for k, v in fields.items() if k in ("portal", "goal") and isinstance(v, str)}
        try:
            status, body = await chat_client.call(
                settings, "POST", "/conversations", sent, chat_transport
            )
        except chat_client.ChatUnavailable:
            return chat_down()
        return chat_json(status, body)

    @app.post("/chat/conversations/{conversation_id}/messages")
    async def chat_send(request: Request, conversation_id: str) -> JSONResponse:
        if not same_origin(request):
            return chat_refused()
        try:
            payload = await request.json()
        except ValueError:
            payload = {}
        text = payload.get("text") if isinstance(payload, dict) else None
        if not isinstance(text, str) or not text.strip():
            return chat_json(422, {"ref": None, "message": "Write a message first."})
        try:
            status, body = await chat_client.call(
                settings,
                "POST",
                f"/conversations/{quote(conversation_id, safe='')}/messages",
                {"text": text},
                chat_transport,
            )
        except chat_client.ChatUnavailable:
            return chat_down()
        return chat_json(status, body)

    @app.get("/chat/conversations/{conversation_id}/events")
    async def chat_events(
        conversation_id: str,
        last_event_id: Annotated[str | None, Header()] = None,
    ) -> Response:
        """SSE passthrough. `Last-Event-ID` goes upstream so a reconnect resumes where it left."""
        client = chat_client.make_client(settings, chat_transport, stream=True)
        headers = {"accept": "text/event-stream"}
        if last_event_id:
            headers["last-event-id"] = last_event_id
        request = client.build_request(
            "GET", f"/conversations/{quote(conversation_id, safe='')}/events", headers=headers
        )
        try:
            upstream = await client.send(request, stream=True)
        except httpx2.HTTPError:
            await client.aclose()
            return chat_down()
        if upstream.status_code != 200:
            try:
                body = upstream.json() if await upstream.aread() else {}
            except ValueError:
                body = {}
            await upstream.aclose()
            await client.aclose()
            return chat_json(upstream.status_code, body)

        async def relay() -> AsyncIterable[bytes]:
            try:
                async for chunk in upstream.aiter_raw():
                    yield chunk
            except httpx2.HTTPError:
                return  # the service went away; the browser's EventSource reconnects
            finally:
                await upstream.aclose()
                await client.aclose()

        return StreamingResponse(
            relay(),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"},
        )

    # ---- credentials, scope, amendments: forms posted through the dashboard (T020, T027, T031,
    # T033). Each route validates the obvious, then forwards; the service is the only writer. ----

    @app.post("/chat/conversations/{conversation_id}/credentials")
    async def chat_credentials(request: Request, conversation_id: str) -> JSONResponse:
        """Values go to the service and nowhere else: they are not logged, stored or echoed."""
        if not same_origin(request):
            return chat_refused()
        fields = await read_json(request)
        portal = fields.get("portal")
        environment = fields.get("environment")
        raw = fields.get("values")
        if not isinstance(portal, str) or not portal.strip():
            return invalid("Choose a portal in the chat first.")
        if environment not in queries_chat.ENVIRONMENTS:
            return invalid("Choose sandbox, staging or production.")
        values = (
            {k: v for k, v in raw.items() if isinstance(v, str) and v != ""}
            if isinstance(raw, dict)
            else {}
        )
        if not values:
            return invalid("Type at least one value.")
        if any(not queries_chat.REF_NAME.match(k) for k in values):
            return invalid("Reference names use capital letters, digits and underscores.")
        sent = {"portal": portal, "environment": environment, "values": values}
        response = await forward(
            "POST", f"/conversations/{quote(conversation_id, safe='')}/credentials", sent
        )
        # Whatever the service said, only these keys go back to the browser.
        body = json.loads(response.body)
        kept = {k: body[k] for k in ("stored", "refs", "ref", "message") if k in body}
        return chat_json(response.status_code, kept)

    @app.post("/chat/conversations/{conversation_id}/scope")
    async def chat_scope(request: Request, conversation_id: str) -> JSONResponse:
        if not same_origin(request):
            return chat_refused()
        fields = await read_json(request)
        text_fields = ("portal", "process_name", "persona", "start_state_id", "end_state_id")
        if not isinstance(fields.get("process_name"), str) or not fields["process_name"].strip():
            return invalid("Name the process first.")
        if any(not isinstance(fields.get(k), str) or not fields[k] for k in text_fields):
            return invalid("Choose a persona, a start state and an end state.")
        selected = fields.get("selected_state_ids")
        comments = fields.get("comments")
        sent = {
            **{k: fields[k].strip() for k in text_fields},
            "selected_state_ids": [s for s in selected if isinstance(s, str)]
            if isinstance(selected, list)
            else [],
            "comments": {
                k: v
                for k, v in (comments if isinstance(comments, dict) else {}).items()
                if isinstance(v, str) and v.strip()
            },
            "source": "ba_description",
        }
        return await forward(
            "POST", f"/conversations/{quote(conversation_id, safe='')}/scope", sent
        )

    @app.post("/chat/portals/{portal}/amendments")
    async def amendment_create(request: Request, portal: str) -> JSONResponse:
        if not same_origin(request):
            return chat_refused()
        fields = await read_json(request)
        sent: dict[str, Any] = {
            k: fields[k]
            for k in ("kind", "target_kind", "target_id", "text", "author")
            if isinstance(fields.get(k), str) and fields[k].strip()
        }
        attachment = fields.get("attachment")
        if isinstance(attachment, dict):
            name, content = attachment.get("name"), attachment.get("content_base64")
            if not isinstance(name, str) or not isinstance(content, str) or not content:
                return invalid("The attachment could not be read.")
            if len(content) > MAX_ATTACHMENT_B64:
                return chat_json(
                    413, {"ref": None, "message": "The attachment is larger than 8 MB."}
                )
            sent["attachment"] = {"name": name, "content_base64": content}
        if not all(k in sent for k in ("kind", "target_kind", "target_id")):
            return invalid("The amendment has no target.")
        return await forward("POST", f"/portals/{quote(portal, safe='')}/amendments", sent)

    @app.delete("/chat/portals/{portal}/amendments/{amendment_id}")
    async def amendment_withdraw(request: Request, portal: str, amendment_id: str) -> JSONResponse:
        if not same_origin(request):
            return chat_refused()
        return await forward(
            "DELETE", f"/portals/{quote(portal, safe='')}/amendments/{quote(amendment_id, safe='')}"
        )

    @app.post("/chat/portals/{portal}/amendments/{amendment_id}/reapply")
    async def amendment_reapply(request: Request, portal: str, amendment_id: str) -> JSONResponse:
        if not same_origin(request):
            return chat_refused()
        fields = await read_json(request)
        sent = {
            k: fields[k]
            for k in ("target_kind", "target_id", "text")
            if isinstance(fields.get(k), str) and fields[k].strip()
        }
        if "target_kind" not in sent or "target_id" not in sent:
            return invalid("Choose the state to apply it to.")
        return await forward(
            "POST",
            f"/portals/{quote(portal, safe='')}/amendments/{quote(amendment_id, safe='')}/reapply",
            sent,
        )

    @app.post("/chat/portals/{portal}/amendments/{amendment_id}/dismiss")
    async def amendment_dismiss(request: Request, portal: str, amendment_id: str) -> JSONResponse:
        if not same_origin(request):
            return chat_refused()
        return await forward(
            "POST",
            f"/portals/{quote(portal, safe='')}/amendments/{quote(amendment_id, safe='')}/dismiss",
            {},
        )

    @app.post("/chat/runs/{run_id}/stop")
    async def chat_stop_run(request: Request, run_id: str) -> JSONResponse:
        """The tracker's "Stop scan" button (T041): the run becomes interrupted, so it resumes."""
        if not same_origin(request):
            return chat_refused()
        return await forward("POST", f"/runs/{quote(run_id, safe='')}/stop", {})

    @app.post("/chat/conversations/{conversation_id}/cancel")
    async def chat_cancel(request: Request, conversation_id: str) -> JSONResponse:
        """The chat's [stop] (T050): ends the assistant's turn and the conversation's runs."""
        if not same_origin(request):
            return chat_refused()
        return await forward("POST", f"/conversations/{quote(conversation_id, safe='')}/cancel", {})

    @app.post("/chat/conversations/{conversation_id}/reset")
    async def chat_reset(request: Request, conversation_id: str) -> JSONResponse:
        """[reset assistant] (T051): a fresh assistant session on the next message."""
        if not same_origin(request):
            return chat_refused()
        return await forward("POST", f"/conversations/{quote(conversation_id, safe='')}/reset", {})

    # ---- developer lookup of an ERR- reference (T025) ----------------------------------------

    @app.get("/chat/errors/{ref}", response_class=HTMLResponse)
    async def chat_error(request: Request, ref: str, env: str | None = None) -> HTMLResponse:
        """The error-log line behind a reference, fetched from the service (not the store)."""
        c = ctx(request, env)
        entry: dict[str, Any] | None = None
        unavailable = False
        status = 200
        if ERR_REF.match(ref):
            try:
                code, body = await chat_client.call(
                    settings, "GET", f"/errors/{quote(ref, safe='')}", None, chat_transport
                )
            except chat_client.ChatUnavailable:
                unavailable = True
            else:
                entry = body if code == 200 and isinstance(body, dict) else None
        status = 503 if unavailable else (200 if entry else 404)
        return render(
            c,
            "error_entry.html",
            status_code=status,
            ref=ref,
            entry=entry,
            unavailable=unavailable,
            nav_current="chat",
        )

    # ---- superseded amendments (T033, FR-022) ------------------------------------------------

    def superseded_values(
        c: Ctx, conn: sqlite3.Connection, portal: str | None, show: str | None
    ) -> dict[str, Any]:
        portal = portal or None
        show = show if show in queries_chat.SHOW_FILTERS else "superseded"
        items = queries_chat.superseded_amendments(conn, portal, show)
        states = {
            p: queries_chat.portal_states(conn, p) for p in sorted({a.portal_id for a in items})
        }
        return {
            "items": items,
            "portal": portal,
            "show": show,
            "portals": queries_chat.amendment_portals(conn),
            "states": states,
            "reasons": queries_chat.SUPERSEDED_REASONS,
            "form_action": c.url("/amendments/superseded"),
            "fragment_url": c.url("/fragments/amendments/superseded"),
            "self_url": c.url("/fragments/amendments/superseded", portal=portal, show=show),
        }

    @app.get("/amendments/superseded", response_class=HTMLResponse)
    def superseded_page(
        request: Request, env: str | None = None, portal: str | None = None, show: str | None = None
    ) -> HTMLResponse:
        c = ctx(request, env)
        try:
            with c.conn() as conn:
                return render(
                    c,
                    "amendments.html",
                    nav_current="amendments",
                    v=superseded_values(c, conn, portal, show),
                )
        except db.StoreMissing as err:
            return missing(c, err)

    @app.get("/fragments/amendments/superseded", response_class=HTMLResponse)
    def fragment_superseded(
        request: Request,
        env: str | None = None,
        portal: str | None = None,
        show: str | None = None,
        push: bool = False,
    ) -> HTMLResponse:
        c = ctx(request, env)
        try:
            with c.conn() as conn:
                v = superseded_values(c, conn, portal, show)
        except db.StoreMissing as err:
            return missing(c, err, fragment=True)
        return render(
            c,
            "partials/amendments_superseded.html",
            v=v,
            push=c.url("/amendments/superseded", portal=v["portal"], show=v["show"])
            if push
            else None,
        )

    @app.get("/fragments/states/{state_id}/amendments", response_class=HTMLResponse)
    def fragment_state_amendments(
        request: Request, state_id: str, env: str | None = None
    ) -> HTMLResponse:
        c = ctx(request, env)
        try:
            with c.conn() as conn:
                page = visuals.state_page(conn, settings.data_dir, state_id)
                if page is None:
                    return render(
                        c, "partials/states/state_missing.html", status_code=404, state_id=state_id
                    )
                am = state_amendments_values(c, conn, page.figure.state)
        except db.StoreMissing as err:
            return missing(c, err, fragment=True)
        return render(c, "partials/state_amendments.html", am=am, st=page.figure.state)

    # ---- live -------------------------------------------------------------------------------

    @app.get("/events", response_class=EventSourceResponse)
    async def events(
        request: Request,
        env: str | None = None,
        last_event_id: Annotated[str | None, Header()] = None,
    ) -> AsyncIterable[ServerSentEvent]:
        c = ctx(request, env)
        async for event in live.watch(
            settings.data_dir,
            c.env,
            dev=settings.dev,
            last_event_id=last_event_id,
            interval=settings.poll_interval_s,
            keepalive=settings.keepalive_s,
            max_seconds=settings.sse_max_s,
        ):
            if await request.is_disconnected():
                break
            yield event

    return app


# ---- view values: what each partial needs, built once for page and fragment ----------------


def glossary_groups(g: glossary.Glossary, q: str) -> list[tuple[str, str, list[glossary.Entry]]]:
    """Groups in reading order, keeping entries whose term, labels or short text contain `q`."""
    needle = q.strip().casefold()

    def match(e: glossary.Entry) -> bool:
        haystack = " ".join((e.term, e.short, *e.labels)).casefold()
        return not needle or needle in haystack

    out = []
    for category, group, entries in g.groups():
        kept = [e for e in entries if match(e)]
        if kept:
            out.append((category, group, kept))
    return out


def summary_values(c: Ctx, conn: sqlite3.Connection, portal: str | None) -> dict[str, Any]:
    summaries = queries.portal_summaries(conn)
    portal = portal or None
    if portal:
        summaries = [s for s in summaries if s.portal_id == portal]
    return {
        "items": summaries,
        "superseded": queries_chat.superseded_counts(conn),
        "self_url": c.url("/fragments/summary", portal=portal),
    }


def runs_values(
    c: Ctx,
    conn: sqlite3.Connection,
    portal: str | None,
    status: str | None,
    cursor: str | None,
    page: int,
) -> dict[str, Any]:
    limit = c.settings.page_size
    portal = portal or None  # a form's "any" option submits an empty string
    status = status if status in RUN_STATUSES else None
    cursor = cursor or None
    result = queries.list_runs(conn, portal=portal, status=status, cursor=cursor, limit=limit)
    filters = {"portal": portal, "status": status}
    page = max(page, 1)
    return {
        "page": result,
        "filters": filters,
        "portals": queries.portals(conn),
        "page_no": page,
        "pages": max(1, -(-result.total // limit)),
        "offset": (page - 1) * limit,
        "self_url": c.url(
            "/fragments/runs", **filters, cursor=cursor, page=page if cursor else None
        ),
        "page_url": c.url("/", **filters, cursor=cursor, page=page if cursor else None),
        "fragment_url": "/fragments/runs",
        "form_action": "/",
        "next_url": c.url("/", **filters, cursor=result.next_cursor, page=page + 1)
        if result.next_cursor
        else None,
        "next_fragment": c.url(
            "/fragments/runs", **filters, cursor=result.next_cursor, page=page + 1, push=1
        )
        if result.next_cursor
        else None,
        "first_url": c.url("/", **filters) if cursor else None,
        "first_fragment": c.url("/fragments/runs", **filters, push=1) if cursor else None,
    }


def header_values(c: Ctx, conn: sqlite3.Connection, summary: Any, tab: str) -> dict[str, Any]:
    run: Run = summary.run
    counts = {
        "states": summary.states,
        "actions": summary.actions,
        "frontier": summary.frontier,
        "forms": summary.forms,
        "network": summary.network_calls,
        "robots": summary.robots_policies,
        "decisions": summary.decisions,
        # a lightweight count-only call: `trace_calls` with limit=1 still totals every match.
        "trace": queries.trace_calls(conn, run.id, limit=1).total,
        "process": queries_docs.process_step_count(conn, run.id),
        "docs": queries_docs.run_citing_count(conn, run.id),
    }
    # the process tab belongs to trace runs; an old store without process tables never shows it
    show_process = run.mode == "trace" or counts["process"] > 0
    return {
        "self_url": c.url(f"/fragments/runs/{run.id}/header", tab=tab),
        "tab": tab,
        "tabs": [
            (sid, label, counts[sid], c.url(f"/runs/{run.id}", tab=sid))
            for sid, label in SECTIONS
            if sid != "process" or show_process or tab == "process"
        ],
    }


def section_values(
    c: Ctx, conn: sqlite3.Connection, run: Run, section: str, params: Any
) -> dict[str, Any]:
    """Values for one run-detail section, with its filters read from the query string.

    `params` supports repeated keys (a `QueryParams` from the request, or a plain dict for a
    single-value section); `trace` is the only section with repeatable filters (`tool`, `status`).
    """
    if section == "trace":
        return trace_calls_values(c, conn, run, params)
    limit = c.settings.page_size
    cursor = params.get("cursor") or None
    page_no = max(int(params.get("page", "1") or 1), 1)
    base = f"/fragments/runs/{run.id}/{section}"
    page_base = f"/runs/{run.id}"
    filters: dict[str, Any] = {}
    data: dict[str, Any] = {}

    if section == "states":
        data["items"] = queries.run_states(conn, run.id)
    elif section == "actions":
        safety = params.get("safety_class")
        safety = safety if safety in SAFETY_CLASSES else None
        allowed_raw = params.get("allowed")
        allowed = {"1": True, "0": False}.get(allowed_raw or "")
        filters = {"safety_class": safety, "allowed": allowed_raw if allowed is not None else None}
        data["page"] = queries.run_actions(conn, run.id, safety, allowed, cursor, limit)
        data["counts"] = queries.action_counts(conn, run.id)
    elif section == "frontier":
        status = params.get("status")
        status = status if status in FRONTIER_STATUSES else None
        filters = {"status": status}
        data["page"] = queries.run_frontier(conn, run.id, status, cursor, limit)
        data["counts"] = queries.frontier_counts(conn, run.id)
    elif section == "forms":
        data["items"] = queries.run_forms(conn, run.id)
    elif section == "network":
        data["page"] = queries.run_network_calls(conn, run.id, cursor, limit)
    elif section == "robots":
        data["items"] = queries.run_robots_policies(conn, run.id)
    elif section == "decisions":
        kind = params.get("kind")
        kind = kind if kind in DECISION_KINDS else None
        rule = params.get("rule") or None
        filters = {"kind": kind, "rule": rule}
        data["page"] = queries.run_decisions(conn, run.id, kind, rule, cursor, limit)
        data["groups"] = queries.decision_groups(conn, run.id)
        data["rules"] = queries.decision_rules(conn, run.id)
    elif section == "docs":
        data["page"] = queries_docs.run_citing_records(conn, run.id, cursor=cursor, limit=limit)
    elif section == "process":
        found = queries_docs.process_for_run(conn, run.id)
        data["process"] = found[0] if found else None
        data["steps"] = found[1] if found else []
        data["diagram"] = process_run_diagram(conn, found) if found else None

    pg = data.get("page")
    next_cursor = pg.next_cursor if pg else None
    page_arg = page_no if cursor else None
    return {
        "id": section,
        "run": run,
        "filters": filters,
        "page_no": page_no,
        "pages": max(1, -(-pg.total // limit)) if pg else 1,
        "offset": (page_no - 1) * limit,
        "self_url": c.url(base, **filters, cursor=cursor, page=page_arg),
        "page_url": c.url(page_base, tab=section, **filters, cursor=cursor, page=page_arg),
        "fragment_url": base,
        "form_action": page_base,
        "next_url": c.url(page_base, tab=section, **filters, cursor=next_cursor, page=page_no + 1)
        if next_cursor
        else None,
        "next_fragment": c.url(base, **filters, cursor=next_cursor, page=page_no + 1, push=1)
        if next_cursor
        else None,
        "first_url": c.url(page_base, tab=section, **filters) if cursor else None,
        "first_fragment": c.url(base, **filters, push=1) if cursor else None,
        **data,
    }


def _multi(params: Any, key: str) -> list[str]:
    """Repeated query values for `key`; works for a `QueryParams` or a plain single-value dict."""
    if hasattr(params, "getlist"):
        return [v for v in params.getlist(key) if v]
    value = params.get(key)
    return [value] if value else []


def agent_context_for_run(conn: sqlite3.Connection, run_id: str) -> dict[str, Any]:
    """Per-call agent context for the trace tab (T034, contracts/agent-import.md "Join"):
    the agent's visible text before a call and the issuing turn's token usage, keyed by
    `tool_use_id`; and the agent's own tool calls that never reached the server."""
    turns = queries.agent_turns_for_run(conn, run_id)
    # usage repeats on every entry of an API message; contracts/agent-import.md attaches it
    # once, to the row with the highest `block_index` for that `api_message_id`
    usage_by_message: dict[str, Any] = {}
    for t in turns:
        if t.api_message_id and (t.input_tokens is not None or t.output_tokens is not None):
            usage_by_message[t.api_message_id] = t
    by_tool_use_id: dict[str, dict[str, Any]] = {}
    unmatched: list[dict[str, Any]] = []
    preceding_text: str | None = None
    for t in turns:
        if t.role == "assistant" and t.kind == "text" and t.text:
            preceding_text = t.text
        if t.kind == "tool_use":
            usage = usage_by_message.get(t.api_message_id) if t.api_message_id else None
            if t.tool_use_id:
                by_tool_use_id[t.tool_use_id] = {"text": preceding_text, "usage": usage}
            if not t.matched and t.tool_name and t.tool_name.startswith("mcp__pathfinder__"):
                unmatched.append({"turn": t, "text": preceding_text})
            preceding_text = None
    return {
        "imported": bool(turns),
        "by_tool_use_id": by_tool_use_id,
        "unmatched_agent_calls": unmatched,
    }


def trace_summary_section(c: Ctx, conn: sqlite3.Connection, run: Run) -> dict[str, Any]:
    """Values shared by the summary's own live region and the trace tab's combined page (T041)."""
    return {
        "summary": queries.trace_summary(conn, run.id),
        "summary_self_url": c.url(f"/fragments/runs/{run.id}/trace/summary"),
        "problems_url": c.url(f"/runs/{run.id}", tab="trace", problems="1"),
    }


def trace_calls_values(c: Ctx, conn: sqlite3.Connection, run: Run, params: Any) -> dict[str, Any]:
    """Values for the trace tab / `/fragments/runs/{run_id}/trace` (contracts/dashboard-routes.md):
    the call list with its `tool`/`status`/`problems` filters, and agent context (T034)."""
    limit = c.settings.page_size
    cursor = params.get("cursor") or None
    page_no = max(int(params.get("page", "1") or 1), 1)
    tools = _multi(params, "tool") or None
    statuses = [s for s in _multi(params, "status") if s in SPAN_STATUSES] or None
    problems = (params.get("problems") or "") in ("1", "true")
    base = f"/fragments/runs/{run.id}/trace"
    page_base = f"/runs/{run.id}"
    result = queries.trace_calls(
        conn, run.id, tools=tools, statuses=statuses, problems=problems, cursor=cursor, limit=limit
    )
    # every call name seen in this run, for the tool filter's options
    tool_options = sorted({s.name for s in queries.trace_calls(conn, run.id, limit=10_000).items})
    filters = {"tool": tools or [], "status": statuses or [], "problems": "1" if problems else ""}
    page_arg = page_no if cursor else None
    agent_ctx = agent_context_for_run(conn, run.id)
    if cursor:  # "never reached server" calls are shown once, on the first page only
        agent_ctx = {**agent_ctx, "unmatched_agent_calls": []}
    return {
        "id": "trace",
        "run": run,
        "filters": filters,
        "problems": problems,
        "tool_options": tool_options,
        "status_options": SPAN_STATUSES,
        "agent_ctx": agent_ctx,
        **trace_summary_section(c, conn, run),
        "page": result,
        "page_no": page_no,
        "pages": max(1, -(-result.total // limit)),
        "offset": (page_no - 1) * limit,
        "self_url": c.url(base, **filters, cursor=cursor, page=page_arg),
        "page_url": c.url(page_base, tab="trace", **filters, cursor=cursor, page=page_arg),
        "fragment_url": base,
        "form_action": page_base,
        "next_url": c.url(
            page_base, tab="trace", **filters, cursor=result.next_cursor, page=page_no + 1
        )
        if result.next_cursor
        else None,
        "next_fragment": c.url(base, **filters, cursor=result.next_cursor, page=page_no + 1, push=1)
        if result.next_cursor
        else None,
        "first_url": c.url(page_base, tab="trace", **filters) if cursor else None,
        "first_fragment": c.url(base, **filters, push=1) if cursor else None,
    }


def span_children_values(
    conn: sqlite3.Connection, span_id: str, kinds: list[str], names: list[str]
) -> dict[str, Any]:
    """Values for `/fragments/spans/{span_id}/children`: phases (each with its own nested
    events), events attached directly to the call, and a total for the proportional phase bar."""
    kinds = [k for k in kinds if k in SPAN_CHILD_KINDS] or None
    names = [n for n in names if n] or None
    children = queries.span_children(conn, span_id, kinds, names)
    phases = [
        {"span": child, "events": queries.span_children(conn, child.id, kinds=["event"])}
        for child in children
        if child.kind == "phase"
    ]
    top_events = [child for child in children if child.kind == "event"]
    total_ms = sum(p["span"].duration_ms or 0 for p in phases)
    call = queries.get_span(conn, span_id)
    return {
        "span_id": span_id,
        "phases": phases,
        "top_events": top_events,
        "total_ms": total_ms or None,
        "run_id": call.run_id if call else None,
    }


def activity_values(c: Ctx, conn: sqlite3.Connection, params: Any) -> dict[str, Any]:
    """Values for `/activity` / `/fragments/activity`: run-less calls, newest first (FR-016)."""
    limit = c.settings.page_size
    cursor = params.get("cursor") or None
    page_no = max(int(params.get("page", "1") or 1), 1)
    result = queries.server_activity(conn, cursor=cursor, limit=limit)
    page_arg = page_no if cursor else None
    return {
        "page": result,
        "page_no": page_no,
        "pages": max(1, -(-result.total // limit)),
        "offset": (page_no - 1) * limit,
        "self_url": c.url("/fragments/activity", cursor=cursor, page=page_arg),
        "page_url": c.url("/activity", cursor=cursor, page=page_arg),
        "fragment_url": "/fragments/activity",
        "form_action": "/activity",
        "next_url": c.url("/activity", cursor=result.next_cursor, page=page_no + 1)
        if result.next_cursor
        else None,
        "next_fragment": c.url(
            "/fragments/activity", cursor=result.next_cursor, page=page_no + 1, push=1
        )
        if result.next_cursor
        else None,
        "first_url": c.url("/activity") if cursor else None,
        "first_fragment": c.url("/fragments/activity", push=1) if cursor else None,
    }


# ---- docs view values (spec 004, R-15) ------------------------------------------------------


def process_run_diagram(conn: sqlite3.Connection, found: Any) -> str | None:
    """Mermaid process map of a trace run's recorded steps (run page `process` tab)."""
    process, steps = found
    if not steps:
        return None
    boundary = None
    if process.outcome == "boundary_reached" and process.boundary_action_id:
        boundary = {
            "action": queries_docs.action_name(conn, process.boundary_action_id) or "boundary",
            "not_observable": process.not_observable or "not observable",
        }
    return diagrams.process_map(
        {
            "process": {"key": "run", "title": process.name},
            "steps": [{"ord": s.ord, "kind": s.kind, "intent": s.intent} for s in steps],
            "boundary": boundary,
        }
    )


def same_origin(request: Request) -> bool:
    """The dashboard has no login, so a form post must come from its own pages: `Origin` (or,
    failing that, `Referer`) has to name this very host:port. Neither present: refused."""
    host = request.headers.get("host", "")
    for header in ("origin", "referer"):
        value = request.headers.get(header)
        if value:
            return urlsplit(value).netloc == host
    return False


def refusal(code: str, message: str) -> dict[str, Any]:
    return {"ok": False, "code": code, "message": message, "action": None}


def _paging(
    c: Ctx,
    base: str,
    page_base: str,
    page_params: dict[str, Any],
    filters: dict[str, Any],
    cursor: str | None,
    page_no: int,
    next_cursor: str | None,
    total: int,
    limit: int,
) -> dict[str, Any]:
    """The self/page/next/first URLs every paged region carries (see `section_values`)."""
    page_arg = page_no if cursor else None
    return {
        "page_no": page_no,
        "pages": max(1, -(-total // limit)),
        "offset": (page_no - 1) * limit,
        "self_url": c.url(base, **filters, cursor=cursor, page=page_arg),
        "page_url": c.url(page_base, **page_params, **filters, cursor=cursor, page=page_arg),
        "fragment_url": base,
        "form_action": page_base,
        "next_url": c.url(page_base, **page_params, **filters, cursor=next_cursor, page=page_no + 1)
        if next_cursor
        else None,
        "next_fragment": c.url(base, **filters, cursor=next_cursor, page=page_no + 1, push=1)
        if next_cursor
        else None,
        "first_url": c.url(page_base, **page_params, **filters) if cursor else None,
        "first_fragment": c.url(base, **filters, push=1) if cursor else None,
    }


def docs_portals_values(c: Ctx, conn: sqlite3.Connection) -> dict[str, Any]:
    return {
        "items": queries_docs.doc_portals(conn),
        "self_url": c.url("/fragments/docs/portals"),
    }


def docs_index_values(
    c: Ctx, conn: sqlite3.Connection, portal: str, section: str
) -> dict[str, Any]:
    """The side index of SRS sections with record counts (FR-030) and the portal's status mix."""
    counts = queries_docs.section_counts(conn, portal)
    sessions = queries_docs.portal_sessions(conn, portal, limit=1)
    return {
        "portal": portal,
        "current": section,
        "statuses": queries_docs.status_counts(conn, portal),
        "last_session": sessions[0] if sessions else None,
        "items": [
            (sid, label, counts[sid], c.url(f"/docs/{portal}", section=sid))
            for sid, label, _ in queries_docs.DOC_SECTIONS
        ],
        "self_url": c.url(f"/fragments/docs/{portal}/index", section=section),
    }


def docs_section_values(
    c: Ctx, conn: sqlite3.Connection, portal: str, section: str, params: Any
) -> dict[str, Any]:
    """One SRS section: its records (filtered, keyset-paged) or, for `overview`, the scope view."""
    kinds = queries_docs.SECTION_KINDS[section]
    label = next(lbl for sid, lbl, _ in queries_docs.DOC_SECTIONS if sid == section)
    limit = c.settings.page_size
    cursor = params.get("cursor") or None
    raw_page = str(params.get("page") or "1")
    page_no = int(raw_page) if raw_page.isdigit() and int(raw_page) > 0 else 1
    kind = params.get("kind")
    kind = kind if kind in kinds and len(kinds) > 1 else None
    status = params.get("status")
    status = status if status in queries_docs.DOC_STATUSES else None
    confidence = params.get("confidence")
    confidence = confidence if confidence in queries_docs.CONFIDENCES else None
    flag = params.get("flag")
    flag = flag if flag in dict(queries_docs.FLAGS) else None
    filters = {"kind": kind, "status": status, "confidence": confidence, "flag": flag}
    base = f"/fragments/docs/{portal}/section/{section}"
    values: dict[str, Any] = {
        "id": section,
        "label": label,
        "portal": portal,
        "kinds": kinds,
        "filters": filters,
        "kind_options": [(k, k.replace("_", " ")) for k in kinds] if len(kinds) > 1 else [],
        "status_options": [(s, s) for s in queries_docs.DOC_STATUSES],
        "confidence_options": [(s, s.replace("_", " ")) for s in queries_docs.CONFIDENCES],
        "flag_options": list(queries_docs.FLAGS),
        "page": None,
        "diagram": None,
        "diagram_caption": None,
    }
    page = None
    if section == "overview":
        values["sessions"] = queries_docs.portal_sessions(conn, portal, limit=5)
        values["statuses"] = queries_docs.status_counts(conn, portal)
        counts = queries_docs.section_counts(conn, portal)
        values["counts"] = [
            (sid, lbl, counts[sid], c.url(f"/docs/{portal}", section=sid))
            for sid, lbl, _ in queries_docs.DOC_SECTIONS
            if sid not in ("overview", "traceability")
        ]
        filters = {}
    else:
        page = queries_docs.list_records(
            conn,
            portal,
            kinds,
            kind=kind,
            status=status,
            confidence=confidence,
            flag=flag,
            cursor=cursor,
            limit=limit,
        )
        if section == "traceability":
            page = page.model_copy(update={"items": queries_docs.attach_related(conn, page.items)})
        values["page"] = page
    if section == "capabilities":
        data = queries_docs.capability_diagram_input(conn, portal)
        if data["capabilities"]:
            values["diagram"] = diagrams.capability_map(data)
            values["diagram_caption"] = "Capability map: capabilities and what they contain"
    elif section == "screens":
        data = queries_docs.screen_diagram_input(conn, portal)
        if data["screens"]:
            values["diagram"] = diagrams.screen_nav(data)
            omitted = data["omitted"]
            values["diagram_caption"] = "Screen navigation: edges between screens" + (
                f" ({omitted} global-navigation links to widely linked screens left out)"
                if omitted
                else ""
            )
    paging = _paging(
        c,
        base,
        f"/docs/{portal}",
        {"section": section},
        filters,
        cursor,
        page_no,
        page.next_cursor if page else None,
        page.total if page else 0,
        limit,
    )
    return {**values, **paging, "filters": filters}


def session_values(
    c: Ctx, conn: sqlite3.Connection, portal: str, session_id: str, params: Any
) -> dict[str, Any] | None:
    limit = c.settings.page_size
    cursor = params.get("cursor") or None
    raw_page = str(params.get("page") or "1")
    page_no = int(raw_page) if raw_page.isdigit() and int(raw_page) > 0 else 1
    detail = queries_docs.session_detail(conn, portal, session_id, cursor, limit)
    if detail is None:
        return None
    paging = _paging(
        c,
        f"/fragments/docs/{portal}/sessions/{session_id}",
        f"/docs/{portal}/sessions/{session_id}",
        {},
        {},
        cursor,
        page_no,
        detail.next_cursor,
        detail.written_total,
        limit,
    )
    return {"portal": portal, "detail": detail, **paging}


def record_values(
    c: Ctx,
    conn: sqlite3.Connection,
    portal: str,
    key: str,
    rev: str | None,
    result: dict[str, Any] | None = None,
) -> dict[str, Any] | None:
    """Everything the record page's three live regions (header, body, reviews) need."""
    detail = queries_docs.record_detail(
        conn, portal, key, int(rev) if rev and rev.isdigit() else None
    )
    if detail is None:
        return None
    diagram = None
    if detail.record.kind == "process":
        data = queries_docs.process_diagram_input(conn, detail)
        diagram = diagrams.process_map(data) if data else None
    rev_arg = None if detail.is_latest else detail.shown.rev_no
    base = f"/fragments/docs/{portal}/{key}"
    latest = detail.history[0]
    reviews_url = c.url(f"{base}/reviews", rev=rev_arg)
    panel = {
        "enabled": bool(c.settings.reviewer),
        "reviewer": c.settings.reviewer,
        "latest": latest.revision,
        "reviews": latest.reviews,
        "can_decide": latest.revision.status == "draft",
        "post_url": c.url(f"/docs/{portal}/{key}/reviews"),
        "self_url": reviews_url,
        "result": result,
        "viewing_latest": detail.is_latest,
    }
    return {
        "portal": portal,
        "key": key,
        "detail": detail,
        "diagram": diagram,
        "figures": visuals.record_figures(conn, c.settings.data_dir, detail.evidence),
        "figures_open": visuals.FIGURES_OPEN,
        "panel": panel,
        "header_url": c.url(f"{base}/header", rev=rev_arg),
        "body_url": c.url(f"{base}/body", rev=rev_arg),
        "reviews_url": reviews_url,
        "rev_arg": rev_arg,
    }


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
    import json

    if isinstance(value, str):
        return value
    return json.dumps(value, indent=2, ensure_ascii=False, sort_keys=True)
