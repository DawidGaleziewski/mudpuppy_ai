"""As of (spec 040 FR-001, designer 12-v2-ux.md § 2): the model pages (Processes, Screens, Map,
Rules) as they were when a past model version was built. The connection gets TEMP views named
like the tables they hide: SQLite resolves an unqualified name to the temp schema first, so every
read model runs unchanged and sees only what existed at the cutoff (the version's `built_at`).
Rows are cut by time or by model version; columns that only hold the current value (a screen's
status, a process's revision) are worked out as of the cutoff where the store keeps the history,
and kept as they are where it does not (an action's status before its last change: F-04). The
store file is never written: TEMP objects live in the connection's own temp schema.
"""

from __future__ import annotations

import re
import sqlite3
from dataclasses import dataclass
from typing import Any

from .queries_releases import part_name, release_name

# Model versions built by the cutoff (`:t`).
_BUILT = "SELECT id FROM main.model_versions WHERE built_at <= :t"
_IN_BUILT = f"IN ({_BUILT})"

# table → (rows kept, {column: its value as of the cutoff}). `t` is the table's alias.
VIEWS: dict[str, tuple[str, dict[str, str]]] = {
    "model_versions": ("t.built_at <= :t", {}),
    "model_screens": (
        f"t.first_model_version {_IN_BUILT}",
        {
            "status": "coalesce((SELECT CASE l.kind WHEN 'retire' THEN 'retired'"
            " WHEN 'merge' THEN 'merged' ELSE 'active' END FROM main.screen_lineage l"
            " JOIN main.model_versions v ON v.id = l.model_version_id"
            " WHERE l.from_screen_id = t.id AND v.built_at <= :t"
            " AND l.kind IN ('retire', 'merge', 'revive') ORDER BY v.seq DESC LIMIT 1), 'active')"
        },
    ),
    "screen_members": (
        f"t.from_model_version {_IN_BUILT}",
        {
            "to_model_version": f"CASE WHEN t.to_model_version {_IN_BUILT}"
            " THEN t.to_model_version END"
        },
    ),
    "screen_lineage": (f"t.model_version_id {_IN_BUILT}", {}),
    "build_epochs": (f"t.model_version_id {_IN_BUILT}", {}),
    "process_instances": (f"t.model_version_id {_IN_BUILT}", {}),
    "deviations": (f"t.model_version_id {_IN_BUILT}", {}),
    "hypotheses": (f"t.model_version_id {_IN_BUILT} AND t.created_at <= :t", {}),
    "hypothesis_events": ("t.at <= :t", {}),
    "hypothesis_tests": ("t.created_at <= :t", {}),
    "hypothesis_wordings": ("t.at <= :t", {}),
    "action_classes": (
        "1",
        {"status": f"CASE WHEN t.status_model_version {_IN_BUILT} THEN t.status ELSE 'active' END"},
    ),
    "model_transitions": (
        "t.first_seen_transition_id IN (SELECT id FROM main.transitions WHERE created_at <= :t)",
        {"status": f"CASE WHEN t.status_model_version {_IN_BUILT} THEN t.status ELSE 'active' END"},
    ),
    "observations": ("t.created_at <= :t", {}),
    "state_observations": ("t.observed_at <= :t", {}),
    "transitions": ("t.created_at <= :t", {}),
    "states": ("t.created_at <= :t", {}),
    "runs": ("t.started_at <= :t", {}),
    "ba_processes": (
        "t.created_at <= :t",
        {
            "rev": "(SELECT max(r.rev) FROM main.ba_process_revisions r"
            " WHERE r.process_id = t.id AND r.created_at <= :t)",
            "name": "coalesce((SELECT r.name FROM main.ba_process_revisions r"
            " WHERE r.process_id = t.id AND r.created_at <= :t ORDER BY r.rev DESC LIMIT 1),"
            " t.name)",
            "stage": "coalesce((SELECT r.stage FROM main.ba_process_revisions r"
            " WHERE r.process_id = t.id AND r.created_at <= :t ORDER BY r.rev DESC LIMIT 1),"
            " t.stage)",
            "archived_at": "CASE WHEN t.archived_at <= :t THEN t.archived_at END",
        },
    ),
    "ba_process_revisions": ("t.created_at <= :t", {}),
    "process_models": (
        "t.created_at <= :t",
        {
            "rev": "(SELECT max(r.rev) FROM main.process_model_revisions r"
            " WHERE r.model_id = t.id AND r.created_at <= :t)"
        },
    ),
    "process_model_revisions": ("t.created_at <= :t", {}),
    "process_explorations": ("t.completed_at <= :t", {}),
    "grouping_suggestions": (
        "t.created_at <= :t",
        {
            "status": "CASE WHEN t.decided_at <= :t THEN t.status ELSE 'open' END",
            "decided_at": "CASE WHEN t.decided_at <= :t THEN t.decided_at END",
        },
    ),
}

