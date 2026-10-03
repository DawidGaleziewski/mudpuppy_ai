"""Read queries for the Docs tab (spec 004, R-15): Layer B records, revisions, evidence, sessions.

Pure over a read-only connection, parameterised SQL only. Listings read the denormalised
`doc_records` columns joined to the latest revision (one row per record, no N+1); keyset
pagination on `(kind, seq)` like the other lists. Evidence is resolved with one `IN` query per
target kind. Tables that a store may not have yet (`processes` arrives with migration 0005) are
checked first, so an older store still renders.
"""

from __future__ import annotations

import json
import sqlite3
from collections.abc import Callable
from typing import Any, get_args

from .models import (
    AnalysisSession,
    DocEvidenceLink,
    DocKind,
    DocPortalSummary,
    DocRecord,
    DocRecordDetail,
    DocRecordRow,
    DocReview,
    DocRevision,
    DocStatus,
    FollowupTask,
    Page,
    Process,
    ProcessStep,
    RelationRow,
    ResolvedEvidence,
    RevisionEntry,
    Run,
    RunCitingRecord,
    SessionDetail,
)
from .queries import _count, _rows

DOC_KINDS: tuple[str, ...] = get_args(DocKind)
DOC_STATUSES: tuple[str, ...] = ("draft", "confirmed", "rejected", "superseded", "withdrawn")
CONFIDENCES: tuple[str, ...] = ("observed", "inferred", "needs_confirmation")
FLAGS: tuple[tuple[str, str], ...] = (
    ("open_question", "has open question"),
    ("not_observable", "not observable"),
)

# SRS order (FR-030): id, label, record kinds shown. `overview` and `traceability` are views.
DOC_SECTIONS: tuple[tuple[str, str, tuple[str, ...]], ...] = (
    ("overview", "Overview", ()),
    ("capabilities", "Capabilities", ("capability",)),
    ("screens", "Screens", ("screen",)),
    ("processes", "Processes and use cases", ("process", "use_case")),
    ("requirements", "Requirements", ("requirement",)),
    ("rules", "Business rules", ("business_rule",)),
    ("data", "Data dictionary", ("data_item",)),
    ("glossary", "Glossary", ("glossary_term",)),
    ("nfr", "Non-functional", ("nfr",)),
    ("assumptions", "Assumptions", ("assumption",)),
    ("questions", "Open questions", ("open_question",)),
    ("followups", "Follow-up tasks", ("followup",)),
    ("traceability", "Traceability", ("requirement", "business_rule", "nfr", "use_case")),
)
DOC_SECTION_IDS = {s for s, _, _ in DOC_SECTIONS}
SECTION_KINDS = {s: kinds for s, _, kinds in DOC_SECTIONS}

# The latest revision of a record: what listings show.
_LATEST = "doc_records r JOIN doc_revisions v ON v.record_id = r.id AND v.rev_no = r.latest_rev"
_STATUS_SQL = "CASE WHEN r.withdrawn = 1 THEN 'withdrawn' ELSE v.status END"

_RECORD_COLS = (
    "r.id, r.portal_id, r.kind, r.key, r.seq, r.title, r.latest_rev, r.confirmed_rev,"
    " r.withdrawn, r.created_at, r.updated_at"
)


def table_exists(conn: sqlite3.Connection, name: str) -> bool:
    return (
        conn.execute(
            "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?", (name,)
        ).fetchone()
        is not None
    )


def docs_available(conn: sqlite3.Connection) -> bool:
    return table_exists(conn, "doc_records")


def _json(text: str | None) -> Any:
    try:
        return json.loads(text) if text else None
    except ValueError:
        return None


# --- portals ----------------------------------------------------------------------------------


