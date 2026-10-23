"""The React console's Review page (R-96, spec 062; designer screens v2-04, v2-05, v2-16): the
three tabs, every group of the inbox as rows, the part and age filters, a group's pages, and the
selected item's detail. The rows and statuses come mapped (`status_out`); the app maps nothing.
Built over the htmx page's own queries (`queries_review`, `queries_queue`), so both show the same.
"""

from __future__ import annotations

import sqlite3
from datetime import UTC, datetime
from typing import Any, NamedTuple

from pydantic import BaseModel

from . import pager, queries_queue, queries_review, queries_same_screen
from . import queries_app_review_detail as review_detail
from .queries_app import Chip, StatusOut, status_out
from .queries_app_review_detail import Option
from .queries_app_review_rows import EMPTY, ReviewRow, row_of
from .queries_queue import QueueItem

KIND_KEYS = tuple(k for k, _ in queries_review.KINDS)
LABELS = dict(queries_review.KINDS)
#: The groups a person decides here (confirm or reject, alone, alike or selected).
DECIDED_HERE = ("findings", "rules", "removals")
TABS = ("needs", "explained", "decided")
ALL_ROWS = 10  # "All" shows the first rows of each group; its own tab lists them all


class Alike(BaseModel):
    """The system's group of alike items (designer § 5.4): one decision, one reason, one Undo."""

    label: str
    keys: list[str]
    count: int


class Group(BaseModel):
    kind: str
    label: str
    count: int
    rows: list[ReviewRow]
    #: Shown when the group is empty and its tab is open.
    empty: str
    alike: list[Alike] = []
    page: int = 1
    pages: int = 1
    #: Its items are confirmed or rejected here (alone, alike or selected) by the named reviewer.
    decides: bool = False


class Filters(BaseModel):
    """Part and age over the portal model's groups, with counts (designer § 5.1)."""

    parts: list[Option]
    ages: list[Option]
    part: str | None
    age: str | None
    active: bool


class AlsoPair(BaseModel):
    """A Same screen? pair a confirm also settles (designer § 5.5)."""

    a: str
    b: str
    label: str
    conflict: bool
    answered_by: str | None


class Cited(BaseModel):
    state: str
    title: str
    route: str
    picture: str | None


class Detail(BaseModel):
    """The selected item: its row, and what its kind adds."""

    row: ReviewRow
    #: The detail and writes live in React; otherwise `htmx` opens the htmx Review on it.
    in_react: bool
    htmx: str
    text: str | None = None
    link: Option | None = None
    also: list[AlsoPair] = []
    #: A record: its revision, how many, the screens it cites.
    rev: int | None = None
    revs: int | None = None
    cited: list[Cited] = []
    #: The kind's own facts (spec 063): at most one is set.
    difference: review_detail.DifferenceDetail | None = None
    reanchor: review_detail.ReanchorDetail | None = None
    proposal: review_detail.ProposalDetail | None = None
    suite: review_detail.SuiteDetail | None = None


class Neighbours(BaseModel):
    index: int
    total: int
    label: str
    prev: str | None
    next: str | None


class ExplainedRow(BaseModel):
    id: str
    word: str
    screen: str | None
    finding: str
    explanation: Chip
    explanation_text: str
    rule: str | None
    at: str


class DecidedRow(BaseModel):
    key: str
    kind: str
    claim: str
    status: StatusOut
    undone: bool
    actor: str
    reason: str | None
    at: str
    is_rule: bool


class ReviewPage(BaseModel):
    portal: str
    #: Decisions are on: a reviewer is named.
    decides: bool
    tab: str
    total: int
    explained_count: int
    decided_count: int
    same_screen_pairs: int
    kinds: list[Option]
    counts: dict[str, int]
    show: str | None
    groups: list[Group] = []
    #: "All": the groups with nothing in them.
    empty_kinds: list[Option] = []
    filters: Filters | None = None
    reasons: dict[str, list[str]] = {}
    selected: Detail | None = None
    neighbours: Neighbours | None = None
    explained: list[ExplainedRow] = []
    decided: list[DecidedRow] = []


class ReviewQuery(NamedTuple):
    """What the page asks for: its tab, a group's tab and page, the selection and the filters."""

    tab: str = "needs"
    show: str | None = None
    select: str | None = None
    page: str | None = None
    part: str | None = None
    age: str | None = None


def _filters(f: queries_queue.Facets) -> Filters:
    return Filters(
        parts=[Option(value=p, label=f"{p} ({n})") for p, n in f.parts],
        ages=[Option(value=k, label=f"{label} ({n})") for k, label, n in f.ages],
        part=f.part,
        age=f.age,
        active=f.active,
    )


