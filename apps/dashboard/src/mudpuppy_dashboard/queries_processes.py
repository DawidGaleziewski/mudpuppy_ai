"""Read models for the Processes workspace (spec 022 M5, screens 04–07): the portal's BA
processes with their models and live markers, the assistant's open suggestions, the screens in no
process, and one process with every revision, draft and change spec. Read-only; each read gives
nothing on a store older than migration 0018."""

from __future__ import annotations

import json
import sqlite3
from typing import Any

from pydantic import BaseModel

from .models import (
    BaProcess,
    BaProcessRevision,
    ChangeSpecRevision,
    GroupingSuggestion,
    ProcessDraft,
    ProcessLive,
    ProcessModel,
    ProcessModelRevision,
    State,
)

ENVIRONMENTS = ("sandbox", "staging", "production")
STAGES = ("scoped", "as_is_documented", "to_be_design", "migrating", "migrated")


class ModelView(BaseModel):
    model: ProcessModel
    head: ProcessModelRevision
    revisions: list[ProcessModelRevision]  # r1 first
    drafts: list[ProcessDraft]  # every person's open draft

    @property
    def steps(self) -> list[dict[str, Any]]:
        return list(self.head.steps)

    def revision(self, rev: int) -> ProcessModelRevision | None:
        return next((r for r in self.revisions if r.rev == rev), None)

    def draft_of(self, author: str | None) -> ProcessDraft | None:
        return next((d for d in self.drafts if d.author == author), None)


class LiveView(BaseModel):
    environment: str
    label: str
    rev: int
    marks: list[ProcessLive]  # newest first; marks[0] is the current one


class ProcessView(BaseModel):
    process: BaProcess
    revisions: list[BaProcessRevision]
    models: list[ModelView]  # A first
    live: list[LiveView]
    specs: list[ChangeSpecRevision]  # newest first

    def model(self, label: str) -> ModelView | None:
        return next((v for v in self.models if v.model.label == label), None)

    @property
    def as_is(self) -> ModelView | None:
        return self.model("A")

    def live_in(self, env: str) -> LiveView | None:
        return next((lv for lv in self.live if lv.environment == env), None)


class ProcessRow(BaseModel):
    process: BaProcess
    models: list[tuple[str, str, int, int]]  # label, kind, rev, open drafts
    live: dict[str, str]  # environment → "B r2"
    screens: int  # steps of the as-is head
    amendments: int  # active amendments on those screens
    start_route: str | None
    end_route: str | None
    last_by: str
    last_at: str


def _rows(conn: sqlite3.Connection, sql: str, args: tuple[Any, ...]) -> list[sqlite3.Row]:
    try:
        return conn.execute(sql, args).fetchall()
    except sqlite3.OperationalError:
        return []


def _model_views(conn: sqlite3.Connection, process_id: str) -> list[ModelView]:
    models = [
        ProcessModel.model_validate(dict(r))
        for r in _rows(
            conn,
            "SELECT * FROM process_models WHERE process_id = ? ORDER BY length(label), label",
            (process_id,),
        )
    ]
    views = []
    for v in models:
        revs = [
            ProcessModelRevision.model_validate(dict(r))
            for r in _rows(
                conn,
                "SELECT * FROM process_model_revisions WHERE model_id = ? ORDER BY rev",
                (v.id,),
            )
        ]
        drafts = [
            ProcessDraft.model_validate(dict(r))
            for r in _rows(
                conn,
                "SELECT * FROM process_drafts WHERE model_id = ? ORDER BY updated_at DESC",
                (v.id,),
            )
        ]
        head = next((r for r in revs if r.rev == v.rev), None)
        if head is not None:
            views.append(ModelView(model=v, head=head, revisions=revs, drafts=drafts))
    return views


def _live(conn: sqlite3.Connection, process_id: str, labels: dict[str, str]) -> list[LiveView]:
    marks = [
        ProcessLive.model_validate(dict(r))
        for r in _rows(
            conn,
            "SELECT * FROM process_live WHERE process_id = ? ORDER BY created_at DESC, id DESC",
            (process_id,),
        )
    ]
    out = []
    for env in ENVIRONMENTS:
        mine = [m for m in marks if m.environment == env]
        if mine:
            label = labels.get(mine[0].model_id, "?")
            out.append(LiveView(environment=env, label=label, rev=mine[0].model_rev, marks=mine))
    return out


