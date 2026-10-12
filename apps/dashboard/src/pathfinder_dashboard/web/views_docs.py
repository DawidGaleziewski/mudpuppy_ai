"""What the documentation pages and their fragments need (spec 004, R-15), built once for page and
fragment: indexes, SRS sections, sessions and the record page."""

from __future__ import annotations

import sqlite3
from typing import Any

from .. import diagrams, queries_docs, visuals
from .deps import Ctx


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
        "figures": visuals.record_figures(conn, c.data_dir, detail.evidence),
        "figures_open": visuals.FIGURES_OPEN,
        "panel": panel,
        "header_url": c.url(f"{base}/header", rev=rev_arg),
        "body_url": c.url(f"{base}/body", rev=rev_arg),
        "reviews_url": reviews_url,
        "rev_arg": rev_arg,
    }
