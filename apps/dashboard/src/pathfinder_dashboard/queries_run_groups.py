"""Runs by process (spec 034 R-70 (1), A-6): which scans belong to which documented process, which
belong to none, and which unassigned scans look like one undocumented process.

The same model as the BA server's `services/ba/run-groups.ts`; both are checked against
`apps/crawler/tests/fixtures/run-groups/cases.json`. Computed on read, never stored.
"""

from __future__ import annotations

import json
import sqlite3
from dataclasses import dataclass, field

# A screen's key: its screen (after an owner-confirmed merge), else its route and cluster.
SCREEN_KEY = "COALESCE(sc.merged_into, s.screen_id, s.route_template || '|' || s.cluster_id)"


@dataclass(frozen=True)
class GroupProcess:
    key: str
    title: str
    screens: list[str]
    runs: list[str]


@dataclass(frozen=True)
class GroupInput:
    runs: list[str]
    screens_of_run: dict[str, list[str]]
    processes: list[GroupProcess]


@dataclass(frozen=True)
class ProcessRuns:
    key: str
    title: str
    runs: list[str]


@dataclass(frozen=True)
class RunGroups:
    processes: list[ProcessRuns]
    unassigned: list[str]
    proposed: list[list[str]] = field(default_factory=list)


def _belongs(p: GroupProcess, run: str, screens: list[str]) -> bool:
    """Cited by the process, or walked two of its screens (or its only one)."""
    if run in p.runs:
        return True
    if not p.screens:
        return False
    return len(set(p.screens) & set(screens)) >= min(2, len(p.screens))


def _proposed(runs: list[str], screens_of: dict[str, list[str]]) -> list[list[str]]:
    """Unassigned runs that share at least half their screens, joined transitively."""
    parent = {r: r for r in runs}

    def find(r: str) -> str:
        while parent[r] != r:
            r = parent[r]
        return r

    for i, a in enumerate(runs):
        for b in runs[i + 1 :]:
            sa, sb = screens_of.get(a, []), screens_of.get(b, [])
            small = min(len(sa), len(sb))
            if small > 0 and 2 * len(set(sa) & set(sb)) >= small:
                parent[find(b)] = find(a)
    groups: dict[str, list[str]] = {}
    for r in runs:
        groups.setdefault(find(r), []).append(r)
    return sorted((sorted(g) for g in groups.values() if len(g) > 1), key=lambda g: g[0])


def group_runs(inp: GroupInput) -> RunGroups:
    processes = [
        ProcessRuns(
            p.key,
            p.title,
            sorted(r for r in inp.runs if _belongs(p, r, inp.screens_of_run.get(r, []))),
        )
        for p in inp.processes
    ]
    owned = {r for p in processes for r in p.runs}
    unassigned = sorted(r for r in inp.runs if r not in owned)
    return RunGroups(processes, unassigned, _proposed(unassigned, inp.screens_of_run))


_STATES_OF_LINK = """
  SELECT l.target_id AS s FROM links l WHERE l.target_kind IN ('state', 'screen_region')
  UNION SELECT e.from_state FROM links l JOIN transitions e ON e.id = l.target_id
    WHERE l.target_kind = 'transition'
  UNION SELECT e.to_state FROM links l JOIN transitions e ON e.id = l.target_id
    WHERE l.target_kind = 'transition'
  UNION SELECT p.state_id FROM links l JOIN observations p ON p.id = l.target_id
    WHERE l.target_kind = 'observation'
  UNION SELECT ps.state_before FROM links l JOIN process_steps ps ON ps.id = l.target_id
    WHERE l.target_kind = 'process_step'
  UNION SELECT ps.state_after FROM links l JOIN process_steps ps ON ps.id = l.target_id
    WHERE l.target_kind = 'process_step'
  UNION SELECT ps.state_before FROM links l JOIN process_steps ps ON ps.process_id = l.target_id
    WHERE l.target_kind = 'process'
  UNION SELECT ps.state_after FROM links l JOIN process_steps ps ON ps.process_id = l.target_id
    WHERE l.target_kind = 'process'
"""


