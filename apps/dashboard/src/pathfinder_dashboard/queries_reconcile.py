"""Review's "Differing states" (spec 033 US4, design screen 16): the BA's open proposals of
verdicts, each with the group snapshot it reasoned about (outcomes and their evidence). The
dashboard only reads; the owner's confirmation goes through the chat service. Read-only."""

from __future__ import annotations

import json
import sqlite3
from dataclasses import dataclass
from typing import Any

VERDICTS: tuple[tuple[str, str], ...] = (
    ("main", "Main state"),
    ("variant_persona", "Variant · persona"),
    ("variant_input", "Variant · input"),
    ("variant_flag", "Variant · feature flag"),
    ("validation", "Validation state"),
    ("technical", "Technical error state"),
    ("temporary", "Temporary · recheck"),
    ("same", "Same state"),
)
HYPOTHESES = {
    "persona": "persona",
    "input": "input",
    "temporary": "temporary or environment",
    "session_time": "session or time",
    "flag": "feature flag",
    "data": "data",
}


@dataclass(frozen=True)
class Outcome:
    state_id: str
    route: str
    title: str
    state_kind: str
    scans: list[dict[str, Any]]
    first_seen: str
    last_seen: str
    http_status: int | None
    seen: int
    of: int
    reproduced: bool
    verdict: str  # the BA's proposal
    hypothesis: str
    reason: str


@dataclass(frozen=True)
class DifferingItem:
    id: str
    key: str
    kind: str  # action · route
    route: str
    title: str
    action: str | None  # "button · Calculate"
    outcomes: list[Outcome]
    proposed_by: str
    proposed_at: str


def _rows(conn: sqlite3.Connection, sql: str, args: tuple[Any, ...]) -> list[sqlite3.Row]:
    try:
        return conn.execute(sql, args).fetchall()
    except sqlite3.OperationalError:
        return []  # a store before migration 0025


def _item(r: sqlite3.Row) -> DifferingItem:
    snap = json.loads(r["snapshot_json"])
    proposal = {p["state_id"]: p for p in json.loads(r["proposal_json"])}
    point = snap.get("point", {})
    act = point.get("action")
    outcomes = []
    for o in snap.get("outcomes", []):
        p = proposal.get(o["state_id"], {})
        freq = o.get("frequency", {})
        outcomes.append(
            Outcome(
                o["state_id"],
                o.get("route", ""),
                o.get("title", ""),
                o.get("state_kind", "main"),
                o.get("scans", []),
                o.get("first_seen", ""),
                o.get("last_seen", ""),
                o.get("http_status"),
                freq.get("seen", 0),
                freq.get("of", 0),
                bool(o.get("reproduced")),
                p.get("verdict", ""),
                p.get("hypothesis", ""),
                p.get("reason", ""),
            )
        )
    return DifferingItem(
        r["id"],
        r["group_key"],
        r["group_kind"],
        point.get("route", ""),
        point.get("title", ""),
        f"{act['role']} · {act['name']}" if act else None,
        outcomes,
        r["proposed_by"],
        r["proposed_at"],
    )


def open_reconciliations(conn: sqlite3.Connection, portal: str) -> list[DifferingItem]:
    """Proposals waiting for the owner, oldest first (Q4: groups without one are not listed)."""
    rows = _rows(
        conn,
        "SELECT * FROM reconciliations WHERE portal_id = ? AND status = 'proposed'"
        " ORDER BY proposed_at, id",
        (portal,),
    )
    return [_item(r) for r in rows]


def open_count(conn: sqlite3.Connection, portal: str) -> int:
    rows = _rows(
        conn,
        "SELECT count(*) FROM reconciliations WHERE portal_id = ? AND status = 'proposed'",
        (portal,),
    )
    return int(rows[0][0]) if rows else 0