def doc_portals(conn: sqlite3.Connection) -> list[DocPortalSummary]:
    if not docs_available(conn):
        return []
    by: dict[str, dict[str, int]] = {}
    for r in _rows(
        conn,
        f"SELECT r.portal_id, {_STATUS_SQL}, count(*) FROM {_LATEST} GROUP BY 1, 2",
    ):
        by.setdefault(r[0], {})[r[1]] = r[2]
    sessions = {
        r[0]: (r[1], r[2])
        for r in _rows(
            conn, "SELECT portal_id, count(*), max(started_at) FROM analysis_sessions GROUP BY 1"
        )
    }
    followups = {
        r[0]: r[1]
        for r in _rows(
            conn,
            "SELECT r.portal_id, count(*) FROM followup_tasks f JOIN doc_records r"
            " ON r.id = f.record_id WHERE f.status IN ('open', 'in_progress') GROUP BY 1",
        )
    }
    portals = sorted(set(by) | set(sessions))
    return [
        DocPortalSummary(
            portal_id=p,
            records=sum(by.get(p, {}).values()),
            by_status=by.get(p, {}),
            sessions=sessions.get(p, (0, None))[0],
            last_session_at=sessions.get(p, (0, None))[1],
            open_followups=followups.get(p, 0),
        )
        for p in portals
    ]


def kind_counts(conn: sqlite3.Connection, portal: str) -> dict[str, int]:
    return {
        r[0]: r[1]
        for r in _rows(
            conn,
            "SELECT kind, count(*) FROM doc_records WHERE portal_id = ? GROUP BY kind",
            (portal,),
        )
    }


def status_counts(conn: sqlite3.Connection, portal: str) -> dict[str, int]:
    return {
        r[0]: r[1]
        for r in _rows(
            conn,
            f"SELECT {_STATUS_SQL}, count(*) FROM {_LATEST} WHERE r.portal_id = ? GROUP BY 1",
            (portal,),
        )
    }


def section_counts(conn: sqlite3.Connection, portal: str) -> dict[str, int]:
    """Records per SRS section; `traceability` counts the records its matrix lists."""
    kinds = kind_counts(conn, portal)
    return {
        sid: sum(kinds.get(k, 0) for k in ks) if sid != "overview" else sum(kinds.values())
        for sid, _, ks in DOC_SECTIONS
    }


def portal_known(conn: sqlite3.Connection, portal: str) -> bool:
    if not docs_available(conn):
        return False
    return (
        conn.execute(
            "SELECT 1 FROM doc_records WHERE portal_id = ? UNION ALL"
            " SELECT 1 FROM analysis_sessions WHERE portal_id = ? LIMIT 1",
            (portal, portal),
        ).fetchone()
        is not None
    )


def portal_sessions(
    conn: sqlite3.Connection, portal: str, limit: int = 10
) -> list[AnalysisSession]:
    return [
        AnalysisSession.model_validate(dict(r))
        for r in _rows(
            conn,
            "SELECT * FROM analysis_sessions WHERE portal_id = ? ORDER BY started_at DESC, id DESC"
            " LIMIT ?",
            (portal, limit),
        )
    ]


# --- record listings --------------------------------------------------------------------------


def _row(r: sqlite3.Row) -> DocRecordRow:
    d = dict(r)
    record = DocRecord.model_validate({k: d[k] for k in DocRecord.model_fields})
    content = _json(d.get("content_json")) or {}
    return DocRecordRow(
        record=record,
        rev_no=d["rev_no"],
        status=d["display_status"],
        confidence=d["confidence"],
        not_observable=bool(d["not_observable"]),
        summary=content.get("summary") if isinstance(content, dict) else None,
        followup_status=d.get("followup_status"),
        blocked_reason=d.get("blocked_reason"),
        evidence_count=d.get("evidence_count") or 0,
        run_count=d.get("run_count") or 0,
    )


