"""What the React console's JSON routers (`web/api_*.py`) share (R-96): the store connection that
answers 404 with a reason, and the check that a portal exists. Not a router (G-13)."""

from __future__ import annotations

import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager

from fastapi import HTTPException, Request

from .. import db, queries, queries_app_home
from ..queries_app_scan_tabs import PageAt
from .deps import Ctx, Web, web_of

NO_STORE = "This store does not exist yet. Start a scan first."


@contextmanager
def store(c: Ctx) -> Iterator[sqlite3.Connection]:
    """The store, or 404 with the way on when it does not exist yet."""
    try:
        with c.conn() as conn:
            yield conn
    except db.StoreMissing as e:
        raise HTTPException(404, NO_STORE) from e


@contextmanager
def scan_store(request: Request, scan: str, env: str | None) -> Iterator[sqlite3.Connection]:
    """The store, after a 404 for a scan it does not have."""
    c = web_of(request).ctx(request, env)
    with store(c) as conn:
        if queries.get_run(conn, scan) is None:
            raise HTTPException(404, f"There is no scan {scan} in this store.")
        yield conn


def page_at(request: Request, cursor: str | None) -> PageAt:
    """A paged section's start (the API's cursor) at the dashboard's page size."""
    return PageAt(cursor or None, web_of(request).settings.page_size)


def known_portal(web: Web, c: Ctx, portal: str) -> None:
    """404 for a portal that is neither configured nor scanned in this store."""
    if (web.settings.portals_dir / portal / "portal.yaml").is_file():
        return
    try:
        with c.conn() as conn:
            if queries_app_home.portal_scanned(conn, portal):
                return
    except db.StoreMissing:
        pass
    raise HTTPException(404, f"There is no portal {portal} here.")