# The model pages' API that follows As of (FR-001): a portal's processes, screens, map and rules.
MODEL_API = re.compile(r"^/api/portals/(?P<portal>[^/]+)/(processes|screens|map|rules)(/|$)")


def follows(path: str) -> str | None:
    """The portal of a model page's API address, or None for any other address."""
    m = MODEL_API.match(path)
    return m["portal"] if m else None


@dataclass(frozen=True)
class Version:
    """A model version in the As of menu: "Version 4 · 9c21 App kalkulator · 16 Oct · scan …"."""

    seq: int
    built_at: str
    releases: tuple[str, ...]  # "9c21 · App kalkulator", one per part that got a new release
    scan: str | None  # the last scan it includes


def _columns(conn: sqlite3.Connection, table: str) -> list[str]:
    return [r[1] for r in conn.execute(f"PRAGMA main.table_info({table})")]


def shadow(conn: sqlite3.Connection, cutoff: str) -> None:
    """Hide everything newer than `cutoff` behind TEMP views (call before `query_only`)."""
    for table, (where, override) in VIEWS.items():
        cols = _columns(conn, table)
        if not cols:
            continue  # an older store without the table
        select = ", ".join(f"{override.get(c, 't.' + c)} AS {c}" for c in cols)
        sql = f"SELECT {select} FROM main.{table} t WHERE {where}"
        # Views cannot take parameters: the cutoff goes in as a quoted literal.
        literal = "'" + cutoff.replace("'", "''") + "'"
        conn.execute(f"CREATE TEMP VIEW {table} AS {sql.replace(':t', literal)}")


def versions(conn: sqlite3.Connection, portal: str) -> list[Version]:
    """The portal's model versions, newest first, with the releases each one brought."""
    try:
        rows = conn.execute(
            "SELECT v.id, v.seq, v.built_at,"
            "  (SELECT o.run_id FROM main.observations o WHERE o.id = v.observation_watermark)"
            "  AS scan FROM main.model_versions v WHERE v.portal_id = ? ORDER BY v.seq DESC",
            (portal,),
        ).fetchall()
        epochs: dict[str, list[str]] = {}
        for e in conn.execute(
            "SELECT e.model_version_id, e.scope, b.signature FROM main.build_epochs e"
            " JOIN main.builds b ON b.id = e.build_id WHERE e.portal_id = ? ORDER BY e.scope",
            (portal,),
        ):
            label = f"{release_name(e['signature'])} · {part_name(e['scope'])}"
            epochs.setdefault(e["model_version_id"], []).append(label)
    except sqlite3.OperationalError:
        return []  # a store before the portal model
    return [
        Version(r["seq"], r["built_at"], tuple(epochs.get(r["id"], [])), r["scan"]) for r in rows
    ]


def find(conn: sqlite3.Connection, portal: str | None, seq: Any) -> Version | None:
    """The version `?as_of=` names, or None (Now) for no portal, no number or no such version;
    the latest version is Now as well."""
    if not portal or not str(seq or "").isdigit():
        return None
    every = versions(conn, portal)
    if not every or every[0].seq == int(seq):
        return None
    return next((v for v in every if v.seq == int(seq)), None)


# The first model version each kind of page has something to show in (spec 042 F-09): a thing
# the views hide until then would open a 404, so the As of menu leaves those versions out.
FIRST_SEQ: dict[str, str] = {
    "screen": "SELECT v.seq FROM main.model_screens s"
    " JOIN main.model_versions v ON v.id = s.first_model_version"
    " WHERE s.portal_id = :p AND s.key = :k",
    "rule": "SELECT min(v.seq) FROM main.hypotheses h"
    " JOIN main.model_versions m ON m.id = h.model_version_id"
    " JOIN main.model_versions v ON v.portal_id = h.portal_id AND v.seq >= m.seq"
    " AND v.built_at >= h.created_at WHERE h.portal_id = :p AND h.key = :k",
    "process": "SELECT min(v.seq) FROM main.ba_processes b"
    " JOIN main.model_versions v ON v.portal_id = b.portal_id AND v.built_at >= b.created_at"
    " WHERE b.portal_id = :p AND b.key = :k",
}


def first_seq(conn: sqlite3.Connection, portal: str | None, kind: str, key: str) -> int | None:
    """The first model version a screen, rule or process is in; None when unknown."""
    if not portal:
        return None
    try:
        row = conn.execute(FIRST_SEQ[kind], {"p": portal, "k": key}).fetchone()
    except sqlite3.OperationalError:
        return None  # a store before the portal model
    return int(row[0]) if row and row[0] is not None else None