_ROW_COLS = (
    f"{_RECORD_COLS}, v.rev_no, v.confidence, v.not_observable, v.content_json,"
    f" {_STATUS_SQL} AS display_status, f.status AS followup_status, f.blocked_reason,"
    " (SELECT count(*) FROM doc_evidence_links e WHERE e.revision_id = v.id) AS evidence_count,"
    " (SELECT count(DISTINCT e.run_id) FROM doc_evidence_links e WHERE e.revision_id = v.id)"
    " AS run_count"
)
_ROW_FROM = f"{_LATEST} LEFT JOIN followup_tasks f ON f.record_id = r.id"

_OQ_FLAG = (
    "(r.id IN (SELECT x.to_record_id FROM doc_relations x"
    "   JOIN doc_revisions fv ON fv.id = x.from_revision_id"
    "   JOIN doc_records q ON q.id = fv.record_id AND q.latest_rev = fv.rev_no"
    "  WHERE q.kind = 'open_question')"
    " OR v.id IN (SELECT x.from_revision_id FROM doc_relations x"
    "   JOIN doc_records q ON q.id = x.to_record_id WHERE q.kind = 'open_question')"
    " OR v.id IN (SELECT e.revision_id FROM doc_evidence_links e"
    "  WHERE e.target_kind = 'open_question'))"
)


def list_records(
    conn: sqlite3.Connection,
    portal: str,
    kinds: tuple[str, ...] | list[str],
    *,
    kind: str | None = None,
    status: str | None = None,
    confidence: str | None = None,
    flag: str | None = None,
    cursor: str | None = None,
    limit: int = 50,
) -> Page[DocRecordRow]:
    """Records of `kinds` (narrowed by `kind`), latest revision shown, ordered by (kind, seq)."""
    shown = [kind] if kind in kinds else list(kinds)
    where = ["r.portal_id = ?", f"r.kind IN ({','.join('?' for _ in shown)})"]
    args: list[Any] = [portal, *shown]
    if status:
        where.append(f"{_STATUS_SQL} = ?")
        args.append(status)
    if confidence:
        where.append("v.confidence = ?")
        args.append(confidence)
    if flag == "not_observable":
        where.append("v.not_observable = 1")
    elif flag == "open_question":
        where.append(_OQ_FLAG)
    clause = " AND ".join(where)
    total = _count(conn, f"SELECT count(*) FROM {_LATEST} WHERE {clause}", tuple(args))
    keyset, key_args = _kind_seq_keyset(cursor)
    rows = _rows(
        conn,
        f"SELECT {_ROW_COLS} FROM {_ROW_FROM} WHERE {clause}{keyset}"
        " ORDER BY r.kind, r.seq LIMIT ?",
        (*args, *key_args, limit + 1),
    )
    items = [_row(r) for r in rows[:limit]]
    last = items[-1].record if items else None
    next_cursor = f"{last.kind}:{last.seq}" if last and len(rows) > limit else None
    return Page[DocRecordRow](items=items, total=total, next_cursor=next_cursor)


def attach_related(conn: sqlite3.Connection, rows: list[DocRecordRow]) -> list[DocRecordRow]:
    """Keys of the records each row's latest revision points to (traceability matrix)."""
    if not rows:
        return rows
    ids = [r.record.id for r in rows]
    marks = ",".join("?" for _ in ids)
    related: dict[str, list[str]] = {}
    for r in _rows(
        conn,
        "SELECT v.record_id, t.key FROM doc_records p"
        " JOIN doc_revisions v ON v.record_id = p.id AND v.rev_no = p.latest_rev"
        " JOIN doc_relations x ON x.from_revision_id = v.id"
        f" JOIN doc_records t ON t.id = x.to_record_id WHERE p.id IN ({marks}) ORDER BY t.key",
        tuple(ids),
    ):
        related.setdefault(r[0], []).append(r[1])
    return [row.model_copy(update={"related": related.get(row.record.id, [])}) for row in rows]


# --- one record -------------------------------------------------------------------------------


def _revision(r: sqlite3.Row) -> DocRevision:
    return DocRevision.model_validate(dict(r))


