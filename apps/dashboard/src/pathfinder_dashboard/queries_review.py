"""Read models for the Review inbox (spec 022 screen 09, T029): one inbox for every decision that
waits for a person: doc records to confirm, assumptions to check (spec 029), differences between
personas no record explains yet (spec 024 US3.3), amendments to re-anchor, the assistant's
proposals and edit conflicts. Read-only; each read gives nothing on a store older than the table
it needs.

Edit conflicts are not stored yet: a stale save is refused with 409 on the spot (FR-005). The
group stays, empty, until process drafts (M5) keep both versions."""

from __future__ import annotations

import sqlite3
from typing import Any, NamedTuple

from . import queries_access, queries_chat
from .models import Amendment
from .queries_proposals import ProposalView, views_of
from .queries_suites import SuiteItem, open_suite_count, open_suites

KINDS: tuple[tuple[str, str], ...] = (
    ("records", "Records to confirm"),
    ("assumptions", "Assumptions to check"),
    ("differences", "Unexplained differences"),
    ("reanchor", "Amendments to re-anchor"),
    ("proposals", "Assistant proposals"),
    ("suites", "Probe suites to approve"),
    ("conflicts", "Edit conflicts"),
)


class RecordItem(NamedTuple):
    key: str
    kind: str
    title: str
    rev: int  # the revision that waits (the latest)
    status: str  # of that revision
    total: int  # revisions so far


class CitedScreen(NamedTuple):
    id: str
    title: str
    route: str
    screenshot_ref: str | None


class Inbox(NamedTuple):
    records: list[RecordItem]
    assumptions: list[RecordItem]
    differences: list[queries_access.Difference]
    reanchor: list[Amendment]
    proposals: list[ProposalView]
    suites: list[SuiteItem]
    conflicts: list[Any]

    def count(self, kind: str) -> int:
        return len(getattr(self, kind))

    @property
    def total(self) -> int:
        return sum(self.count(k) for k, _ in KINDS)


def _rows(conn: sqlite3.Connection, sql: str, args: tuple[Any, ...]) -> list[sqlite3.Row]:
    try:
        return conn.execute(sql, args).fetchall()
    except sqlite3.OperationalError:
        return []


def records_to_confirm(conn: sqlite3.Connection, portal: str) -> list[RecordItem]:
    """Records whose latest revision is not confirmed yet, in document order. Assumptions are
    their own group (`assumptions_to_check`, spec 029)."""
    return _unconfirmed(conn, portal, "<> 'assumption'")


def assumptions_to_check(conn: sqlite3.Connection, portal: str) -> list[RecordItem]:
    """Assumptions whose latest revision is not confirmed yet: every one is checked (spec 029)."""
    return _unconfirmed(conn, portal, "= 'assumption'")


def _unconfirmed(conn: sqlite3.Connection, portal: str, kind: str) -> list[RecordItem]:
    rows = _rows(
        conn,
        "SELECT r.key, r.kind, r.title, r.latest_rev, v.status FROM doc_records r"
        " JOIN doc_revisions v ON v.record_id = r.id AND v.rev_no = r.latest_rev"
        f" WHERE r.portal_id = ? AND r.withdrawn = 0 AND r.kind {kind}"
        " AND (r.confirmed_rev IS NULL OR r.confirmed_rev < r.latest_rev)"
        " AND v.status = 'draft' ORDER BY r.kind, r.seq",
        (portal,),
    )
    return [
        RecordItem(r["key"], r["kind"], r["title"], r["latest_rev"], r["status"], r["latest_rev"])
        for r in rows
    ]


def open_proposals(conn: sqlite3.Connection, portal: str) -> list[ProposalView]:
    """Proposals nobody applied or discarded yet, oldest first (stale ones included: they keep
    Discard)."""
    return views_of(conn, "p.portal_id = ? AND p.status IN ('open', 'stale')", (portal,))


def differences(conn: sqlite3.Connection, portal: str) -> list[queries_access.Difference]:
    """What only some personas see and no BA record explains yet (spec 024 US3.3)."""
    return queries_access.unexplained(queries_access.access_matrix(conn, portal))


def inbox(conn: sqlite3.Connection, portal: str | None) -> Inbox:
    if not portal:
        return Inbox([], [], [], [], [], [], [])
    reanchor = [
        a
        for a in queries_chat.superseded_amendments(conn, portal, "superseded")
        if not a.reapplied_as
    ]
    return Inbox(
        records_to_confirm(conn, portal),
        assumptions_to_check(conn, portal),
        differences(conn, portal),
        reanchor,
        open_proposals(conn, portal),
        open_suites(conn, portal),
        [],
    )


def count(conn: sqlite3.Connection, portal: str | None) -> int:
    """The nav's Review marker (FE-N04): everything waiting."""
    if not portal:
        return 0
    rows = _rows(
        conn,
        "SELECT"
        " (SELECT count(*) FROM doc_records r JOIN doc_revisions v ON v.record_id = r.id"
        "   AND v.rev_no = r.latest_rev WHERE r.portal_id = ?1 AND r.withdrawn = 0"
        "   AND (r.confirmed_rev IS NULL OR r.confirmed_rev < r.latest_rev) AND v.status = 'draft')"
        " + (SELECT count(*) FROM amendments WHERE portal_id = ?1"
        "   AND status = 'needs_reanchor' AND reapplied_as IS NULL)"
        " + (SELECT count(*) FROM chat_proposals WHERE portal_id = ?1"
        "   AND status IN ('open', 'stale'))",
        (portal,),
    )
    # Differences need the access model's set logic, not one more subquery; suites came later
    # (spec 032) and stay readable on a store without their table.
    return (
        (int(rows[0][0]) if rows else 0)
        + len(differences(conn, portal))
        + open_suite_count(conn, portal)
    )


def cited_screens(conn: sqlite3.Connection, portal: str, key: str, rev: int) -> list[CitedScreen]:
    """The screens a record's revision cites as evidence (states and screen regions)."""
    rows = _rows(
        conn,
        "SELECT DISTINCT s.id, s.title, s.route_template, s.screenshot_ref"
        " FROM doc_records r JOIN doc_revisions v ON v.record_id = r.id AND v.rev_no = ?"
        " JOIN doc_evidence_links l ON l.revision_id = v.id"
        "  AND l.target_kind IN ('state', 'screen_region')"
        " JOIN states s ON s.id = l.target_id"
        " WHERE r.portal_id = ? AND r.key = ? ORDER BY s.route_template",
        (rev, portal, key),
    )
    return [
        CitedScreen(r["id"], r["title"], r["route_template"], r["screenshot_ref"]) for r in rows
    ]
