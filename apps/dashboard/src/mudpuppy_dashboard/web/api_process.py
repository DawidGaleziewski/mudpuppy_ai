"""The React console's one process (R-96, spec 058; designer screens 05, v2-10). Read-only, no SQL
here (G-15); its writes are in `api_processes.py` with the list's."""

from __future__ import annotations

import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel

from .. import queries_app_process, queries_app_process_compare, queries_processes
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
        shown = queries_app_process.Shown(q.model, q.step, web.settings.reviewer)
        page = queries_app_process.process_page(conn, portal, key, shown)
    if page is None:
        raise HTTPException(404, f"There is no process {key} in {portal}.")
    return page


@contextmanager
def _view(
    request: Request, portal: str, key: str, env: str | None
) -> Iterator[tuple[sqlite3.Connection, queries_processes.ProcessView, str | None]]:
    """The store, the process and the reviewer looking at it; 404 for an unknown process."""
    web = web_of(request)
    c = web.ctx(request, env)
    known_portal(web, c, portal)
    with store(c) as conn:
        view = queries_processes.process_view(conn, portal, key)
        if view is None or view.as_is is None:
            raise HTTPException(404, f"There is no process {key} in {portal}.")
        yield conn, view, web.settings.reviewer


class CompareQuery(BaseModel):
    """The two models compared (A and the first to-be by default)."""

    env: str | None = None
    left: str = "A"
    right: str = "B"


@router.get("/processes/{key}/compare")
def compare(
    request: Request, portal: str, key: str, q: Annotated[CompareQuery, Query()]
) -> queries_app_process_compare.CompareOut:
    """Screen 06: the step diff of two models and their change spec."""
    with _view(request, portal, key, q.env) as (conn, view, who):
        return queries_app_process_compare.compare(conn, view, (q.left, q.right), who)


@router.get("/processes/{key}/history")
def history(
    request: Request, portal: str, key: str, env: str | None = None
) -> queries_app_process_compare.HistoryOut:
    """Screen 07: which model runs where, every revision, the process's and the specs'."""
    with _view(request, portal, key, env) as (_conn, view, who):
        return queries_app_process_compare.history(view, who)
