"""The React console's one process (R-96, spec 058; designer screens 05, v2-10). Read-only, no SQL
here (G-15); its writes are in `api_processes.py` with the list's."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel

from .. import queries_app_process
from .api_common import known_portal, store
from .deps import web_of

router = APIRouter(prefix="/api/portals/{portal}")


class ProcessQuery(BaseModel):
    """The model shown (its default when left out) and the step selected."""

    env: str | None = None
    model: str | None = None
    step: str | None = None


@router.get("/processes/{key}")
def process_page(
    request: Request, portal: str, key: str, q: Annotated[ProcessQuery, Query()]
) -> queries_app_process.ProcessPage:
    """One process with the model asked for (A until a to-be design starts) and its step."""
    web = web_of(request)
    c = web.ctx(request, q.env)
    known_portal(web, c, portal)
    with store(c) as conn:
        page = queries_app_process.process_page(conn, portal, key, q.model, q.step)
    if page is None:
        raise HTTPException(404, f"There is no process {key} in {portal}.")
    return page
