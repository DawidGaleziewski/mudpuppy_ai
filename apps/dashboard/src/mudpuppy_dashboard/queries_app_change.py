"""The React console's Before / after (R-96, spec 064; designer screen v2-03, 12-v2-ux § 6): one
change's two recorded pages with the changed region, what differs between their contexts, the
explanation with its tests, where it shows, and Previous / Next among the changes that need you.
Built over the htmx page's read model (`queries_change_detail`)."""

from __future__ import annotations

import sqlite3
from pathlib import Path

from pydantic import BaseModel

from . import visuals
from .queries_app import StatusOut, status_out
from .queries_app_changes import ChangeRow, changes_href, row_of
from .queries_app_review_detail import Option
from .queries_app_screens import OBSERVED
from .queries_change_detail import ChangeDetail, Side, change_detail
from .queries_change_detail import Test as ChangeTest


class Region(BaseModel):
    """The changed element's box on the screenshots, in percent of the image."""

    left: float
    top: float
    width: float
    height: float


class SideOut(BaseModel):
    label: str
    note: str  # one line of what this side shows
    state_id: str | None
    title: str | None
    route: str | None
    shot: str | None  # evidence URLs
    wire: str | None
    #: "Observed" when this side was recorded.
    status: StatusOut | None
    scan: str | None
    at: str | None
    #: The changed element is on this side ("Changed"); the other side draws "Not here".
    has_change: bool


class Differ(BaseModel):
    label: str
    before: str
    after: str
    differs: bool


class Test(BaseModel):
    inputs: str
    result: str | None
    verdict: StatusOut


class Neighbours(BaseModel):
    position: int
    total: int
    prev: str | None
    next: str | None


class ChangePage(BaseModel):
    portal: str
    change: ChangeRow
    screen_key: str | None
    screen_title: str | None
    screen_route: str | None
    process: Option | None  # value PRC key, label name
    before: SideOut
    after: SideOut
    region: Region | None
    differs: list[Differ]
    explained: bool
    hypothesis_status: StatusOut | None
    rule: str | None
    reason: str | None
    tests: list[Test]
    #: The decision bar: a hypothesis waiting for a person, decided through Review.
    decidable: bool
    #: Its rule decides where it leads: Rules shows it.
    rule_link: bool
    neighbours: Neighbours | None
    back: str  # What changed, filtered to the process when there is one


def evidence(ref: str | None) -> str | None:
    return f"/evidence/{ref}" if ref else None


def _side(s: Side, has: bool) -> SideOut:
    pic = s.picture
    return SideOut(
        label=s.label,
        note=s.note,
        state_id=s.state_id,
        title=s.title,
        route=s.route,
        shot=evidence(pic.shot) if pic else None,
        wire=evidence(pic.wire) if pic else None,
        status=OBSERVED if s.state_id else None,
        scan=s.run_id,
        at=s.at,
        has_change=has,
    )


def _region(data_dir: Path, d: ChangeDetail) -> Region | None:
    if not (d.marked_side and d.change.element_key):
        return None
    side = d.before if d.marked_side == "before" else d.after
    mark = visuals.region(data_dir, side.layout_ref, d.change.element_key)
    if mark is None:
        return None
    return Region(left=mark.left, top=mark.top, width=mark.width, height=mark.height)


def _test(t: ChangeTest) -> Test:
    return Test(inputs=t.inputs, result=t.result, verdict=status_out("boundary_test", t.verdict))


def _neighbours(d: ChangeDetail) -> Neighbours | None:
    p = d.position
    if p is None:
        return None
    return Neighbours(position=p, total=len(d.needs_ids), prev=d.neighbour(-1), next=d.neighbour(1))


def change_page(
    conn: sqlite3.Connection, data_dir: Path, portal: str, deviation_id: str
) -> ChangePage | None:
    d = change_detail(conn, portal, deviation_id)
    if d is None:
        return None
    c = d.change
    hstatus = c.hypothesis_status
    return ChangePage(
        portal=portal,
        change=row_of(c),
        screen_key=c.screen_key,
        screen_title=c.screen_title,
        screen_route=c.screen_route,
        process=Option(value=d.process[0], label=d.process[1]) if d.process else None,
        before=_side(d.before, d.marked_side == "before"),
        after=_side(d.after, d.marked_side == "after"),
        region=_region(data_dir, d),
        differs=[
            Differ(label=x.label, before=x.before, after=x.after, differs=x.differs)
            for x in d.differs
        ],
        explained=c.status == "explained",
        hypothesis_status=status_out("hypothesis", hstatus) if hstatus else None,
        rule=c.rule,
        reason=c.reason,
        tests=[_test(t) for t in d.tests],
        decidable=d.decidable,
        rule_link=d.hypothesis_kind in ("decision_point", "decision_drift")
        or c.kind == "rule_mismatch",
        neighbours=_neighbours(d),
        back=changes_href(portal, process=d.process[0] if d.process else None),
    )