def _status_of(record: DocRecord, revision: DocRevision) -> DocStatus:
    return (
        "withdrawn"
        if record.withdrawn and revision.rev_no == record.latest_rev
        else revision.status
    )  # type: ignore[return-value]


def get_record(conn: sqlite3.Connection, portal: str, key: str) -> DocRecord | None:
    if not docs_available(conn):
        return None
    row = conn.execute(
        "SELECT * FROM doc_records WHERE portal_id = ? AND key = ?", (portal, key)
    ).fetchone()
    return DocRecord.model_validate(dict(row)) if row else None


def record_detail(
    conn: sqlite3.Connection, portal: str, key: str, rev: int | None = None
) -> DocRecordDetail | None:
    record = get_record(conn, portal, key)
    if record is None:
        return None
    revisions = [
        _revision(r)
        for r in _rows(
            conn,
            "SELECT * FROM doc_revisions WHERE record_id = ? ORDER BY rev_no",
            (record.id,),
        )
    ]
    if not revisions:
        return None
    by_no = {v.rev_no: v for v in revisions}
    shown = by_no.get(rev) if rev else None
    shown = shown or by_no.get(record.latest_rev) or revisions[-1]
    reviews: dict[str, list[DocReview]] = {}
    for r in _rows(
        conn,
        "SELECT rv.* FROM doc_reviews rv JOIN doc_revisions v ON v.id = rv.revision_id"
        " WHERE v.record_id = ? ORDER BY rv.created_at, rv.id",
        (record.id,),
    ):
        reviews.setdefault(r["revision_id"], []).append(DocReview.model_validate(dict(r)))
    links = [
        DocEvidenceLink.model_validate(dict(r))
        for r in _rows(
            conn,
            "SELECT * FROM doc_evidence_links WHERE revision_id = ? ORDER BY target_kind, id",
            (shown.id,),
        )
    ]
    followup_row = conn.execute(
        "SELECT * FROM followup_tasks WHERE record_id = ?", (record.id,)
    ).fetchone()
    session = conn.execute(
        "SELECT started_at FROM analysis_sessions WHERE id = ?", (shown.session_id,)
    ).fetchone()
    return DocRecordDetail(
        record=record,
        status=_status_of(record, shown),
        shown=shown,
        is_latest=shown.rev_no == record.latest_rev,
        history=[
            RevisionEntry(revision=v, reviews=reviews.get(v.id, [])) for v in reversed(revisions)
        ],
        evidence=resolve_evidence(conn, links),
        relations_out=_relations(conn, shown.id, outgoing=True),
        relations_in=_relations(conn, record.id, outgoing=False),
        followup=FollowupTask.model_validate(dict(followup_row)) if followup_row else None,
        session_started_at=session[0] if session else None,
    )


def _relations(conn: sqlite3.Connection, anchor: str, *, outgoing: bool) -> list[RelationRow]:
    """Out: what a revision points at. In: latest revisions of records pointing at a record."""
    if outgoing:
        sql = (
            "SELECT x.type, t.id AS record_id, t.key, t.title, t.kind,"
            " CASE WHEN t.withdrawn = 1 THEN 'withdrawn' ELSE tv.status END AS status"
            " FROM doc_relations x JOIN doc_records t ON t.id = x.to_record_id"
            " JOIN doc_revisions tv ON tv.record_id = t.id AND tv.rev_no = t.latest_rev"
            " WHERE x.from_revision_id = ? ORDER BY x.type, t.kind, t.seq"
        )
    else:
        sql = (
            "SELECT x.type, f.id AS record_id, f.key, f.title, f.kind,"
            " CASE WHEN f.withdrawn = 1 THEN 'withdrawn' ELSE fv.status END AS status"
            " FROM doc_relations x JOIN doc_revisions fv ON fv.id = x.from_revision_id"
            " JOIN doc_records f ON f.id = fv.record_id AND f.latest_rev = fv.rev_no"
            " WHERE x.to_record_id = ? ORDER BY x.type, f.kind, f.seq"
        )
    return [RelationRow.model_validate(dict(r)) for r in _rows(conn, sql, (anchor,))]


