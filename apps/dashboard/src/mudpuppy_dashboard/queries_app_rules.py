"""The React console's Business rules (R-96, spec 065; designer screens v2-11 and v2-12): the
portal's decision rules grouped by status, what needs a person first, and one rule as a decision
table with its wording, boundary tests and history. Built over the read model `queries_rules`;
statuses come mapped (`status_out`)."""

from __future__ import annotations

import sqlite3
from urllib.parse import quote

from pydantic import BaseModel

from . import queries_rules as qr
from .queries_app import StatusOut, status_out
from .queries_app_review_detail import Option

#: Actors that are the system; any other actor is a person,
#: whose reason is shown as a note.
SYSTEM_ACTORS = ("miner", "reconciler", "crawler", "ba-agent")


class RuleRow(BaseModel):
    key: str  # the hypothesis key, H-nnnn
    shown_key: str  # BR-nnn once documented, else the H key
    claim: str
    status: StatusOut
    screen_key: str | None
    screen_title: str | None
    action: str | None
    passed: int
    failed: int
    waiting: int
    last_tested: str | None


class RuleGroup(BaseModel):
    status: StatusOut
    rules: list[RuleRow]


class Export(BaseModel):
    """The rules export's links (owner answer OV-5)."""

    zip: str
    csv: str


class RulesPage(BaseModel):
    portal: str
    total: int
    #: The status filter: value the UI status, label its word with the count.
    statuses: list[Option]
    status: str | None
    groups: list[RuleGroup]
    export: Export
    #: The reviewer is set: Run the rule tests and Reword are offered.
    writes: bool


class Cell(BaseModel):
    """A row's condition on one input; `any` matches every value."""

    cond: str
    any: bool


class TableRow(BaseModel):
    cells: list[Cell]
    screen: str  # the next screen: a screen key (SC-…) or the stored word
    is_screen: bool
    result: str | None  # the result when not plain "ok"


class Table(BaseModel):
    inputs: list[str]
    hit_policy: str
    rows: list[TableRow]


class Test(BaseModel):
    inputs: list[str]  # "name = value"
    expect: str
    got: str | None
    verdict: StatusOut


class Event(BaseModel):
    status: StatusOut
    actor: str
    reason: str
    at: str
    undo: bool
    #: A person's reason (a note) rather than the system's.
    by_person: bool
    #: The timeline's marker: ok (confirmed), failed (refuted), draft otherwise.
    mark: str


class Wording(BaseModel):
    wording: str
    actor: str
    reason: str | None
    at: str


class RulePage(BaseModel):
    portal: str
    row: RuleRow
    br_key: str | None
    #: The documented business rule record's page.
    doc_href: str | None
    fitness: float | None
    executions: int | None
    #: None: decided on data the UI does not show, or too few executions yet.
    table: Table | None
    wordings: list[Wording]  # newest first; the first is in force
    tests: list[Test]
    history: list[Event]
    files: list[Option]  # its .md and .dmn, then every rule (zip)
    writes: bool
    #: It no longer holds on a newer release and waits to be mined again.
    changed: bool
    #: Confirmed, yet no business rule record cites it.
    uncited: bool


class RuleExport(BaseModel):
    """The rule as the migration team reads it; none with the reason."""

    markdown: str | None
    error: str | None


def exports(portal: str) -> Export:
    base = f"/api/portals/{quote(portal, safe='')}/rules"
    return Export(zip=f"{base}/export.zip", csv=f"{base}/export/rules.csv")


def _row(r: qr.RuleRow) -> RuleRow:
    return RuleRow(
        key=r.key,
        shown_key=r.shown_key,
        claim=r.claim,
        status=status_out("rule", r.status),
        screen_key=r.screen_key,
        screen_title=r.screen_title,
        action=r.action,
        passed=r.passed,
        failed=r.failed,
        waiting=r.waiting,
        last_tested=r.last_tested,
    )


def rules_page(
    conn: sqlite3.Connection, portal: str, status: str | None, writes: bool
) -> RulesPage:
    v = qr.rules_view(conn, portal, status)
    statuses = [
        Option(value=s, label=f"{status_out('rule', s).word} {v.counts[s]}")
        for s in qr.ORDER
        if s in v.counts
    ]
    return RulesPage(
        portal=portal,
        total=len(v.rules),
        statuses=statuses,
        status=v.status,
        groups=[
            RuleGroup(status=status_out("rule", s), rules=[_row(r) for r in rows])
            for s, rows in v.groups()
        ],
        export=exports(portal),
        writes=writes,
    )


def _table(d: qr.RuleDetail) -> Table | None:
    if d.needs_data or not d.table:
        return None
    rows = []
    for conds, then in d.table:
        screen, _, result = then.partition(" ")
        rows.append(
            TableRow(
                cells=[Cell(cond=c, any=c == "any") for c in conds],
                screen=screen,
                is_screen=screen.startswith("SC-"),
                result=result if result and result != "ok" else None,
            )
        )
    return Table(inputs=d.inputs, hit_policy=d.hit_policy.capitalize(), rows=rows)


def _event(e: qr.RuleEvent) -> Event:
    mark = {"confirmed": "ok", "refuted": "failed"}.get(e.status, "draft")
    return Event(
        status=status_out("hypothesis", e.status),
        actor=e.actor,
        reason=e.reason,
        at=e.at,
        undo=e.undo,
        by_person=e.actor not in SYSTEM_ACTORS,
        mark=mark,
    )


def _files(portal: str, shown: str) -> list[Option]:
    base = f"/api/portals/{quote(portal, safe='')}/rules/export"
    key = quote(shown, safe="")
    return [
        Option(value=f"{base}/{key}.md", label="Markdown"),
        Option(value=f"{base}/{key}.dmn", label="DMN"),
        Option(value=exports(portal).zip, label="All rules (zip)"),
    ]


def rule_page(conn: sqlite3.Connection, portal: str, key: str, writes: bool) -> RulePage | None:
    """A rule by its hypothesis key (H-nnnn) or the BR key of the record documenting it."""
    d = qr.rule_detail(conn, portal, key)
    if d is None:
        return None
    br = d.row.br_key
    return RulePage(
        portal=portal,
        row=_row(d.row),
        br_key=br,
        changed=d.row.status == "changed",
        uncited=br is None and d.row.status == "confirmed",
        doc_href=f"/app/portals/{quote(portal, safe='')}/docs/{quote(br, safe='')}" if br else None,
        fitness=d.row.fitness,
        executions=d.row.rows,
        table=_table(d),
        wordings=[
            Wording(wording=w.wording, actor=w.actor, reason=w.reason, at=w.at) for w in d.wordings
        ],
        tests=[
            Test(
                inputs=[f"{k} = {v}" for k, v in t.inputs.items()],
                expect=t.expect,
                got=t.got,
                verdict=status_out("boundary_test", t.verdict or "waiting"),
            )
            for t in d.tests
        ],
        history=[_event(e) for e in d.history],
        files=_files(portal, d.row.shown_key),
        writes=writes,
    )
