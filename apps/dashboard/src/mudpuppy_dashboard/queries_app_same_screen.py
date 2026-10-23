"""The React console's Same screen? (R-100, spec 071; spec 039 T100, designer v2-14, UX-R34): one
pair of page versions side by side, conflicts first, and the three answers, as typed JSON over
`queries_same_screen`."""

from __future__ import annotations

import sqlite3

from pydantic import BaseModel

from . import queries_same_screen
from .queries_app_change import SideOut, side_out


class Label(BaseModel):
    answer: str
    by: str
    at: str
    reason: str | None


class Version(BaseModel):
    state: str
    screen_key: str | None
    screen_title: str | None


class Differ(BaseModel):
    label: str
    before: str
    after: str


class PairOut(BaseModel):
    a: Version
    b: Version
    sides: tuple[SideOut, SideOut]
    #: 0..1, MinHash of the two versions; None when one has no signature.
    similarity: float | None
    #: What automatic grouping says: same or different.
    model_answer: str
    label: Label | None
    conflict: bool
    differs: list[Differ]
    #: The process that walks this screen: (key, name).
    process: tuple[str, str] | None
    #: 1-based in the queue; 0 when not in it.
    position: int
    total: int
    next_pair: tuple[str, str] | None
    earlier: list[Label]


class SameScreenPage(BaseModel):
    portal: str
    screen: str | None
    tau: float | None
    window: float
    #: The three answers with their words, in the keys' order (1, 2, 3).
    answers: list[tuple[str, str]]
    pair: PairOut | None


def _label(x: queries_same_screen.Label | None) -> Label | None:
    return Label(answer=x.answer, by=x.by, at=x.at, reason=x.reason) if x else None


def _version(v: queries_same_screen.Version) -> Version:
    return Version(state=v.state_id, screen_key=v.screen_key, screen_title=v.screen_title)


def _pair(d: queries_same_screen.PairDetail) -> PairOut:
    p = d.pair
    return PairOut(
        a=_version(p.a),
        b=_version(p.b),
        sides=(side_out(d.a, False), side_out(d.b, False)),
        similarity=p.similarity,
        model_answer=p.model_answer,
        label=_label(p.label),
        conflict=p.conflict,
        differs=[
            Differ(label=x.label, before=x.before, after=x.after) for x in d.differs if x.differs
        ],
        process=d.process,
        position=d.position,
        total=d.total,
        next_pair=d.next_pair,
        earlier=[e for e in (_label(x) for x in d.earlier) if e],
    )


def same_screen_page(
    conn: sqlite3.Connection, portal: str, screen: str | None, pick: tuple[str | None, str | None]
) -> SameScreenPage:
    """The pair `pick` (a, b), or the first in the queue (of one screen with `screen`); `pair` is
    None when nothing is left to compare."""
    a, b = pick
    if not (a and b):
        first = queries_same_screen.queue(conn, portal, screen)[:1]
        a, b = (first[0].a.state_id, first[0].b.state_id) if first else (None, None)
    detail = queries_same_screen.pair_detail(conn, portal, a, b, screen) if a and b else None
    return SameScreenPage(
        portal=portal,
        screen=screen,
        tau=queries_same_screen.tau_in_force(conn, portal),
        window=queries_same_screen.LABEL_WINDOW,
        answers=list(queries_same_screen.WORDS.items()),
        pair=_pair(detail) if detail else None,
    )