# --- evidence ---------------------------------------------------------------------------------


def _form_label(row: sqlite3.Row) -> str:
    fields = _json(row["fields_json"])
    names = (
        [f.get("name") for f in fields if isinstance(f, dict)] if isinstance(fields, list) else []
    )
    return "form: " + (", ".join(str(n) for n in names[:4]) or row["id"])


def _action_label(row: sqlite3.Row) -> str:
    return f'{row["role"]} "{row["accessible_name"] or ""}"'


def _edge_label(row: sqlite3.Row) -> str:
    action = _json(row["action_json"])
    name = action.get("accessible_name") if isinstance(action, dict) else None
    return f'edge: "{name}"' if name else f"edge {row['id']}"


# kind -> (table, run tab, label from the row). `doc_record` and `review` are handled apart.
_TARGETS: dict[str, tuple[str, str, Callable[[sqlite3.Row], str]]] = {
    "state": ("states", "states", lambda r: f"{r['title']} ({r['route_template']})"),
    "edge": ("edges", "states", _edge_label),
    "action": ("actions", "actions", _action_label),
    "form": ("forms", "forms", _form_label),
    "network_call": ("network_calls", "network", lambda r: f"{r['method']} {r['url_template']}"),
    "rule_candidate": ("rule_candidates", "states", lambda r: r["text"]),
    "open_question": ("open_questions", "states", lambda r: r["text"]),
    "decision": (
        "decision_log",
        "decisions",
        lambda r: f"{r['kind']} {r['rule'] or ''}: {r['reason']}".strip(),
    ),
    "process": ("processes", "process", lambda r: r["name"]),
    "process_step": ("process_steps", "process", lambda r: f"step {r['ord']}: {r['intent']}"),
}


EVIDENCE_TABS: dict[str, str] = {kind: spec[1] for kind, spec in _TARGETS.items()}


def resolve_evidence(
    conn: sqlite3.Connection, links: list[DocEvidenceLink]
) -> list[ResolvedEvidence]:
    """Look every link's target up (one query per target kind) and attach its run's mode and date.

    `broken`: the target's table exists but the row is gone (a portal delete, a bad id).
    A kind this store has no table for stays unresolved without being called broken."""
    found: dict[tuple[str, str], str] = {}
    doc_keys: dict[str, str] = {}
    for kind in {link.target_kind for link in links}:
        ids = sorted({link.target_id for link in links if link.target_kind == kind})
        marks = ",".join("?" for _ in ids)
        if kind in _TARGETS:
            table, _, label = _TARGETS[kind]
            if table_exists(conn, table):
                for r in _rows(conn, f"SELECT * FROM {table} WHERE id IN ({marks})", tuple(ids)):
                    found[(kind, r["id"])] = label(r)
        elif kind == "doc_record":
            for r in _rows(
                conn, f"SELECT id, key, title FROM doc_records WHERE id IN ({marks})", tuple(ids)
            ):
                found[(kind, r["id"])] = f"{r['key']}: {r['title']}"
                doc_keys[r["id"]] = r["key"]
        elif kind == "review":
            for r in _rows(
                conn,
                f"SELECT id, action, reviewer FROM doc_reviews WHERE id IN ({marks})",
                tuple(ids),
            ):
                found[(kind, r["id"])] = f"review ({r['action']}) by {r['reviewer']}"
    run_ids = sorted({link.run_id for link in links if link.run_id})
    runs = {
        r["id"]: r
        for r in _rows(
            conn,
            f"SELECT id, mode, started_at FROM runs WHERE id IN ({','.join('?' for _ in run_ids)})",
            tuple(run_ids),
        )
    }
    out = []
    for link in links:
        label = found.get((link.target_kind, link.target_id))
        known_table = link.target_kind in ("doc_record", "review") or (
            link.target_kind in _TARGETS and table_exists(conn, _TARGETS[link.target_kind][0])
        )
        run = runs.get(link.run_id) if link.run_id else None
        out.append(
            ResolvedEvidence(
                link=link,
                label=label,
                resolved=label is not None,
                broken=known_table and label is None,
                run_mode=run["mode"] if run else None,
                run_started_at=run["started_at"] if run else None,
                tab=_TARGETS[link.target_kind][1] if link.target_kind in _TARGETS else None,
                doc_key=doc_keys.get(link.target_id) if link.target_kind == "doc_record" else None,
            )
        )
    return out


