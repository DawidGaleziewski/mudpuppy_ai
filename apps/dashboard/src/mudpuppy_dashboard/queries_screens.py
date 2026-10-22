"""Read models for the Screens section and the header search (spec 022 M1, FE-N01, FE-N03).

Read-only, like every query module. A "screen" here is still one recorded state; spec 022 M2
groups states into screens with observed revisions.
"""

from __future__ import annotations

import sqlite3

from pydantic import BaseModel

from .models import DocRecord, Run, State

SEARCH_LIMIT = 20


class ScreenRow(BaseModel):
    state: State
    observations: int
    runs: int
    personas: list[str]
    last_seen: str | None


def _screens_where(portal: str | None, q: str | None) -> tuple[str, tuple[str, ...]]:
    """The Screens list filter: the portal, and `q` in the title or route (R-71: over every
    screen, not only the page shown)."""
    where: list[str] = []
    args: list[str] = []
    if portal:
        where.append("s.portal_id = ?")
        args.append(portal)
    if q and q.strip():
        like = _like(q.strip())
        where.append("(s.title LIKE ? ESCAPE '\\' OR s.route_template LIKE ? ESCAPE '\\')")
        args += [like, like]
    return ("WHERE " + " AND ".join(where) if where else ""), tuple(args)


SCREEN_ORDER = "ORDER BY s.portal_id, s.route_template, s.title, s.id"


def count_screens(conn: sqlite3.Connection, portal: str | None, q: str | None = None) -> int:
    where, args = _screens_where(portal, q)
    return int(conn.execute(f"SELECT count(*) FROM states s {where}", args).fetchone()[0])


def screen_ids(conn: sqlite3.Connection, portal: str | None, q: str | None = None) -> list[str]:
    """Every screen id of the list in its order (Prev / Next on the screen page, R-71)."""
    where, args = _screens_where(portal, q)
    return [r[0] for r in conn.execute(f"SELECT s.id FROM states s {where} {SCREEN_ORDER}", args)]


def portal_screens(
    conn: sqlite3.Connection,
    portal: str | None,
    q: str | None = None,
    limit: int = -1,
    offset: int = 0,
) -> list[ScreenRow]:
    """Recorded screens of a portal (or of all portals), by route then title; one page when
    `limit` is set (-1: all)."""
    where, args = _screens_where(portal, q)
    rows = conn.execute(
        f"""SELECT s.*, COUNT(o.run_id) AS observations, COUNT(DISTINCT o.run_id) AS runs,
                   GROUP_CONCAT(DISTINCT o.persona_id) AS personas, MAX(o.observed_at) AS last_seen
            FROM (SELECT s.* FROM states s {where} {SCREEN_ORDER} LIMIT ? OFFSET ?) s
            LEFT JOIN state_observations o ON o.state_id = s.id
            GROUP BY s.id {SCREEN_ORDER}""",
        (*args, limit, offset),
    ).fetchall()
    out = []
    for r in rows:
        d = dict(r)
        extra = {k: d.pop(k) for k in ("observations", "runs", "personas", "last_seen")}
        out.append(
            ScreenRow(
                state=State.model_validate(d),
                observations=extra["observations"],
                runs=extra["runs"],
                personas=sorted((extra["personas"] or "").split(",")) if extra["personas"] else [],
                last_seen=extra["last_seen"],
            )
        )
    return out


class SearchResults(BaseModel):
    q: str
    screens: list[State]
    records: list[DocRecord]
    runs: list[Run]

    @property
    def total(self) -> int:
        return len(self.screens) + len(self.records) + len(self.runs)


def _like(q: str) -> str:
    return "%" + q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"


def search(conn: sqlite3.Connection, q: str, portal: str | None) -> SearchResults:
    """Screens by title or route, records by key or title, scans by id prefix; case-insensitive."""
    q = q.strip()
    if not q:
        return SearchResults(q=q, screens=[], records=[], runs=[])
    like = _like(q)
    scope, scope_args = ("AND portal_id = ?", (portal,)) if portal else ("", ())
    screens = conn.execute(
        f"""SELECT * FROM states
            WHERE (title LIKE ? ESCAPE '\\' OR route_template LIKE ? ESCAPE '\\')
            {scope} ORDER BY title LIMIT ?""",
        (like, like, *scope_args, SEARCH_LIMIT),
    ).fetchall()
    records = conn.execute(
        f"""SELECT * FROM doc_records WHERE (key LIKE ? ESCAPE '\\' OR title LIKE ? ESCAPE '\\')
            AND withdrawn = 0 {scope} ORDER BY kind, seq LIMIT ?""",
        (like, like, *scope_args, SEARCH_LIMIT),
    ).fetchall()
    runs = conn.execute(
        f"SELECT * FROM runs WHERE id LIKE ? ESCAPE '\\' {scope} ORDER BY started_at DESC LIMIT ?",
        (_like(q).lstrip("%"), *scope_args, SEARCH_LIMIT),
    ).fetchall()
    return SearchResults(
        q=q,
        screens=[State.model_validate(dict(r)) for r in screens],
        records=[DocRecord.model_validate(dict(r)) for r in records],
        runs=[Run.model_validate(dict(r)) for r in runs],
    )


def portal_of_state(conn: sqlite3.Connection, state_id: str) -> str | None:
    row = conn.execute("SELECT portal_id FROM states WHERE id = ?", (state_id,)).fetchone()
    return str(row[0]) if row else None


class ProcessUse(BaseModel):
    name: str
    role: str  # start | end | step


def processes_of_state(conn: sqlite3.Connection, state_id: str) -> list[ProcessUse]:
    """The named processes (newest scope of each) that include this screen, for the page head."""
    try:
        rows = conn.execute(
            "SELECT p.process_name, p.start_state_id, p.end_state_id FROM process_scopes p"
            " WHERE (p.start_state_id = ?1 OR p.end_state_id = ?1"
            "   OR EXISTS (SELECT 1 FROM json_each(p.selected_state_ids) j WHERE j.value = ?1))"
            " AND p.created_at = (SELECT max(q.created_at) FROM process_scopes q"
            "   WHERE q.portal_id = p.portal_id AND q.process_name = p.process_name)"
            " ORDER BY p.process_name",
            (state_id,),
        ).fetchall()
    except sqlite3.OperationalError:
        return []

    def role(r: sqlite3.Row) -> str:
        ends = {r["start_state_id"]: "start", r["end_state_id"]: "end"}
        return ends.get(state_id, "step")

    return [ProcessUse(name=r["process_name"], role=role(r)) for r in rows]