AS_IS_STAGES = ("scoped", "as_is_documented")


def default_model(view: ProcessView) -> str:
    """US2.3: a process page leads with A until a to-be design starts, then with the first
    to-be (the htmx page and the React console's API alike)."""
    if view.process.stage in AS_IS_STAGES:
        return "A"
    return next((v.model.label for v in view.models if v.model.kind == "to_be"), "A")


def parent_steps(view: ProcessView, label: str) -> list[dict[str, Any]]:
    """The steps of the revision model `label` was branched from (what Compare diffs it to)."""
    vv = view.model(label)
    if vv is None or vv.model.branched_from_model_id is None:
        return []
    parent = next((p for p in view.models if p.model.id == vv.model.branched_from_model_id), None)
    rev = parent.revision(vv.model.branched_from_rev or 0) if parent else None
    return list(rev.steps) if rev else []


def pending_changes(head: list[dict[str, Any]], draft: list[dict[str, Any]]) -> int:
    """How many steps a draft adds, removes or changes against the revision it edits."""
    by_id = {s["id"]: s for s in head}
    changed = sum(1 for s in draft if by_id.get(s["id"]) != s)
    removed = len(set(by_id) - {s["id"] for s in draft})
    return changed + removed


def process_view(conn: sqlite3.Connection, portal: str, key: str) -> ProcessView | None:
    """One process with every model, revision, draft, live marker and change spec."""
    found = _rows(conn, "SELECT * FROM ba_processes WHERE portal_id = ? AND key = ?", (portal, key))
    if not found:
        return None
    process = BaProcess.model_validate(dict(found[0]))
    models = _model_views(conn, process.id)
    labels = {v.model.id: v.model.label for v in models}
    return ProcessView(
        process=process,
        revisions=[
            BaProcessRevision.model_validate(dict(r))
            for r in _rows(
                conn,
                "SELECT * FROM ba_process_revisions WHERE process_id = ? ORDER BY rev",
                (process.id,),
            )
        ],
        models=models,
        live=_live(conn, process.id, labels),
        specs=[
            ChangeSpecRevision.model_validate(dict(r))
            for r in _rows(
                conn,
                "SELECT * FROM change_spec_revisions WHERE process_id = ? ORDER BY rev DESC",
                (process.id,),
            )
        ],
    )


def _amendment_count(conn: sqlite3.Connection, portal: str, state_ids: list[str]) -> int:
    if not state_ids:
        return 0
    marks = ", ".join("?" for _ in state_ids)
    rows = _rows(
        conn,
        "SELECT count(*) FROM amendments WHERE portal_id = ? AND status = 'active'"
        f" AND substr(target_id, 1, instr(target_id || '#', '#') - 1) IN ({marks})",
        (portal, *state_ids),
    )
    return int(rows[0][0]) if rows else 0


def portal_processes(
    conn: sqlite3.Connection, portal: str | None, archived: bool = False
) -> list[ProcessRow]:
    """The portal's BA processes by key for the list (screen 04): those in use, or with
    `archived` the archived ones (spec 027 US4; a store before 0028 has none archived)."""
    if not portal:
        return []
    out = []
    keys = _rows(conn, "SELECT key FROM ba_processes WHERE portal_id = ? ORDER BY key", (portal,))
    for (key,) in keys:
        view = process_view(conn, portal, key)
        if view is None or view.as_is is None:
            continue
        if (view.process.archived_at is not None) != archived:
            continue
        steps = view.as_is.steps
        newest = max([r for v in view.models for r in v.revisions], key=lambda r: r.created_at)
        out.append(
            ProcessRow(
                process=view.process,
                models=[
                    (v.model.label, v.model.kind, v.model.rev, len(v.drafts)) for v in view.models
                ],
                live={lv.environment: f"{lv.label} r{lv.rev}" for lv in view.live},
                screens=len(steps),
                amendments=_amendment_count(
                    conn, portal, [s["state_id"] for s in steps if s.get("state_id")]
                ),
                start_route=steps[0].get("route") if steps else None,
                end_route=steps[-1].get("route") if steps else None,
                last_by=newest.author,
                last_at=newest.created_at,
            )
        )
    return out


