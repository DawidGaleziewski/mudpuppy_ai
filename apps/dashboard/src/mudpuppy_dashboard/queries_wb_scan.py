"""Workbench data lane (spec 043 T013, D-3; designer 14-workbench.md § 7 phase 0 step 1): a scan's
events derived from the store, one per step, so a citation `scan#step` (`01a110d5#171`) names one
event. A run's `call` spans in order are its steps; a step whose subtree records a state is a page
visit; a refused or failed call is a failed action; the run's end is one more step (finished or
stopped). Route pages are the pages the crawler acted on; a page it only recorded is a side trip,
folded onto the route page before it (the filmstrip's "+N side pages"). Read-only."""

from __future__ import annotations

import json
import re
import sqlite3
from collections.abc import Sequence
from dataclasses import dataclass, field

from .queries_changes import rows_of

# A full scan id (D-9, the contract's `scanId`): the model binds it, links and events carry it.
SCAN_ID = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}")

EVENT_TYPES = (
    "scan.started",
    "page.visited",
    "step.recorded",
    "action.failed",
    "scan.stopped",
    "scan.finished",
)

# The run statuses in the Workbench's words (designer 03-colour-guide: Stopped is ash, not red).
STATUS_WORDS = {
    "running": "running",
    "completed": "finished",
    "stopped_warning": "stopped",
    "interrupted": "stopped",
}


def short_id(run_id: str) -> str:
    """A scan id as people read it (design answer Q6): the first two groups, its start time."""
    return "-".join(run_id.split("-")[:2])


@dataclass(frozen=True)
class ScanEvent:
    step: int
    type: str
    at: str
    call: str | None  # the crawler tool of the step (navigate, act, …); None for the run's end
    state_id: str | None
    error: str | None  # the error message of a failed step or of the stop
    intent: (
        str | None
    )  # what the crawler said it was doing (agent text: shown escaped, never trusted)
    action_id: str | None = None  # the action an `act` step took (its page is where the crawler is)

    def ref(self, run_id: str) -> str:
        return f"{run_id}#{self.step}"  # the contract's eventRef: on the full id


@dataclass
class PageVisit:
    """A route page in visit order, with the side trips that came off it."""

    order: int
    state_id: str
    route: str
    state: int  # same-URL step: the 2nd distinct state of /kalkulator/kierowca is 2
    title: str
    step: int
    at: str
    pages_so_far: int
    side_pages: int = 0
    failed: bool = False
    screenshot_ref: str | None = None


@dataclass
class ScanLive:
    run_id: str
    portal: str
    status: str  # running · stopped · finished
    started_at: str
    ended_at: str | None
    steps: int
    pages: int  # every page recorded so far, side trips included
    queued: int  # pending links in the frontier now
    route_pages: list[PageVisit] = field(default_factory=list)
    here: PageVisit | None = None  # the crawler's page (running) or where it ended
    failed_at: PageVisit | None = None
    stop_reason: str | None = None
    checkpoint: str | None = None  # the route of the last good checkpoint
    continues: str | None = None  # the run this one resumes (a `continue` run, spec 034)
    events: list[ScanEvent] = field(default_factory=list)

    @property
    def short(self) -> str:
        return short_id(self.run_id)


SPANS_SQL = (
    "SELECT s.id, s.parent_id, s.kind, s.name, s.status, s.started_at, s.attrs_json,"
    " b.started_at AS boot_at, s.seq FROM trace_spans s JOIN trace_boots b ON b.id = s.boot_id"
    " WHERE s.run_id = ? ORDER BY b.started_at, s.seq"
)
EVENT_NAMES = ("state_recorded", "error")


def _attrs(raw: str) -> dict[str, object]:
    try:
        value = json.loads(raw)
    except ValueError:
        return {}
    return value if isinstance(value, dict) else {}


def _call_events(conn: sqlite3.Connection, run_id: str) -> list[ScanEvent]:
    """One event per call span, the facts of its subtree folded in."""
    spans = rows_of(conn, SPANS_SQL, (run_id,))
    parent = {r["id"]: r["parent_id"] for r in spans}
    calls = [r for r in spans if r["kind"] == "call" and r["parent_id"] is None]
    facts: dict[str, dict[str, str]] = {c["id"]: {} for c in calls}
    for r in spans:
        if r["name"] not in EVENT_NAMES:
            continue
        root = r["parent_id"]
        while root is not None and root not in facts:
            root = parent.get(root)
        if root is None:
            continue
        attrs = _attrs(r["attrs_json"])
        if r["name"] == "state_recorded" and isinstance(attrs.get("state_id"), str):
            facts[root]["state_id"] = str(attrs["state_id"])
        elif r["name"] == "error":
            facts[root]["error"] = str(attrs.get("message") or attrs.get("code") or "error")
    return [_event_of(step, c, facts[c["id"]]) for step, c in enumerate(calls, start=1)]


def _event_of(step: int, call: sqlite3.Row, facts: dict[str, str]) -> ScanEvent:
    args = _attrs(call["attrs_json"]).get("args")
    intent = args.get("intent") if isinstance(args, dict) else None
    action = args.get("action_id") if isinstance(args, dict) else None
    if call["name"] == "start_run":
        kind = "scan.started"
    elif call["status"] in ("refused", "error"):
        kind = "action.failed"
    elif "state_id" in facts:
        kind = "page.visited"
    else:
        kind = "step.recorded"
    return ScanEvent(
        step=step,
        type=kind,
        at=call["started_at"],
        call=call["name"],
        state_id=facts.get("state_id"),
        error=facts.get("error"),
        intent=intent if isinstance(intent, str) else None,
        action_id=action if isinstance(action, str) else None,
    )