def _filtered(
    inbox: queries_review.Inbox, q: ReviewQuery
) -> tuple[queries_review.Inbox, queries_queue.Facets]:
    """The inbox with the part and age filters applied to the portal model's groups."""
    now = datetime.now(UTC)
    facets = queries_queue.facets([getattr(inbox, k) for k in DECIDED_HERE], q.part, q.age, now)
    if facets.active:
        kept = {k: queries_queue.keep(getattr(inbox, k), facets, now) for k in DECIDED_HERE}
        inbox = inbox._replace(**kept)
    return inbox, facets


def _group(inbox: Any, kind: str, show: str | None, page: str | None) -> Group:
    items = getattr(inbox, kind)
    if show:
        paged = pager.paginate(items, pager.page_number(page))
        shown, at, pages = paged.items, paged.page, max(1, -(-paged.total // paged.size))
    else:
        shown, at, pages = items[:ALL_ROWS], 1, 1
    alike = [
        Alike(label=g.label, keys=list(g.keys), count=len(g.ids))
        for g in (inbox.similar(kind) if kind in DECIDED_HERE else [])
    ]
    return Group(
        kind=kind,
        label=LABELS[kind],
        count=len(items),
        rows=[row_of(kind, it) for it in shown],
        empty=EMPTY.get(kind, ""),
        alike=alike,
        page=at,
        pages=pages,
    )


def _selected(inbox: Any, q: ReviewQuery, show: str | None) -> tuple[str, Any] | None:
    """`kind:id` → the item; else the first item of the first shown group that has one."""
    kind, _, ident = (q.select or "").partition(":")
    if kind in KIND_KEYS:
        for it in getattr(inbox, kind):
            if row_of(kind, it).id == ident:
                return kind, it
    for k in KIND_KEYS:
        items = getattr(inbox, k)
        if items and show in (None, k):
            return k, items[0]
    return None


def _neighbours(inbox: Any, kind: str, ident: str) -> Neighbours:
    ids = [row_of(kind, it).id for it in getattr(inbox, kind)]
    i = ids.index(ident)

    def at(j: int) -> str | None:
        return f"{kind}:{ids[j]}" if 0 <= j < len(ids) else None

    return Neighbours(
        index=i + 1, total=len(ids), label=LABELS[kind], prev=at(i - 1), next=at(i + 1)
    )


def _link(portal: str, kind: str, it: QueueItem) -> Option | None:
    """Where a queue item lives: Processes is in React; Before / after and a rule still on htmx."""
    if not it.href:
        return None
    if kind == "processes":
        return Option(
            value=f"/app/portals/{portal}/processes", label="Accept or dismiss it on Processes"
        )
    if kind == "rules" and it.href.startswith("/rules"):
        return Option(value=it.href, label="Open the rule: its decision table and tests")
    return Option(value=it.href, label="Before / after")


def _also(conn: sqlite3.Connection, portal: str, it: QueueItem) -> list[AlsoPair]:
    pairs = queries_same_screen.linked(conn, portal, it.id) if it.keys else []

    def side(v: queries_same_screen.Version) -> str:
        name = v.screen_title or v.state_id[:8]
        return f"{name} r{v.ordinal}" if v.ordinal else name

    return [
        AlsoPair(
            a=p.a.state_id,
            b=p.b.state_id,
            label=f"{side(p.a)} vs {side(p.b)}",
            conflict=p.conflict,
            answered_by=p.label.by if p.label else None,
        )
        for p in pairs
    ]


def _cited(s: queries_review.CitedScreen) -> Cited:
    picture = f"/evidence/{s.screenshot_ref}" if s.screenshot_ref else None
    return Cited(state=s.id, title=s.title or "(untitled page)", route=s.route, picture=picture)


def _own_detail(n: Needs, portal: str, kind: str, it: Any) -> dict[str, Any]:
    """The facts of a difference, an amendment to re-anchor, a proposal or a suite."""
    if kind == "differences":
        return {"difference": review_detail.difference(it, n.attrs)}
    if kind == "reanchor":
        return {"reanchor": review_detail.reanchor(n.conn, it)}
    if kind == "proposals":
        return {"proposal": review_detail.proposal(it)}
    if kind == "suites":
        return {"suite": review_detail.suite(it, portal)}
    return {}


def _detail(n: Needs, portal: str, kind: str, it: Any) -> Detail:
    conn = n.conn
    row = row_of(kind, it)
    htmx = f"/review?portal={portal}&select={kind}:{row.id}"
    own = _own_detail(n, portal, kind, it)
    if own:
        return Detail(row=row, in_react=True, htmx=htmx, **own)
    if kind in ("records", "assumptions"):
        cited = queries_review.cited_screens(conn, portal, it.key, it.rev)
        return Detail(
            row=row,
            in_react=True,
            htmx=htmx,
            rev=it.rev,
            revs=it.total,
            link=Option(value=f"/docs/{portal}/{it.key}", label="Open the full record in Docs"),
            cited=[_cited(s) for s in cited],
        )
    if isinstance(it, QueueItem):
        also = _also(conn, portal, it) if kind == "findings" else []
        return Detail(
            row=row,
            in_react=True,
            htmx=htmx,
            text=it.chip.text or None,
            link=_link(portal, kind, it),
            also=also,
        )
    return Detail(row=row, in_react=False, htmx=htmx)


def _explained(conn: sqlite3.Connection, portal: str) -> list[ExplainedRow]:
    return [
        ExplainedRow(
            id=ch.id,
            word=ch.word,
            screen=ch.screen_key,
            finding=ch.finding,
            explanation=Chip(word=ch.explanation.word, variant=ch.explanation.chip or None),
            explanation_text=ch.explanation.text,
            rule=ch.rule,
            at=ch.created_at,
        )
        for ch in queries_queue.explained(conn, portal)
    ]


def _decided(conn: sqlite3.Connection, portal: str) -> list[DecidedRow]:
    return [
        DecidedRow(
            key=d.key,
            kind=d.kind.replace("_", " "),
            claim=d.claim,
            status=status_out("hypothesis", d.to_status),
            undone=d.undone,
            actor=d.actor,
            reason=d.reason,
            at=d.at,
            is_rule=d.kind == "decision_rule",
        )
        for d in queries_queue.decided(conn, portal)
    ]


class Needs(NamedTuple):
    """What the Needs you tab is built from: the store, the read inbox and the query."""

    conn: sqlite3.Connection
    inbox: queries_review.Inbox
    q: ReviewQuery
    #: Each persona's attributes, for a difference ("age 17, no licence").
    attrs: dict[str, str]


class Viewer(NamedTuple):
    """Who looks and what the store does not hold: decisions on, the personas' attributes."""

    decides: bool
    attrs: dict[str, str]


def _needs(n: Needs, page: ReviewPage) -> None:
    """The Needs you tab: the groups, the filters, the selection and its neighbours."""
    conn, portal, q = n.conn, page.portal, n.q
    inbox, facets = _filtered(n.inbox, q)
    show = page.show
    kinds = [k for k in KIND_KEYS if show in (None, k)]
    page.groups = [_group(inbox, k, show, q.page) for k in kinds if show or getattr(inbox, k)]
    for g in page.groups:
        g.decides = page.decides and g.kind in DECIDED_HERE
    if not show:
        page.empty_kinds = [
            Option(value=k, label=LABELS[k]) for k in KIND_KEYS if not getattr(inbox, k)
        ]
    if facets.parts or facets.active or any(getattr(inbox, k) for k in DECIDED_HERE):
        page.filters = _filters(facets)
    page.reasons = {k: v for k, v in queries_queue.recent_reasons(conn, portal).items() if v}
    picked = _selected(inbox, q, show)
    if picked:
        kind, it = picked
        page.selected = _detail(n, portal, kind, it)
        page.neighbours = _neighbours(inbox, kind, page.selected.row.id)


def review_page(conn: sqlite3.Connection, portal: str, q: ReviewQuery, who: Viewer) -> ReviewPage:
    inbox = queries_review.inbox(conn, portal)
    explained = _explained(conn, portal)
    decided = _decided(conn, portal)
    tab = q.tab if q.tab in TABS else "needs"
    page = ReviewPage(
        portal=portal,
        decides=who.decides,
        tab=tab,
        total=inbox.total,
        explained_count=len(explained),
        decided_count=len(decided),
        same_screen_pairs=len(queries_same_screen.queue(conn, portal)),
        kinds=[Option(value=k, label=label) for k, label in queries_review.KINDS],
        counts={k: inbox.count(k) for k in KIND_KEYS},
        show=q.show if q.show in KIND_KEYS else None,
    )
    if tab == "explained":
        page.explained = explained
    elif tab == "decided":
        page.decided = decided
    else:
        _needs(Needs(conn, inbox, q, who.attrs), page)
    return page