# --- run -> records (FR-033) ------------------------------------------------------------------


def run_citing_count(conn: sqlite3.Connection, run_id: str) -> int:
    if not docs_available(conn):
        return 0
    return _count(
        conn,
        "SELECT count(DISTINCT r.id) FROM doc_evidence_links e"
        " JOIN doc_revisions v ON v.id = e.revision_id"
        " JOIN doc_records r ON r.id = v.record_id AND r.latest_rev = v.rev_no"
        " WHERE e.run_id = ?",
        (run_id,),
    )


def run_citing_records(
    conn: sqlite3.Connection, run_id: str, *, cursor: str | None = None, limit: int = 50
) -> Page[RunCitingRecord]:
    """Records whose latest revision cites this run's evidence, with what they cite."""
    if not docs_available(conn):
        return Page[RunCitingRecord](items=[], total=0, next_cursor=None)
    total = run_citing_count(conn, run_id)
    keyset = " AND r.id > ?" if cursor else ""
    rows = _rows(
        conn,
        f"SELECT {_ROW_COLS} FROM {_ROW_FROM} WHERE r.id IN ("
        " SELECT v2.record_id FROM doc_evidence_links e JOIN doc_revisions v2"
        "  ON v2.id = e.revision_id WHERE e.run_id = ?)"
        f"{keyset} ORDER BY r.id LIMIT ?",
        (run_id, *((cursor,) if cursor else ()), limit + 1),
    )
    page_rows = rows[:limit]
    cites: dict[str, list[DocEvidenceLink]] = {}
    if page_rows:
        marks = ",".join("?" for _ in page_rows)
        for r in _rows(
            conn,
            "SELECT e.*, v.record_id AS rec FROM doc_evidence_links e"
            " JOIN doc_revisions v ON v.id = e.revision_id"
            f" WHERE e.run_id = ? AND v.record_id IN ({marks}) ORDER BY e.target_kind, e.id",
            (run_id, *[r["id"] for r in page_rows]),
        ):
            d = dict(r)
            rec = d.pop("rec")
            cites.setdefault(rec, []).append(DocEvidenceLink.model_validate(d))
    items = [RunCitingRecord(row=_row(r), cites=cites.get(r["id"], [])) for r in page_rows]
    return Page[RunCitingRecord](
        items=items, total=total, next_cursor=page_rows[-1]["id"] if len(rows) > limit else None
    )


# --- sessions ---------------------------------------------------------------------------------


def _kind_seq_keyset(cursor: str | None) -> tuple[str, list[Any]]:
    """Keyset clause and args for a `kind:seq` cursor ('' when there is none or it is malformed)."""
    if cursor and ":" in cursor:
        c_kind, _, c_seq = cursor.rpartition(":")
        if c_seq.isdigit():
            return " AND (r.kind > ? OR (r.kind = ? AND r.seq > ?))", [c_kind, c_kind, int(c_seq)]
    return "", []


