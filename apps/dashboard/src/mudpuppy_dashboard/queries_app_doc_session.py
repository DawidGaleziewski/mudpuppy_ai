"""The React console's analysis session (R-96, spec 067; spec 004 R-15): what the BA agent read
(its input scans), the passes it completed, the records it created or revised (paged by cursor)
and the gaps it reported. Built over `queries_docs.session_detail`; statuses come mapped."""

from __future__ import annotations

import sqlite3

from pydantic import BaseModel

from . import queries_docs as qd
from .formats import short_id
from .queries_app import StatusOut, status_out
from .queries_app_doc import Ref, record_href, scan_href
from .queries_app_scan_tabs import PageAt


class InputScan(BaseModel):
    scan: Ref
    mode: str
    persona: str
    status: StatusOut
    started_at: str


class Pass(BaseModel):
    name: str
    summary: str | None
    completed_at: str | None


class Written(BaseModel):
    key: str
    title: str
    href: str
    change: str
    status: StatusOut
    confidence: StatusOut


class SessionPage(BaseModel):
    portal: str
    id: str
    status: StatusOut
    started_at: str
    ended_at: str | None
    summary: str | None
    scans: list[InputScan]
    passes: list[Pass]
    written: list[Written]
    written_total: int
    next_cursor: str | None
    gaps: list[str]


def _passes(raw: object) -> list[Pass]:
    if not isinstance(raw, list):
        return []
    out = []
    for p in raw:
        d = p if isinstance(p, dict) else {"pass": str(p)}
        name, summary, done = d.get("pass"), d.get("summary"), d.get("completed_at")
        out.append(Pass(name=str(name or "—"), summary=summary, completed_at=done))
    return out


def session_page(
    conn: sqlite3.Connection, portal: str, session: str, at: PageAt
) -> SessionPage | None:
    d = qd.session_detail(conn, portal, session, at.cursor, at.limit)
    if d is None:
        return None
    s = d.session
    return SessionPage(
        portal=portal,
        id=s.id,
        status=status_out("run", s.status),
        started_at=s.started_at,
        ended_at=s.ended_at,
        summary=s.summary,
        scans=[
            InputScan(
                scan=Ref(label=short_id(r.id), href=scan_href(r.id), title=r.id),
                mode=r.mode,
                persona=r.persona_id,
                status=status_out("run", r.status),
                started_at=r.started_at,
            )
            for r in d.runs
        ],
        passes=_passes(s.passes_json),
        written=[
            Written(
                key=w.record.key,
                title=w.record.title,
                href=record_href(portal, w.record.key),
                change=d.changes.get(w.record.id, ""),
                status=status_out("doc", w.status),
                confidence=status_out("confidence", w.confidence),
            )
            for w in d.written
        ],
        written_total=d.written_total,
        next_cursor=d.next_cursor,
        gaps=[str(g) for g in s.gaps_json] if isinstance(s.gaps_json, list) else [],
    )