def open_suggestions(conn: sqlite3.Connection, portal: str | None) -> list[GroupingSuggestion]:
    if not portal:
        return []
    return [
        GroupingSuggestion.model_validate(dict(r))
        for r in _rows(
            conn,
            "SELECT * FROM grouping_suggestions WHERE portal_id = ? AND status = 'open'"
            " ORDER BY created_at",
            (portal,),
        )
    ]


def loose_screens(conn: sqlite3.Connection, portal: str | None) -> list[State]:
    """Screens (newest revision of each) that no process's as-is includes."""
    if not portal:
        return []
    used = {s.get("state_id") for steps in _as_is_steps(conn, portal) for s in steps}
    return [s for s in portal_screens(conn, portal) if s.id not in used]


def portal_screens(conn: sqlite3.Connection, portal: str) -> list[State]:
    """Every recorded screen of the portal, newest revision of each, by route."""
    try:
        rows = conn.execute(
            "SELECT * FROM states s WHERE s.portal_id = ? AND (s.screen_id IS NULL"
            " OR s.screen_rev = (SELECT max(t.screen_rev) FROM states t"
            " WHERE t.screen_id = s.screen_id))"
            " ORDER BY s.route_template, s.title",
            (portal,),
        ).fetchall()
    except sqlite3.OperationalError:
        return []
    return [State.model_validate(dict(r)) for r in rows]


def linked_process(conn: sqlite3.Connection, portal: str, record_key: str) -> str | None:
    """The PRC key opened from a BA process record (spec 027 US6.2), if any. Since spec 039 T070
    every PROC record has its process from the start; it counts as opened once it has an A."""
    rows = _rows(
        conn,
        "SELECT p.key FROM ba_processes p WHERE p.portal_id = ? AND p.record_key = ?"
        " AND EXISTS (SELECT 1 FROM process_models m WHERE m.process_id = p.id AND m.label = 'A')"
        " ORDER BY p.key LIMIT 1",
        (portal, record_key),
    )
    return str(rows[0][0]) if rows else None


def archived_count(conn: sqlite3.Connection, portal: str | None) -> int:
    """How many of the portal's processes are archived (0 on a store before 0028)."""
    rows = _rows(
        conn,
        "SELECT count(*) FROM ba_processes WHERE portal_id = ? AND archived_at IS NOT NULL",
        (portal,),
    )
    return int(rows[0][0]) if rows else 0


def _as_is_steps(conn: sqlite3.Connection, portal: str) -> list[list[dict[str, Any]]]:
    """The steps of every process's as-is head in the portal; an archived process is out of
    the BA's cut, so its screens count as in no process (spec 027, open question 3)."""
    archived = {
        r[0]
        for r in _rows(
            conn,
            "SELECT id FROM ba_processes WHERE portal_id = ? AND archived_at IS NOT NULL",
            (portal,),
        )
    }
    rows = _rows(
        conn,
        "SELECT p.id, r.steps FROM ba_processes p JOIN process_models v"
        " ON v.process_id = p.id AND v.label = 'A' JOIN process_model_revisions r"
        " ON r.model_id = v.id AND r.rev = v.rev WHERE p.portal_id = ?",
        (portal,),
    )
    return [json.loads(r[1]) for r in rows if r[0] not in archived]


def scans_of(conn: sqlite3.Connection, state_ids: list[str]) -> int:
    """How many scans observed any of these screens (the change spec's as-is line)."""
    if not state_ids:
        return 0
    marks = ", ".join("?" for _ in state_ids)
    rows = _rows(
        conn,
        f"SELECT count(DISTINCT run_id) FROM state_observations WHERE state_id IN ({marks})",
        tuple(state_ids),
    )
    return int(rows[0][0]) if rows else 0


def citing_records(conn: sqlite3.Connection, state_ids: list[str]) -> list[str]:
    """`KEY title` of records whose latest revision cites any of these screens."""
    if not state_ids:
        return []
    marks = ", ".join("?" for _ in state_ids)
    rows = _rows(
        conn,
        "SELECT DISTINCT r.key, r.title FROM doc_records r"
        " JOIN doc_revisions v ON v.record_id = r.id AND v.rev_no = r.latest_rev"
        " JOIN doc_evidence l ON l.revision_id = v.id"
        f" WHERE r.withdrawn = 0 AND l.target_kind IN ('state', 'screen_region')"
        f" AND l.target_id IN ({marks}) ORDER BY r.kind, r.seq",
        tuple(state_ids),
    )
    return [f"{r['key']} {r['title']}" for r in rows]
