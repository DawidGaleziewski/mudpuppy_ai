"""FastAPI app: pages, htmx fragments and the live event stream (contracts/http-routes.md).

Every route is GET and read-only. A page renders the same partials its fragments return, so a
live region re-fetching itself and a full page load produce identical markup.
"""

from __future__ import annotations

import sqlite3
from collections.abc import AsyncIterable, Iterator
from contextlib import contextmanager
from dataclasses import dataclass, field
from pathlib import Path
from typing import Annotated, Any
from urllib.parse import urlencode

from fastapi import FastAPI, Header, Request
from fastapi.responses import HTMLResponse, JSONResponse, Response
from fastapi.sse import EventSourceResponse, ServerSentEvent
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from starlette.exceptions import HTTPException

from . import db, live, queries
from .models import DECISION_KINDS, FRONTIER_STATUSES, RUN_STATUSES, SAFETY_CLASSES, Run
from .settings import Settings

PACKAGE = Path(__file__).parent
SECTIONS: tuple[tuple[str, str], ...] = (
    ("states", "States"),
    ("actions", "Actions"),
    ("frontier", "Frontier"),
    ("forms", "Forms"),
    ("network", "Network"),
    ("robots", "Robots"),
    ("decisions", "Decisions"),
)
SECTION_IDS = {s for s, _ in SECTIONS}


def _clean(params: dict[str, Any]) -> dict[str, Any]:
    return {k: v for k, v in params.items() if v not in (None, "", False)}


def build_url(path: str, **params: Any) -> str:
    query = urlencode(_clean(params))
    return f"{path}?{query}" if query else path


@dataclass
class Ctx:
    """Per-request context: which store, and helpers that keep `env` on every link."""

    request: Request
    settings: Settings
    env: str
    envs: list[str]
    extra: dict[str, Any] = field(default_factory=dict)

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


def create_app(settings: Settings | None = None) -> FastAPI:
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
        BOOT_ID=live.BOOT_ID,
    )
    templates.env.filters["duration"] = fmt_duration
    templates.env.filters["when"] = fmt_when
    templates.env.filters["pretty_json"] = pretty_json
    templates.env.filters["kb"] = lambda n: f"{n / 1024:,.0f} KB"
    templates.env.filters["jget"] = jget
    templates.env.filters["short_id"] = short_id
    templates.env.filters["top_locator"] = top_locator

    class StaticWithCache(StaticFiles):
        async def get_response(self, path: str, scope: Any) -> Response:
            response = await super().get_response(path, scope)
            response.headers["Cache-Control"] = "public, max-age=3600"
            return response

    app.mount("/static", StaticWithCache(directory=PACKAGE / "static"), name="static")

    def ctx(request: Request, env: str | None) -> Ctx:
        envs = db.list_environments(settings.data_dir)
        resolved = db.resolve_env(settings.data_dir, env, settings.default_env)
        return Ctx(request, settings, resolved, envs)

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
                params = dict(request.query_params)
                return render(
                    c,
                    "run_detail.html",
                    s=summary,
                    tab=tab,
                    header=header_values(c, summary, tab),
                    section=section_values(c, conn, summary.run, tab, params),
                )
        except db.StoreMissing as err:
            return missing(c, err)

    @app.get("/healthz")
    def healthz(request: Request, env: str | None = None) -> JSONResponse:
        c = ctx(request, env)
        info = db.store_info(settings.data_dir, c.env)
        return JSONResponse(
            {"ok": info.exists, "store": info.model_dump()},
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
                    c, "partials/run_header.html", s=summary, header=header_values(c, summary, tab)
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
                values = section_values(c, conn, run, section, dict(request.query_params))
                return render(
                    c,
                    f"partials/{section}.html",
                    section=values,
                    push=values["page_url"] if push else None,
                )
        except db.StoreMissing as err:
            return missing(c, err, fragment=True)

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


def summary_values(c: Ctx, conn: sqlite3.Connection, portal: str | None) -> dict[str, Any]:
    summaries = queries.portal_summaries(conn)
    portal = portal or None
    if portal:
        summaries = [s for s in summaries if s.portal_id == portal]
    return {
        "items": summaries,
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


def header_values(c: Ctx, summary: Any, tab: str) -> dict[str, Any]:
    run: Run = summary.run
    counts = {
        "states": summary.states,
        "actions": summary.actions,
        "frontier": summary.frontier,
        "forms": summary.forms,
        "network": summary.network_calls,
        "robots": summary.robots_policies,
        "decisions": summary.decisions,
    }
    return {
        "self_url": c.url(f"/fragments/runs/{run.id}/header", tab=tab),
        "tab": tab,
        "tabs": [
            (sid, label, counts[sid], c.url(f"/runs/{run.id}", tab=sid)) for sid, label in SECTIONS
        ],
    }


def section_values(
    c: Ctx, conn: sqlite3.Connection, run: Run, section: str, params: dict[str, str]
) -> dict[str, Any]:
    """Values for one run-detail section, with its filters read from the query string."""
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
