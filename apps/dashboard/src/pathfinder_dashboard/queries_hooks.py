"""The portal hooks that ran in a scan (spec 023 US2.3), from the decision notes the crawler
writes for every hook run (`hook:<point>:<fn>`, reason `<outcome>[: detail][ (what it did)]`).
Read-only."""

from __future__ import annotations

import sqlite3
from typing import NamedTuple


class HookRunRow(NamedTuple):
    point: str
    fn: str
    runs: int
    outcomes: dict[str, int]  # ok, skip, rewrite, wait, failed, timeout → count
    pages_patched: int


def hook_runs(conn: sqlite3.Connection, run_id: str) -> list[HookRunRow]:
    try:
        rows = conn.execute(
            "SELECT rule, reason FROM decision_log WHERE run_id = ? AND rule LIKE 'hook:%'"
            " ORDER BY id",
            (run_id,),
        ).fetchall()
    except sqlite3.OperationalError:
        return []
    patched: dict[str, int] = {}
    found: dict[tuple[str, str], dict[str, int]] = {}
    for rule, reason in rows:
        if rule == "hook:patched":
            continue
        _, point, fn = [*rule.split(":", 2), "", ""][:3]
        outcome = (reason or "").split(":", 1)[0].split(" ", 1)[0] or "ok"
        counts = found.setdefault((point, fn), {})
        counts[outcome] = counts.get(outcome, 0) + 1
        if "(" in (reason or "") and point == "onPageLoad":
            patched[fn] = patched.get(fn, 0) + 1
    return [
        HookRunRow(point, fn, sum(c.values()), c, patched.get(fn, 0))
        for (point, fn), c in found.items()
    ]
