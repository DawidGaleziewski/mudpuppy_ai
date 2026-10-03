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
from urllib.parse import parse_qs, urlencode, urlsplit

from fastapi import FastAPI, Header, Query, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import HTMLResponse, JSONResponse, PlainTextResponse, Response
from fastapi.sse import EventSourceResponse, ServerSentEvent
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from starlette.exceptions import HTTPException

from . import db, diagrams, live, queries, queries_docs, review
from .models import DECISION_KINDS, FRONTIER_STATUSES, RUN_STATUSES, SAFETY_CLASSES, Run
from .settings import Settings
from .version import STARTUP_FINGERPRINT

PACKAGE = Path(__file__).parent
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

    @app.get("/docs", response_class=HTMLResponse)
    def docs_portals(request: Request, env: str | None = None) -> HTMLResponse:
        c = ctx(request, env)
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