def session_detail(
    conn: sqlite3.Connection,
    portal: str,
    session_id: str,
    cursor: str | None = None,
    limit: int = 50,
) -> SessionDetail | None:
    if not docs_available(conn):
        return None
    row = conn.execute(
        "SELECT * FROM analysis_sessions WHERE id = ? AND portal_id = ?", (session_id, portal)
    ).fetchone()
    if row is None:
        return None
    runs = [
        Run.model_validate(dict(r))
        for r in _rows(
            conn,
            "SELECT r.* FROM analysis_session_runs s JOIN runs r ON r.id = s.run_id"
            " WHERE s.session_id = ? ORDER BY r.started_at, r.id",
            (session_id,),
        )
    ]
    in_session = "r.id IN (SELECT record_id FROM doc_revisions WHERE session_id = ?)"
    total = _count(conn, f"SELECT count(*) FROM doc_records r WHERE {in_session}", (session_id,))
    keyset, key_args = _kind_seq_keyset(cursor)
    rows = _rows(
        conn,
        f"SELECT {_ROW_COLS}, (SELECT w.change FROM doc_revisions w WHERE w.record_id = r.id"
        "  AND w.session_id = ? ORDER BY w.rev_no LIMIT 1) AS change"
        f" FROM {_ROW_FROM} WHERE {in_session}{keyset} ORDER BY r.kind, r.seq LIMIT ?",
        (session_id, session_id, *key_args, limit + 1),
    )
    written = [_row(r) for r in rows[:limit]]
    last = written[-1].record if written else None
    return SessionDetail(
        session=AnalysisSession.model_validate(dict(row)),
        runs=runs,
        written=written,
        written_total=total,
        next_cursor=f"{last.kind}:{last.seq}" if last and len(rows) > limit else None,
        changes={r["id"]: r["change"] for r in rows[:limit]},
    )


# --- processes (trace runs; migration 0005) ---------------------------------------------------


def process_for_run(
    conn: sqlite3.Connection, run_id: str
) -> tuple[Process, list[ProcessStep]] | None:
    if not table_exists(conn, "processes"):
        return None
    row = conn.execute("SELECT * FROM processes WHERE run_id = ?", (run_id,)).fetchone()
    if row is None:
        return None
    process = Process.model_validate(dict(row))
    steps = [
        ProcessStep.model_validate(dict(r))
        for r in _rows(
            conn, "SELECT * FROM process_steps WHERE process_id = ? ORDER BY ord", (process.id,)
        )
    ]
    return process, steps


def process_step_count(conn: sqlite3.Connection, run_id: str) -> int:
    if not table_exists(conn, "processes"):
        return 0
    return _count(
        conn,
        "SELECT count(*) FROM process_steps s JOIN processes p ON p.id = s.process_id"
        " WHERE p.run_id = ?",
        (run_id,),
    )


def action_name(conn: sqlite3.Connection, action_id: str | None) -> str | None:
    if not action_id:
        return None
    row = conn.execute(
        "SELECT role, accessible_name FROM actions WHERE id = ?", (action_id,)
    ).fetchone()
    return f'{row["role"]} "{row["accessible_name"] or ""}"' if row else None


def process_diagram_input(
    conn: sqlite3.Connection, detail: DocRecordDetail
) -> dict[str, Any] | None:
    """`process_map` input for a PROC record: the steps of the trace run its evidence cites.

    None when the record was never traced (`map_only`), cites no trace run, or the store has no
    process tables."""
    content = detail.shown.content_json if isinstance(detail.shown.content_json, dict) else {}
    if content.get("observed_extent") == "map_only":
        return None
    run_ids = [
        e.link.run_id
        for e in detail.evidence
        if e.link.target_kind in ("process", "process_step") and e.link.run_id
    ]
    for run_id in dict.fromkeys(run_ids):
        found = process_for_run(conn, run_id)
        if found is None or not found[1]:
            continue
        process, steps = found
        boundary = None
        if process.outcome == "boundary_reached" and process.boundary_action_id:
            boundary = {
                "action": action_name(conn, process.boundary_action_id) or "boundary",
                "not_observable": process.not_observable or "not observable",
            }
        return {
            "process": {"key": detail.record.key, "title": detail.record.title},
            "steps": [{"ord": s.ord, "kind": s.kind, "intent": s.intent} for s in steps],
            "boundary": boundary,
        }
    return None


