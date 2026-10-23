"""The React console's Recorded pages (R-96, spec 054): Screens' view of every recorded page of a
portal, 25 a page (R-71), over `queries_screens` and `queries_suites` as typed JSON. Statuses
come mapped; pictures come as URLs the dashboard serves."""

from __future__ import annotations

import sqlite3

from pydantic import BaseModel

from . import pager, queries_screens, queries_suites
from .queries_app import StatusOut, status_out


class RecordedPage(BaseModel):
    #: The recorded state (the htmx screen page's address).
    state: str
    title: str
    route: str
    #: The screenshot's URL; None: the page has only a wireframe.
    picture: str | None
    confidence: StatusOut
    #: An open Probe mark on its form step.
    probe_marked: bool
    #: Probed · n, or Not probed; None when it is no form step.
    probe: StatusOut | None
    scans: int
    personas: list[str]
    last_seen: str | None


class RecordedPages(BaseModel):
    portal: str
    q: str
    page: int
    pages: int
    #: Pages matching `q`; `every` without the filter.
    total: int
    every: int
    rows: list[RecordedPage]
    #: Form steps counted once: how many, marked for probing, never probed.
    steps: int
    steps_marked: int
    steps_unprobed: int


def _probe(cov: queries_suites.StepCoverage | None) -> StatusOut | None:
    if cov is None:
        return None
    if cov.outcomes:
        s = status_out("probe_coverage", "probed")
        return StatusOut(shape=s.shape, word=f"{s.word} · {cov.outcomes}")
    return status_out("probe_coverage", "unprobed")


def recorded_pages(
    conn: sqlite3.Connection, portal: str, q: str, page: str | None
) -> RecordedPages:
    """One page of the portal's recorded pages, filtered by title or route."""
    q = q.strip()
    paged = pager.paged_from_count(
        queries_screens.count_screens(conn, portal, q),
        pager.page_number(page),
        lambda limit, offset: queries_screens.portal_screens(conn, portal, q, limit, offset),
    )
    coverage = queries_suites.step_coverage(conn, portal)
    steps = queries_suites.step_summary(coverage)
    rows = []
    for r in paged.items:
        st, cov = r.state, coverage.get(r.state.id)
        rows.append(
            RecordedPage(
                state=st.id,
                title=st.title,
                route=st.route_template,
                picture=f"/evidence/{st.screenshot_ref}" if st.screenshot_ref else None,
                confidence=status_out("confidence", st.confidence),
                probe_marked=bool(cov and cov.marked),
                probe=None if cov is None or cov.marked else _probe(cov),
                scans=r.runs,
                personas=r.personas,
                last_seen=r.last_seen,
            )
        )
    return RecordedPages(
        portal=portal,
        q=q,
        page=paged.page,
        pages=paged.pages,
        total=paged.total,
        every=queries_screens.count_screens(conn, portal) if q else paged.total,
        rows=rows,
        steps=steps.total,
        steps_marked=steps.marked,
        steps_unprobed=steps.unprobed,
    )
