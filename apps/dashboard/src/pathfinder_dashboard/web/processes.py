"""The Processes workspace (spec 022 M5, screens 04–07): the list with the assistant's
suggestions, one process with its variants and the to-be draft, Compare with the change spec, and
the Markdown export. New pages: Salvage Yard only. The browser's writes reach the chat service
through the forwarders here, signed with the reviewer name (the dashboard never writes)."""

from __future__ import annotations

import re
import sqlite3
from typing import Any
from urllib.parse import quote

from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse, JSONResponse, PlainTextResponse, Response

from .. import change_spec, db, pager, process_diff, queries_processes
from .chat_forward import chat_refused, forward, invalid, read_json
from .deps import Ctx, same_origin, web_of

router = APIRouter()

# The chat routes the forwarder may reach (contracts/processes-api.md); anything else is refused.
WRITE_PATH = re.compile(
    r"^processes(/[^/]+(/variants(/[A-Z]{1,2}/(draft|save|rebase|restore))?|/live|/change-spec)?)?$"
    r"|^suggestions/[^/]+/(accept|dismiss)$"
)


def _author(request: Request) -> str | None:
    return web_of(request).settings.reviewer


@router.api_route("/chat/portals/{portal}/{rest:path}", methods=["POST", "PUT", "DELETE"])
async def process_write(request: Request, portal: str, rest: str) -> JSONResponse:
    """Forward one process write, signed (FR-004: every revision has its author)."""
    if not WRITE_PATH.match(rest):
        return JSONResponse({"ref": None, "message": "This address does not exist."}, 404)
    if not same_origin(request):
        return chat_refused()
    author = _author(request)
    if not author:
        return invalid("Set PATHFINDER_REVIEWER to your name to change processes.")
    body = {**(await read_json(request)), "author": author}
    path = f"/portals/{quote(portal, safe='')}/{rest}"
    return await forward(web_of(request), request.method, path, body)


def list_values(
    c: Ctx, conn: sqlite3.Connection, portal: str | None, page: str | None = None
) -> dict[str, Any]:
    paged = pager.paginate(
        queries_processes.portal_processes(conn, portal), pager.page_number(page)
    )
    return {
        "rows": paged.items,
        "pages": pager.links(paged, lambda n: c.url("/processes", page=n)),
        "suggestions": queries_processes.open_suggestions(conn, portal),
        "loose": queries_processes.loose_screens(conn, portal),
        "stages": queries_processes.STAGES,
    }


@router.get("/processes", response_class=HTMLResponse)
def processes_page(
    request: Request, env: str | None = None, page: str | None = None
) -> HTMLResponse:
    web = web_of(request)
    c = web.ctx(request, env)
    try:
        with c.conn() as conn:
            v = list_values(c, conn, c.portal, page)
    except db.StoreMissing as err:
        return web.missing(c, err)
    return web.render(c, "salvage/processes.html", nav_current="processes", v=v)


def _parent_steps(view: queries_processes.ProcessView, label: str) -> list[dict[str, Any]]:
    """The steps of the revision variant `label` was branched from (what Compare diffs it to)."""
    vv = view.variant(label)
    if vv is None or vv.variant.branched_from_variant_id is None:
        return []
    parent = next(
        (p for p in view.variants if p.variant.id == vv.variant.branched_from_variant_id), None
    )
    rev = parent.revision(vv.variant.branched_from_rev or 0) if parent else None
    return list(rev.steps) if rev else []


def editor_values(
    c: Ctx, view: queries_processes.ProcessView, label: str, step: str | None
) -> dict[str, Any]:
    """Screen 05: the variant shown, this reviewer's draft, and the rows against its parent."""
    vv = view.variant(label) or view.as_is
    assert vv is not None
    draft = vv.draft_of(c.settings.reviewer) if vv.variant.kind == "to_be" else None
    steps = list(draft.steps) if draft else vv.steps
    parent = _parent_steps(view, vv.variant.label)
    rows = process_diff.diff(parent, steps) if parent else []
    changes = {r.right["id"]: r.change for r in rows if r.right}
    head_steps = vv.steps
    return {
        "view": view,
        "vv": vv,
        "draft": draft,
        "steps": steps,
        "changes": changes,
        "removed": [r for r in rows if r.change == "removed"],
        "parent": {s["id"]: s for s in parent},
        "pending": 0 if draft is None else _pending(head_steps, steps),
        "selected": next((s for s in steps if s["id"] == step), None),
        "conflict": draft is not None and draft.base_rev != vv.variant.rev,
        "self_url": c.url(f"/fragments/processes/{view.process.key}", variant=vv.variant.label),
    }


def _pending(head: list[dict[str, Any]], draft: list[dict[str, Any]]) -> int:
    """How many steps the draft adds, removes or changes against the revision it edits."""
    by_id = {s["id"]: s for s in head}
    changed = sum(1 for s in draft if by_id.get(s["id"]) != s)
    removed = len(set(by_id) - {s["id"] for s in draft})
    return changed + removed


def _view_or_404(c: Ctx, conn: sqlite3.Connection, key: str) -> queries_processes.ProcessView:
    view = queries_processes.process_view(conn, c.portal or "", key)
    if view is None:
        raise LookupError(key)
    return view


@router.get("/processes/{key}", response_class=HTMLResponse)
def process_page(
    request: Request,
    key: str,
    env: str | None = None,
    variant: str = "A",
    step: str | None = None,
) -> HTMLResponse:
    web = web_of(request)
    c = web.ctx(request, env)
    try:
        with c.conn() as conn:
            view = _view_or_404(c, conn, key)
            v = editor_values(c, view, variant, step)
    except db.StoreMissing as err:
        return web.missing(c, err)
    except LookupError:
        return web.render(c, "salvage/process_missing.html", status_code=404, key=key)
    return web.render(c, "salvage/process.html", nav_current="processes", v=v)


