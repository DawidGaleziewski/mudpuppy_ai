"""The React console's Docs (R-96, spec 066; spec 004 R-15): a portal's documentation as an SRS,
one section at a time, filtered and paged by cursor. Read-only. No SQL here (G-15)."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Query, Request
from pydantic import BaseModel

from .. import queries_app_docs
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