def _screens_of_states(conn: sqlite3.Connection, states: list[str]) -> list[str]:
    if not states:
        return []
    marks = ",".join("?" for _ in states)
    rows = conn.execute(
        f"SELECT DISTINCT {SCREEN_KEY} FROM states s LEFT JOIN screens sc ON sc.id = s.screen_id"
        f" WHERE s.id IN ({marks}) AND s.state_kind <> 'technical'",
        states,
    ).fetchall()
    return sorted(r[0] for r in rows)


def _record_processes(conn: sqlite3.Connection, portal: str) -> list[GroupProcess]:
    records = conn.execute(
        "SELECT r.key, r.title, v.id FROM doc_records r"
        " JOIN doc_revisions v ON v.record_id = r.id AND v.rev_no = r.latest_rev"
        " WHERE r.portal_id = ? AND r.kind = 'process' AND r.withdrawn = 0 ORDER BY r.seq",
        (portal,),
    ).fetchall()
    out = []
    for key, title, rev_id in records:
        cte = "WITH links AS (SELECT * FROM doc_evidence_links WHERE revision_id = ?)"
        states = [
            r[0] for r in conn.execute(f"{cte} {_STATES_OF_LINK}", (rev_id,)) if r[0] is not None
        ]
        runs = {
            r[0]
            for r in conn.execute(
                "SELECT run_id FROM doc_evidence_links WHERE revision_id = ? AND run_id IS NOT NULL"
                " UNION SELECT p.run_id FROM doc_evidence_links l JOIN processes p"
                " ON p.id = l.target_id WHERE l.revision_id = ? AND l.target_kind = 'process'",
                (rev_id, rev_id),
            )
        }
        out.append(GroupProcess(key, title, _screens_of_states(conn, states), sorted(runs)))
    return out


def _workspace_processes(conn: sqlite3.Connection, portal: str) -> list[GroupProcess]:
    rows = conn.execute(
        "SELECT p.key, p.name, r.steps FROM ba_processes p"
        " JOIN process_variants v ON v.process_id = p.id AND v.kind = 'as_is'"
        " JOIN process_variant_revisions r ON r.variant_id = v.id AND r.rev = v.rev"
        " WHERE p.portal_id = ? ORDER BY p.key",
        (portal,),
    ).fetchall()
    out = []
    for key, name, steps in rows:
        states = [s["state_id"] for s in json.loads(steps) if isinstance(s.get("state_id"), str)]
        runs = [
            r[0]
            for r in conn.execute(
                "SELECT DISTINCT r.run_id FROM process_variant_revisions r"
                " JOIN process_variants v ON v.id = r.variant_id"
                " JOIN ba_processes p ON p.id = v.process_id"
                " WHERE p.portal_id = ? AND p.key = ? AND r.run_id IS NOT NULL ORDER BY 1",
                (portal, key),
            )
        ]
        out.append(GroupProcess(key, name, _screens_of_states(conn, states), runs))
    return out


def load_input(conn: sqlite3.Connection, portal: str) -> GroupInput:
    runs = [
        r[0]
        for r in conn.execute(
            "SELECT id FROM runs WHERE portal_id = ? ORDER BY started_at, id", (portal,)
        )
    ]
    screens_of_run: dict[str, list[str]] = {}
    for run, key in conn.execute(
        f"SELECT DISTINCT o.run_id, {SCREEN_KEY} AS k FROM state_observations o"
        " JOIN runs r ON r.id = o.run_id JOIN states s ON s.id = o.state_id"
        " LEFT JOIN screens sc ON sc.id = s.screen_id"
        " WHERE r.portal_id = ? AND s.state_kind <> 'technical' ORDER BY k",
        (portal,),
    ):
        screens_of_run.setdefault(run, []).append(key)
    return GroupInput(
        runs, screens_of_run, _record_processes(conn, portal) + _workspace_processes(conn, portal)
    )


@dataclass(frozen=True)
class RunInfo:
    id: str
    mode: str
    persona_id: str
    status: str
    started_at: str
    screens: int


def run_infos(conn: sqlite3.Connection, portal: str, inp: GroupInput) -> dict[str, RunInfo]:
    """The scans of a portal by id, with how many screens (no error pages) each walked."""
    rows = conn.execute(
        "SELECT id, mode, persona_id, status, started_at FROM runs WHERE portal_id = ?", (portal,)
    ).fetchall()
    return {
        r[0]: RunInfo(r[0], r[1], r[2], r[3], r[4], len(inp.screens_of_run.get(r[0], [])))
        for r in rows
    }