def capability_diagram_input(conn: sqlite3.Connection, portal: str) -> dict[str, Any]:
    """`capability_map` input: capabilities with the records they `contain` (latest revisions)."""
    caps = _rows(
        conn,
        "SELECT r.id, r.key, r.title FROM doc_records r"
        " WHERE r.portal_id = ? AND r.kind = 'capability' AND r.withdrawn = 0 ORDER BY r.seq",
        (portal,),
    )
    contains: dict[str, list[dict[str, str]]] = {c["id"]: [] for c in caps}
    for r in _rows(
        conn,
        "SELECT p.id AS pid, t.key, t.title FROM doc_records p"
        " JOIN doc_revisions v ON v.record_id = p.id AND v.rev_no = p.latest_rev"
        " JOIN doc_relations x ON x.from_revision_id = v.id AND x.type = 'contains'"
        " JOIN doc_records t ON t.id = x.to_record_id"
        " WHERE p.portal_id = ? AND p.kind = 'capability' AND t.withdrawn = 0",
        (portal,),
    ):
        contains[r["pid"]].append({"key": r["key"], "title": r["title"]})
    return {
        "capabilities": [
            {"key": c["key"], "title": c["title"], "contains": contains[c["id"]]} for c in caps
        ]
    }


def screen_diagram_input(conn: sqlite3.Connection, portal: str, limit: int = 200) -> dict[str, Any]:
    """`screen_nav` input: screens, and transitions where an edge leads from a state a screen
    cites to a state another screen cites (edge label = the action's accessible name)."""
    screens = _rows(
        conn,
        "SELECT r.id, r.key, r.title FROM doc_records r WHERE r.portal_id = ? AND r.kind = 'screen'"
        " AND r.withdrawn = 0 ORDER BY r.seq",
        (portal,),
    )
    state_owner: dict[str, str] = {}
    for r in _rows(
        conn,
        "SELECT p.key, e.target_id FROM doc_records p"
        " JOIN doc_revisions v ON v.record_id = p.id AND v.rev_no = p.latest_rev"
        " JOIN doc_evidence_links e ON e.revision_id = v.id AND e.target_kind = 'state'"
        " WHERE p.portal_id = ? AND p.kind = 'screen' AND p.withdrawn = 0 ORDER BY p.seq",
        (portal,),
    ):
        state_owner.setdefault(r["target_id"], r["key"])
    pairs: dict[tuple[str, str], str] = {}  # one transition per (from, to): the first label
    if state_owner:
        marks = ",".join("?" for _ in state_owner)
        for r in _rows(
            conn,
            "SELECT from_state, to_state, action_json FROM edges"
            f" WHERE from_state IN ({marks}) AND to_state IN ({marks}) ORDER BY id LIMIT ?",
            (*state_owner, *state_owner, limit),
        ):
            a, b = state_owner[r["from_state"]], state_owner[r["to_state"]]
            action = _json(r["action_json"])
            name = action.get("accessible_name") if isinstance(action, dict) else None
            if a != b and name:
                pairs.setdefault((a, b), str(name))
    # Global navigation (a menu present on every page) would turn the diagram into a hairball:
    # a target reached from more than half of the screens is left out and only counted.
    sources: dict[str, set[str]] = {}
    for a, b in pairs:
        sources.setdefault(b, set()).add(a)
    global_targets = {b for b, srcs in sources.items() if len(srcs) > max(3, len(screens) // 2)}
    kept = {p: label for p, label in pairs.items() if p[1] not in global_targets}
    return {
        "screens": [{"key": s["key"], "title": s["title"]} for s in screens],
        "transitions": [{"from": a, "to": b, "label": label} for (a, b), label in kept.items()],
        "omitted": len(pairs) - len(kept),
    }
