"""The React console's Before / after (R-96, spec 064; designer screen v2-03, 12-v2-ux § 6): one
change's two recorded pages with the changed region, what differs between their contexts, the
explanation with its tests, where it shows, and Previous / Next among the changes that need you.
Built over the read model `queries_change_detail`."""

from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import Literal

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


class Gone(BaseModel):
    """Where the change is not, on the other side's picture, in percent of that picture (designer
    Q5a): a `box` at the region's place for things that float, a `line` at the insertion point when
    the region was inserted and pushed the content below it (that page is shorter by its height)."""

    shape: Literal["box", "line"]
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
    gone: Gone | None  # "Not here" on the unmarked side
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


def side_out(s: Side, has: bool) -> SideOut:
    """One recorded side of a comparison (Before / after, Same screen?)."""
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


def _page_height(data_dir: Path, ref: str | None) -> float | None:
    layout = visuals.load_layout(data_dir, ref)
    return float(layout.page.height) if layout and layout.page.height else None


def _gone(data_dir: Path, d: ChangeDetail, r: Region | None) -> Gone | None:
    """The "Not here" mark on the unmarked side. Inserted when the marked page is taller by the
    region's height (within 15 %, at least 8 px); without both heights, a box (the safe default)."""
    if r is None:
        return None
    here, other = (d.before, d.after) if d.marked_side == "before" else (d.after, d.before)
    h_here, h_other = (
        _page_height(data_dir, here.layout_ref),
        _page_height(data_dir, other.layout_ref),
    )
    if not (h_here and h_other):
        return Gone(shape="box", **r.model_dump())
    region_px, top_px = r.height * h_here / 100, r.top * h_here / 100
    inserted = abs(h_here - h_other - region_px) <= max(8.0, 0.15 * region_px)
    if inserted:
        return Gone(shape="line", left=r.left, top=top_px * 100 / h_other, width=r.width, height=0)
    return Gone(
        shape="box",
        left=r.left,
        top=top_px * 100 / h_other,
        width=r.width,
        height=region_px * 100 / h_other,
    )


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
        before=side_out(d.before, d.marked_side == "before"),
        after=side_out(d.after, d.marked_side == "after"),
        region=(region := _region(data_dir, d)),
        gone=_gone(data_dir, d, region),
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
