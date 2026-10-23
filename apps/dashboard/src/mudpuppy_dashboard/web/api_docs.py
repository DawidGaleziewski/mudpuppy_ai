"""The React console's Docs (R-96, specs 066 and 067; spec 004 R-15): a portal's documentation
as an SRS, one section at a time, filtered and paged by cursor; one record; one analysis session.
Read-only: a record's review is `…/review/records/{key}` (`web/api_review.py`), opening a process
record in Processes is `…/processes/from-record` (`web/api_processes.py`). No SQL here (G-15)."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel

from .. import queries_app_doc, queries_app_doc_session, queries_app_docs
from .api_common import known_portal, page_at, store
from .deps import web_of

router = APIRouter(prefix="/api/portals/{portal}/docs")


class DocsParams(BaseModel):
    """The page's query: the section, its filters and the API's cursor."""

    env: str | None = None
    section: str = "overview"
    kind: str | None = None
    status: str | None = None
    confidence: str | None = None
    flag: str | None = None
    cursor: str | None = None


@router.get("/sessions/{session}")
def session_page(
    request: Request,
    portal: str,
    session: str,
    env: str | None = None,
    cursor: str | None = None,
) -> queries_app_doc_session.SessionPage:
    web = web_of(request)
    c = web.ctx(request, env)
    known_portal(web, c, portal)
    with store(c) as conn:
        page = queries_app_doc_session.session_page(conn, portal, session, page_at(request, cursor))
    if page is None:
        raise HTTPException(404, f"There is no analysis session {session} for {portal}.")
    return page


class RecordParams(BaseModel):
    """One record's query: the revision `rev` (the latest when left out); `list` the Docs list it
    was opened from, for Prev / Next."""

    env: str | None = None
    rev: int | None = None
    list: str | None = None


@router.get("/{key}")
def record_page(
    request: Request, portal: str, key: str, q: Annotated[RecordParams, Query()]
) -> queries_app_doc.RecordPage:
    web = web_of(request)
    c = web.ctx(request, q.env)
    known_portal(web, c, portal)
    ask = queries_app_doc.RecordAsk(
        key=key, rev=q.rev, list_url=q.list, reviewer=bool(web.settings.reviewer)
    )
    with store(c) as conn:
        page = queries_app_doc.record_page(conn, c.data_dir, portal, ask)
    if page is None:
        raise HTTPException(404, f"There is no record {key} in {portal}.")
    return page


@router.get("")
def docs_page(
    request: Request, portal: str, q: Annotated[DocsParams, Query()]
) -> queries_app_docs.DocsPage:
    web = web_of(request)
    c = web.ctx(request, q.env)
    known_portal(web, c, portal)
    asked = queries_app_docs.DocsQuery(q.section, q.kind, q.status, q.confidence, q.flag)
    with store(c) as conn:
        return queries_app_docs.docs_page(conn, portal, asked, page_at(request, q.cursor))