@router.get("/fragments/processes/{key}", response_class=HTMLResponse)
def fragment_process(
    request: Request, key: str, env: str | None = None, variant: str = "A", step: str | None = None
) -> HTMLResponse:
    web = web_of(request)
    c = web.ctx(request, env)
    try:
        with c.conn() as conn:
            v = editor_values(c, _view_or_404(c, conn, key), variant, step)
    except db.StoreMissing as err:
        return web.missing(c, err, fragment=True)
    except LookupError:
        return HTMLResponse("", status_code=404)
    return web.render(c, "salvage/partials/process_editor.html", v=v)


def compare_values(
    conn: sqlite3.Connection,
    view: queries_processes.ProcessView,
    left: str,
    right: str,
    reviewer: str | None,
) -> dict[str, Any]:
    """Screen 06: the step diff of two variants (a person's draft on the right when open) and the
    change spec: the newest saved revision for this pair, else freshly generated."""
    lv, rv = view.variant(left) or view.as_is, view.variant(right)
    if rv is None:
        rv = next((v for v in view.variants if v.variant.kind == "to_be"), None)
    assert lv is not None
    draft = rv.draft_of(reviewer) if rv else None
    right_steps = list(draft.steps) if draft else (rv.steps if rv else [])
    rows = process_diff.diff(lv.steps, right_steps)
    states = [s["state_id"] for s in lv.steps if s.get("state_id")]
    right_label = f"{rv.variant.label} r{rv.variant.rev + (1 if draft else 0)}" if rv else "—"
    generated = change_spec.generate(
        change_spec.SpecInput(
            name=view.process.name,
            persona=view.process.persona,
            environment=None,
            left_label=f"{lv.variant.label} r{lv.variant.rev}",
            right_label=right_label + (" draft" if draft else ""),
            left_steps=lv.steps,
            right_steps=right_steps,
            rows=rows,
            scans=queries_processes.scans_of(conn, states),
            records=queries_processes.citing_records(conn, states),
        )
    )
    saved = next(
        (
            s
            for s in view.specs
            if rv and s.left_variant_id == lv.variant.id and s.right_variant_id == rv.variant.id
        ),
        None,
    )
    return {
        "view": view,
        "left": lv,
        "right": rv,
        "draft": draft,
        "rows": rows,
        "counts": process_diff.counts(rows),
        "sections": saved.sections if saved else generated,
        "saved": saved,
        "spec_head": view.specs[0].rev if view.specs else None,
        "section_titles": change_spec.SECTIONS,
        "right_label": right_label,
    }


@router.get("/processes/{key}/compare", response_class=HTMLResponse)
def compare_page(
    request: Request, key: str, env: str | None = None, left: str = "A", right: str = "B"
) -> HTMLResponse:
    web = web_of(request)
    c = web.ctx(request, env)
    try:
        with c.conn() as conn:
            v = compare_values(conn, _view_or_404(c, conn, key), left, right, c.settings.reviewer)
    except db.StoreMissing as err:
        return web.missing(c, err)
    except LookupError:
        return web.render(c, "salvage/process_missing.html", status_code=404, key=key)
    return web.render(c, "salvage/process_compare.html", nav_current="processes", v=v)


def history_values(view: queries_processes.ProcessView, reviewer: str | None) -> dict[str, Any]:
    """Screen 07: which revision runs where, each variant's revisions newest first, the reviewer's
    drafts that sit on an older revision (the conflict notice), and the process's own timeline."""
    labels = {v.variant.id: v.variant.label for v in view.variants}
    live_now = {
        (lv.label, lv.rev): [
            e.environment for e in view.live if (e.label, e.rev) == (lv.label, lv.rev)
        ]
        for lv in view.live
    }
    conflicts = [
        (v, d)
        for v in view.variants
        for d in [v.draft_of(reviewer)]
        if d is not None and v.variant.kind == "to_be" and d.base_rev != v.variant.rev
    ]
    return {
        "view": view,
        "environments": queries_processes.ENVIRONMENTS,
        "labels": labels,
        "live_now": live_now,
        "conflicts": conflicts,
        "revision_count": sum(len(v.revisions) for v in view.variants),
        "marked_in": [lv.environment for lv in view.live],
    }


@router.get("/processes/{key}/history", response_class=HTMLResponse)
def history_page(request: Request, key: str, env: str | None = None) -> HTMLResponse:
    web = web_of(request)
    c = web.ctx(request, env)
    try:
        with c.conn() as conn:
            v = history_values(_view_or_404(c, conn, key), c.settings.reviewer)
    except db.StoreMissing as err:
        return web.missing(c, err)
    except LookupError:
        return web.render(c, "salvage/process_missing.html", status_code=404, key=key)
    return web.render(c, "salvage/process_history.html", nav_current="processes", v=v)


@router.get("/processes/{key}/spec.md", response_model=None)
def spec_export(
    request: Request, key: str, env: str | None = None, left: str = "A", right: str = "B"
) -> Response:
    """Export spec (FE-P03): the Markdown of what Compare shows."""
    web = web_of(request)
    c = web.ctx(request, env)
    try:
        with c.conn() as conn:
            v = compare_values(conn, _view_or_404(c, conn, key), left, right, c.settings.reviewer)
    except (db.StoreMissing, LookupError):
        return PlainTextResponse("This process does not exist.", status_code=404)
    body = change_spec.to_markdown(v["view"].process.name, v["sections"])
    name = f"{key}-change-spec.md"
    return Response(
        body,
        media_type="text/markdown; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{name}"'},
    )
