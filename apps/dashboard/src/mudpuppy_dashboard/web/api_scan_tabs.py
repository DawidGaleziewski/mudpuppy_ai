"""The React console's scan sections (R-96, spec 055): one route per htmx `/runs/{id}` tab (States,
Actions, Frontier, Forms, Network, Robots, Decisions, Docs). Read-only, no SQL here (G-15)."""

from __future__ import annotations

import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel

from .. import queries
from .. import queries_app_scan_tabs as tabs
from .api_common import store
from .deps import web_of

router = APIRouter(prefix="/api/scans/{scan}")


class ActionsQuery(BaseModel):
    """Actions' filters: the safety class, the decision (1 allowed, 0 skipped), the page."""

    env: str | None = None
    safety_class: str | None = None
    allowed: str | None = None
    cursor: str | None = None


class DecisionsQuery(BaseModel):
    """The decision log's filters: the kind, the rule, the page."""

    env: str | None = None
    kind: str | None = None
    rule: str | None = None
    cursor: str | None = None


@contextmanager
def _scan(request: Request, scan: str, env: str | None) -> Iterator[sqlite3.Connection]:
    """The store, after a 404 for a scan it does not have."""
    c = web_of(request).ctx(request, env)
    with store(c) as conn:
        if queries.get_run(conn, scan) is None:
            raise HTTPException(404, f"There is no scan {scan} in this store.")
        yield conn


def _at(request: Request, cursor: str | None) -> tabs.PageAt:
    return tabs.PageAt(cursor or None, web_of(request).settings.page_size)


@router.get("/states")
def states(request: Request, scan: str, env: str | None = None) -> list[tabs.StateRow]:
    """The screens the scan observed, in the order it saw them."""
    with _scan(request, scan, env) as conn:
        return tabs.states(conn, scan)


@router.get("/actions")
def actions(request: Request, scan: str, q: Annotated[ActionsQuery, Query()]) -> tabs.ActionsTab:
    """The actions extracted, by safety class and decision, one page at a time."""
    with _scan(request, scan, q.env) as conn:
        return tabs.actions(conn, scan, q.safety_class, q.allowed, _at(request, q.cursor))


@router.get("/frontier")
def frontier(
    request: Request,
    scan: str,
    env: str | None = None,
    status: str | None = None,
    cursor: str | None = None,
) -> tabs.FrontierTab:
    """The queue of actions planned, done or refused."""
    with _scan(request, scan, env) as conn:
        return tabs.frontier(conn, scan, status, _at(request, cursor))


@router.get("/forms")
def forms(request: Request, scan: str, env: str | None = None) -> list[tabs.FormRow]:
    with _scan(request, scan, env) as conn:
        return tabs.forms(conn, scan)


@router.get("/network")
def network(
    request: Request, scan: str, env: str | None = None, cursor: str | None = None
) -> tabs.Paged[tabs.NetworkRow]:
    """The network calls' shapes (never their bodies)."""
    with _scan(request, scan, env) as conn:
        return tabs.network(conn, scan, _at(request, cursor))


@router.get("/robots")
def robots(request: Request, scan: str, env: str | None = None) -> list[tabs.RobotsRow]:
    with _scan(request, scan, env) as conn:
        return tabs.robots(conn, scan)


@router.get("/decisions")
def decisions(
    request: Request, scan: str, q: Annotated[DecisionsQuery, Query()]
) -> tabs.DecisionsTab:
    """The decision log: its groups by kind and rule, and one page of entries."""
    with _scan(request, scan, q.env) as conn:
        return tabs.decisions(conn, scan, q.kind, q.rule, _at(request, q.cursor))


@router.get("/docs")
def docs(
    request: Request, scan: str, env: str | None = None, cursor: str | None = None
) -> tabs.Paged[tabs.DocRow]:
    """The records whose latest revision cites this scan, with what they cite."""
    with _scan(request, scan, env) as conn:
        return tabs.docs(conn, scan, _at(request, cursor))
