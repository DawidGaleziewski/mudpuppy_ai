"""The values of a process's Compare (screen 06) and History (screen 07), for the console's API
(`queries_app_process_compare.py`). Read-only."""

from __future__ import annotations

import sqlite3
from typing import Any

from . import change_spec, process_diff, queries_processes


def compare_values(
    conn: sqlite3.Connection,
    view: queries_processes.ProcessView,
    left: str,
    right: str,
    reviewer: str | None,
) -> dict[str, Any]:
    """Screen 06: the step diff of two models (a person's draft on the right when open) and the
    change spec: the newest saved revision for this pair, else freshly generated."""
    lv, rv = view.model(left) or view.as_is, view.model(right)
    if rv is None:
        rv = next((v for v in view.models if v.model.kind == "to_be"), None)
    assert lv is not None
    draft = rv.draft_of(reviewer) if rv else None
    right_steps = list(draft.steps) if draft else (rv.steps if rv else [])
    rows = process_diff.diff(lv.steps, right_steps)
    states = [s["state_id"] for s in lv.steps if s.get("state_id")]
    right_label = f"{rv.model.label} r{rv.model.rev + (1 if draft else 0)}" if rv else "—"
    generated = change_spec.generate(
        change_spec.SpecInput(
            name=view.process.name,
            persona=view.process.persona,
            environment=None,
            left_label=f"{lv.model.label} r{lv.model.rev}",
            right_label=right_label + (" draft" if draft else ""),
            left_steps=lv.steps,
            right_steps=right_steps,
            rows=rows,
            scans=queries_processes.scans_of(conn, states),
            records=queries_processes.citing_records(conn, states),
        )
    )
    saved = next(
        (
            s
            for s in view.specs
            if rv and s.left_model_id == lv.model.id and s.right_model_id == rv.model.id
        ),
        None,
    )
    return {
        "view": view,
        "left": lv,
        "right": rv,
        "draft": draft,
        "rows": rows,
        "counts": process_diff.counts(rows),
        "sections": saved.sections if saved else generated,
        "saved": saved,
        "spec_head": view.specs[0].rev if view.specs else None,
        "section_titles": change_spec.SECTIONS,
        "right_label": right_label,
    }


def history_values(view: queries_processes.ProcessView, reviewer: str | None) -> dict[str, Any]:
    """Screen 07: which revision runs where, each model's revisions newest first, the reviewer's
    drafts that sit on an older revision (the conflict notice), and the process's own timeline."""
    labels = {v.model.id: v.model.label for v in view.models}
    live_now = {
        (lv.label, lv.rev): [
            e.environment for e in view.live if (e.label, e.rev) == (lv.label, lv.rev)
        ]
        for lv in view.live
    }
    conflicts = [
        (v, d)
        for v in view.models
        for d in [v.draft_of(reviewer)]
        if d is not None and v.model.kind == "to_be" and d.base_rev != v.model.rev
    ]
    return {
        "view": view,
        "environments": queries_processes.ENVIRONMENTS,
        "labels": labels,
        "live_now": live_now,
        "conflicts": conflicts,
        "revision_count": sum(len(v.revisions) for v in view.models),
        "marked_in": [lv.environment for lv in view.live],
    }
