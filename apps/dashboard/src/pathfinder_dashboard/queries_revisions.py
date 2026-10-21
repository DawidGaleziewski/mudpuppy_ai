"""Read models for revisions (spec 022 M2, FE-S01): a screen's observed revisions with the scans
that saw each, and an amendment's revision history. Read-only."""

from __future__ import annotations

import sqlite3

from pydantic import BaseModel

from .models import AmendmentRevisionWithTarget, Screen


class ObservedRevision(BaseModel):
    state_id: str
    rev: int
    title: str
    fingerprint: str
    first_seen_run: str
    created_at: str
    runs: list[str]  # scans that observed this revision, oldest first
    personas: list[str]


class ScreenRevisions(BaseModel):
    screen: Screen
    revisions: list[ObservedRevision]  # r1 first

    def latest(self) -> ObservedRevision | None:
        return self.revisions[-1] if self.revisions else None


def screen_of_state(conn: sqlite3.Connection, state_id: str) -> ScreenRevisions | None:
    """The screen a state belongs to and all its revisions; None before migration 0015 or for a
    state an old crawler wrote without a screen."""
    try:
        row = conn.execute(
            "SELECT sc.* FROM states s JOIN screens sc ON sc.id = s.screen_id WHERE s.id = ?",
            (state_id,),
        ).fetchone()
    except sqlite3.OperationalError:
        return None
    if row is None:
        return None
    screen = Screen.model_validate(dict(row))
    revs = conn.execute(
        """SELECT s.id, s.screen_rev, s.title, s.fingerprint, s.first_seen_run, s.created_at,
                  GROUP_CONCAT(o.run_id) AS runs, GROUP_CONCAT(DISTINCT o.persona_id) AS personas
           FROM states s LEFT JOIN (
             SELECT run_id, state_id, persona_id FROM state_observations ORDER BY observed_at
           ) o ON o.state_id = s.id
           WHERE s.screen_id = ?
           GROUP BY s.id ORDER BY s.screen_rev""",
        (screen.id,),
    ).fetchall()
    return ScreenRevisions(
        screen=screen,
        revisions=[
            ObservedRevision(
                state_id=r["id"],
                rev=r["screen_rev"] or 0,
                title=r["title"],
                fingerprint=r["fingerprint"],
                first_seen_run=r["first_seen_run"],
                created_at=r["created_at"],
                runs=list(dict.fromkeys((r["runs"] or "").split(","))) if r["runs"] else [],
                personas=sorted((r["personas"] or "").split(",")) if r["personas"] else [],
            )
            for r in revs
        ],
    )


def amendment_history(
    conn: sqlite3.Connection, amendment_id: str
) -> list[AmendmentRevisionWithTarget]:
    """Every revision of an amendment with what it was written on, oldest first; [] before 0016."""
    try:
        rows = conn.execute(
            "SELECT * FROM amendment_revisions_with_target WHERE amendment_id = ? ORDER BY rev",
            (amendment_id,),
        ).fetchall()
    except sqlite3.OperationalError:
        return []
    return [AmendmentRevisionWithTarget.model_validate(dict(r)) for r in rows]
