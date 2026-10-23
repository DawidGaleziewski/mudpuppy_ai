"""A model screen's recordings in the React console (R-100, spec 071; designer answers Q10):
which screen and variant a recording (a recorded state) belongs to, and what the 1.x state page
showed that now lives on the Screen page: its amendments (to-be), its inputs (form steps and what
each probe did) and the URLs it was reached at."""

from __future__ import annotations

import sqlite3
from pathlib import Path

from pydantic import BaseModel

from . import queries_suites, queries_urls, visuals
from .queries_app_state import EntryUrl, FormStep, Param, form_step_out, urls_out
from .queries_app_state_side import Amendments, amendments
from .queries_changes import rows_of


class RecordingPlace(BaseModel):
    """Where a recording opens: its screen and variant (r1, r2…)."""

    portal: str
    key: str
    ordinal: int


class ScreenRecordings(BaseModel):
    #: The recording the amendments and the add form are on (the newest variant).
    state: str
    amendments: Amendments
    #: The form steps of its variants, once each.
    inputs: list[FormStep]
    urls: list[EntryUrl]
    urls_more: int
    params: list[Param]
    can_mark: bool


def place_of(conn: sqlite3.Connection, state_id: str) -> RecordingPlace | None:
    """The model screen holding the recording now; None before Rebuild model or when unexplained."""
    rows = rows_of(
        conn,
        "SELECT s.portal_id, s.key, m.ordinal FROM screen_members m"
        " JOIN model_screens s ON s.id = m.screen_id"
        " WHERE m.state_id = ? AND m.to_model_version IS NULL LIMIT 1",
        (state_id,),
    )
    if not rows:
        return None
    r = rows[0]
    return RecordingPlace(portal=r["portal_id"], key=r["key"], ordinal=r["ordinal"])


def _members(conn: sqlite3.Connection, portal: str, key: str) -> list[str]:
    return [
        r["state_id"]
        for r in rows_of(
            conn,
            "SELECT m.state_id FROM screen_members m JOIN model_screens s ON s.id = m.screen_id"
            " WHERE s.portal_id = ? AND s.key = ? AND m.to_model_version IS NULL"
            " ORDER BY m.ordinal",
            (portal, key),
        )
    ]


def screen_recordings(
    conn: sqlite3.Connection, data_dir: Path, portal: str, key: str, can_mark: bool
) -> ScreenRecordings | None:
    """None for a screen without recordings."""
    states = _members(conn, portal, key)
    newest = visuals.state_page(conn, data_dir, states[-1]) if states else None
    if newest is None:
        return None
    inputs: list[FormStep] = []
    seen: set[tuple[int, str]] = set()
    for sid in states:
        fs = form_step_out(queries_suites.form_step_of_state(conn, sid))
        if fs is not None and (fs.step, fs.route) not in seen:
            seen.add((fs.step, fs.route))
            inputs.append(fs)
    entries, more, params = urls_out(queries_urls.state_urls(conn, states[-1]))
    return ScreenRecordings(
        state=states[-1],
        amendments=amendments(conn, data_dir, newest.figure.state, newest.elements),
        inputs=inputs,
        urls=entries,
        urls_more=more,
        params=params,
        can_mark=can_mark,
    )
