"""The as-is of a process as documentation (spec 027 US1–US3): the pictures of a screen, per step
of A the records that cite its screen and its amendments, what is still open, and the sign-off.
Read-only; a store without the documentation or picture tables gives empty values."""

from __future__ import annotations

import sqlite3
from collections.abc import Iterable
from typing import Any

from pydantic import BaseModel

from .queries_processes import ProcessView

# Shown per step in this order; the export (R-68) carries everything else.
STEP_KINDS = (
    "requirement",
    "business_rule",
    "data_item",
    "nfr",
    "glossary_term",
    "open_question",
    "assumption",
    "followup",
)
OPEN_KINDS = ("open_question", "followup")


class Picture(BaseModel):
    """A screen's screenshot and wireframe (evidence refs), either may be missing, and how many
    scans saw it."""

    shot: str | None = None
    wire: str | None = None
    scans: int = 0


class StepRecord(BaseModel):
    key: str
    kind: str
    title: str
    status: str  # the latest revision's: draft, confirmed, rejected, superseded


class StepDoc(BaseModel):
    """One step of A with what is documented about its screen."""

    n: int
    step: dict[str, Any]
    picture: Picture
    records: list[StepRecord]
    amendments: int  # active
    reanchor: int  # waiting for re-anchoring

    def of_kind(self, kind: str) -> list[StepRecord]:
        return [r for r in self.records if r.kind == kind]


class StillOpen(BaseModel):
    """What the as-is still lacks, over all steps (each record counted once)."""

    questions: int
    unconfirmed: int
    reanchor: int

    @property
    def total(self) -> int:
        return self.questions + self.unconfirmed + self.reanchor


class SignOff(BaseModel):
    """The last move to `as_is_documented` and whether A changed since (FR-005)."""

    signed_rev: int | None  # A's revision then; None before migration 0028
    head_rev: int
    by: str
    at: str

    @property
    def changed(self) -> bool:
        return self.signed_rev is not None and self.head_rev > self.signed_rev


def _rows(conn: sqlite3.Connection, sql: str, args: Iterable[Any]) -> list[sqlite3.Row]:
    try:
        return conn.execute(sql, tuple(args)).fetchall()
    except sqlite3.OperationalError:
        return []


def _marks(n: int) -> str:
    return ", ".join("?" for _ in range(n))


def pictures(conn: sqlite3.Connection, state_ids: list[str]) -> dict[str, Picture]:
    """Screenshot and wireframe refs per state (FR-001: existing evidence, no new capture)."""
    if not state_ids:
        return {}
    marks = _marks(len(state_ids))
    shots = {
        r["id"]: r["screenshot_ref"]
        for r in _rows(
            conn, f"SELECT id, screenshot_ref FROM states WHERE id IN ({marks})", state_ids
        )
    }
    wires = {
        r["state_id"]: r["svg_ref"]
        for r in _rows(
            conn,
            f"SELECT state_id, svg_ref FROM state_wireframes WHERE state_id IN ({marks})",
            state_ids,
        )
    }
    scans = {
        r["state_id"]: int(r["n"])
        for r in _rows(
            conn,
            "SELECT state_id, count(DISTINCT run_id) AS n FROM state_observations"
            f" WHERE state_id IN ({marks}) GROUP BY state_id",
            state_ids,
        )
    }
    return {
        s: Picture(shot=shots.get(s), wire=wires.get(s), scans=scans.get(s, 0)) for s in state_ids
    }


def _screen_states(conn: sqlite3.Connection, steps: list[dict[str, Any]]) -> dict[str, set[str]]:
    """Per step id, every recorded state of its screen (records may cite another revision)."""
    out: dict[str, set[str]] = {}
    for s in steps:
        mine = {s["state_id"]} if s.get("state_id") else set()
        if s.get("screen_id"):
            mine |= {
                r[0]
                for r in _rows(conn, "SELECT id FROM states WHERE screen_id = ?", (s["screen_id"],))
            }
        out[s["id"]] = mine
    return out


def _citing(conn: sqlite3.Connection, portal: str, states: set[str]) -> list[StepRecord]:
    if not states:
        return []
    kinds = _marks(len(STEP_KINDS))
    rows = _rows(
        conn,
        "SELECT DISTINCT r.key, r.kind, r.title, v.status, r.seq FROM doc_records r"
        " JOIN doc_revisions v ON v.record_id = r.id AND v.rev_no = r.latest_rev"
        " JOIN doc_evidence_links l ON l.revision_id = v.id"
        " WHERE r.portal_id = ? AND r.withdrawn = 0"
        f" AND r.kind IN ({kinds}) AND l.target_kind IN ('state', 'screen_region')"
        f" AND l.target_id IN ({_marks(len(states))})"
        " ORDER BY r.kind, r.seq",
        (portal, *STEP_KINDS, *sorted(states)),
    )
    return [
        StepRecord(key=r["key"], kind=r["kind"], title=r["title"], status=r["status"]) for r in rows
    ]


def _amendments(conn: sqlite3.Connection, portal: str, states: set[str]) -> tuple[int, int]:
    if not states:
        return 0, 0
    rows = _rows(
        conn,
        "SELECT status, count(*) AS n FROM amendments WHERE portal_id = ?"
        " AND status IN ('active', 'needs_reanchor')"
        " AND substr(target_id, 1, instr(target_id || '#', '#') - 1)"
        f" IN ({_marks(len(states))}) GROUP BY status",
        (portal, *sorted(states)),
    )
    by = {r["status"]: int(r["n"]) for r in rows}
    return by.get("active", 0), by.get("needs_reanchor", 0)


def step_docs(conn: sqlite3.Connection, portal: str, steps: list[dict[str, Any]]) -> list[StepDoc]:
    """US2: A as documentation, one entry per step in order."""
    per_step = _screen_states(conn, steps)
    pics = pictures(conn, [s["state_id"] for s in steps if s.get("state_id")])
    out = []
    for n, s in enumerate(steps, start=1):
        states = per_step.get(s["id"], set())
        active, reanchor = _amendments(conn, portal, states)
        out.append(
            StepDoc(
                n=n,
                step=s,
                picture=pics.get(s.get("state_id") or "", Picture()),
                records=_citing(conn, portal, states),
                amendments=active,
                reanchor=reanchor,
            )
        )
    return out


def still_open(docs: list[StepDoc]) -> StillOpen:
    """US2.4: open questions and follow-ups, unconfirmed records, amendments to re-anchor."""
    records = {r.key: r for d in docs for r in d.records}.values()
    return StillOpen(
        questions=sum(1 for r in records if r.kind in OPEN_KINDS and r.status == "draft"),
        unconfirmed=sum(1 for r in records if r.kind not in OPEN_KINDS and r.status == "draft"),
        reanchor=sum(d.reanchor for d in docs),
    )


def sign_off(view: ProcessView) -> SignOff | None:
    """US3: the newest move to `as_is_documented` while the process is at that stage."""
    if view.process.stage != "as_is_documented" or view.as_is is None:
        return None
    moves = [r for r in view.revisions if r.change == "stage" and r.stage == "as_is_documented"]
    if not moves:
        return None
    last = moves[-1]
    return SignOff(
        signed_rev=last.as_is_rev,
        head_rev=view.as_is.model.rev,
        by=last.author,
        at=last.created_at,
    )