def scan_events(conn: sqlite3.Connection, run_id: str) -> list[ScanEvent]:
    """Every event of the scan in step order; the run's end is the last one once it ended."""
    run = conn.execute(
        "SELECT status, ended_at, warning FROM runs WHERE id = ?", (run_id,)
    ).fetchone()
    if run is None:
        return []
    events = [e for e in _call_events(conn, run_id) if e.call != "finish_run"]
    if run["status"] != "running":
        last_error = next((e.error for e in reversed(events) if e.error), None)
        events.append(
            ScanEvent(
                step=len(events) + 1,
                type="scan.finished" if run["status"] == "completed" else "scan.stopped",
                at=run["ended_at"] or (events[-1].at if events else ""),
                call=None,
                state_id=None,
                error=run["warning"] or (last_error if run["status"] != "completed" else None),
                intent=None,
            )
        )
    return events


ACTION_STATES_SQL = "SELECT id, state_id FROM actions WHERE run_id = ?"


def _current_state(events: Sequence[ScanEvent], action_state: dict[str, str]) -> str | None:
    """The page of the latest step that names one: a visit, or the page an action was taken on."""
    for e in reversed(events):
        if e.state_id:
            return e.state_id
        if e.action_id and e.action_id in action_state:
            return action_state[e.action_id]
    return None


STATE_SQL = "SELECT id, route_template, title, screenshot_ref FROM states WHERE id IN ({marks})"


def _route_pages(
    conn: sqlite3.Connection, run_id: str, events: Sequence[ScanEvent]
) -> tuple[list[PageVisit], int, str | None]:
    """Route pages in visit order, the count of every page recorded, the crawler's page."""
    visits = [e for e in events if e.type == "page.visited" and e.state_id]
    ids = list(dict.fromkeys(e.state_id for e in visits if e.state_id))
    if not ids:
        return [], 0, None
    marks = ", ".join("?" for _ in ids)
    states = {r["id"]: r for r in conn.execute(STATE_SQL.format(marks=marks), ids)}
    action_state = {r["id"]: r["state_id"] for r in rows_of(conn, ACTION_STATES_SQL, (run_id,))}
    taken = {e.action_id for e in events if e.call in ("act", "probe_form") and e.action_id}
    # A page the crawler acted on is a route page; so is the one it is on (not acted on yet).
    acted = {action_state[a] for a in taken if a in action_state}
    current = _current_state(events, action_state)
    acted.add(current or "")
    pages: list[PageVisit] = []
    seen: set[str] = set()
    ordinal: dict[str, list[str]] = {}
    for e in visits:
        sid = str(e.state_id)
        if sid in seen:
            continue
        seen.add(sid)
        row = states.get(sid)
        route = row["route_template"] if row else "?"
        same_route = ordinal.setdefault(route, [])
        same_route.append(sid)
        if sid not in acted and pages:
            pages[-1].side_pages += 1
            continue
        pages.append(
            PageVisit(
                order=len(pages) + 1,
                state_id=sid,
                route=route,
                state=len(same_route),
                title=row["title"] if row else route,
                step=e.step,
                at=e.at,
                pages_so_far=len(seen),
                screenshot_ref=row["screenshot_ref"] if row else None,
            )
        )
    return pages, len(seen), current


RUN_SQL = (
    "SELECT id, portal_id, status, started_at, ended_at, run_type, parent_run_id FROM runs"
    " WHERE id = ?"
)
QUEUED_SQL = "SELECT count(*) FROM frontier WHERE run_id = ? AND status = 'pending'"
CHECKPOINT_SQL = (
    "SELECT s.route_template FROM checkpoints c JOIN states s ON s.id = c.state_id"
    " WHERE c.run_id = ? ORDER BY c.updated_at DESC LIMIT 1"
)


def scan_live(conn: sqlite3.Connection, run_id: str) -> ScanLive | None:
    """The scan as the live views show it: counts, route pages, where the crawler is, the stop."""
    run = conn.execute(RUN_SQL, (run_id,)).fetchone()
    if run is None:
        return None
    events = scan_events(conn, run_id)
    pages, recorded, current = _route_pages(conn, run_id, events)
    here = next((p for p in pages if p.state_id == current), pages[-1] if pages else None)
    status = STATUS_WORDS.get(run["status"], "stopped")
    live = ScanLive(
        run_id=run_id,
        portal=run["portal_id"],
        status=status,
        started_at=run["started_at"],
        ended_at=run["ended_at"],
        steps=len(events),
        pages=recorded,
        queued=conn.execute(QUEUED_SQL, (run_id,)).fetchone()[0],
        route_pages=pages,
        here=here,
        continues=run["parent_run_id"] if run["run_type"] == "continue" else None,
        events=events,
    )
    if status == "stopped" and events:
        live.stop_reason = events[-1].error
        if live.here is not None and live.stop_reason:
            live.here.failed = True
            live.failed_at = live.here
    checkpoint = rows_of(conn, CHECKPOINT_SQL, (run_id,))
    live.checkpoint = checkpoint[0][0] if checkpoint else None
    return live


RESOLVE_SQL = "SELECT id FROM runs WHERE portal_id = ? AND id = ?"


def resolve_scan(conn: sqlite3.Connection, portal: str, scan_id: str) -> str | None:
    """The run a full scan id names in the portal (D-9); a prefix or anything else names none."""
    if not SCAN_ID.fullmatch(scan_id):
        return None
    row = conn.execute(RESOLVE_SQL, (portal, scan_id)).fetchone()
    return row[0] if row else None
