"""The React console's Compare (designer screen 06) and History (screen 07) of one process (R-96,
spec 060): `process_views` as typed JSON. Statuses come mapped. Read-only."""

from __future__ import annotations

import sqlite3
from typing import Any

from pydantic import BaseModel

from . import process_views, queries_processes
from .queries_app import StatusOut, status_out
from .queries_app_screens import Option


class Head(BaseModel):
    portal: str
    id: str
    key: str
    name: str
    #: Each model with its head revision ("A r1"), for the pickers.
    models: list[Option]


class DiffStep(BaseModel):
    title: str
    route: str | None


class DiffRowOut(BaseModel):
    change: StatusOut
    #: The left steps the row covers (two or more when merged; empty when added).
    left: list[DiffStep]
    #: The right step; None when removed.
    right: DiffStep | None
    notes: list[str]
    #: "2 steps into 1" for a merge.
    merged: str | None


class Section(BaseModel):
    key: str
    title: str
    #: A list section is one item per line; a text section is one block.
    is_list: bool
    text: str


class CompareOut(BaseModel):
    head: Head
    left: str
    right: str | None
    left_label: str
    #: "B r3" (the next revision when the right side is the person's draft).
    right_label: str
    draft: bool
    counts: list[tuple[StatusOut, int]]
    rows: list[DiffRowOut]
    #: The saved change spec for this pair ("spec r2 saved by Anna at …"), None when generated.
    saved: str | None
    spec_head: int | None
    sections: list[Section]
    left_rev: int
    right_rev: int | None


def _head(view: queries_processes.ProcessView) -> Head:
    p = view.process
    return Head(
        portal=p.portal_id,
        id=p.id,
        key=p.key,
        name=p.name,
        models=[
            Option(value=v.model.label, label=f"{v.model.label} r{v.model.rev}")
            for v in view.models
        ],
    )


def _step(s: dict[str, Any]) -> DiffStep:
    return DiffStep(title=s.get("title") or "(untitled)", route=s.get("route"))


def compare(
    conn: sqlite3.Connection,
    view: queries_processes.ProcessView,
    pair: tuple[str, str],
    who: str | None,
) -> CompareOut:
    v = process_views.compare_values(conn, view, pair[0], pair[1], who)
    lv, rv, saved = v["left"], v["right"], v["saved"]
    titles = dict(v["section_titles"])
    sections = []
    for key, title in titles.items():
        value = v["sections"].get(key, "")
        is_list = not isinstance(value, str)
        sections.append(
            Section(
                key=key, title=title, is_list=is_list, text="\n".join(value) if is_list else value
            )
        )
    return CompareOut(
        head=_head(view),
        left=lv.model.label,
        right=rv.model.label if rv else None,
        left_label=f"{lv.model.label} r{lv.model.rev}",
        right_label=v["right_label"],
        draft=v["draft"] is not None,
        counts=[(status_out("step_change", k), n) for k, n in v["counts"].items() if n],
        rows=[
            DiffRowOut(
                change=status_out("step_change", r.change),
                left=[_step(s) for s in r.left],
                right=_step(r.right) if r.right else None,
                notes=[
                    f"{a.get('text', '')} — {a.get('author', '')}"
                    for a in (r.right or {}).get("annotations") or []
                ],
                merged=f"{len(r.left)} steps into 1" if r.change == "merged" else None,
            )
            for r in v["rows"]
        ],
        saved=f"spec r{saved.rev} saved by {saved.author} · {saved.created_at}" if saved else None,
        spec_head=v["spec_head"],
        sections=sections,
        left_rev=lv.model.rev,
        right_rev=rv.model.rev if rv else None,
    )


class LiveRow(BaseModel):
    environment: str
    #: "B r2" live there; None when nothing is marked.
    live: str | None
    status: StatusOut
    #: "Anna · 2026-10-22… · 1 earlier mark".
    how: str | None
    reason: str | None


class RevisionOut(BaseModel):
    label: str
    rev: int
    change: str
    author: str
    at: str
    note: str | None
    #: Where it is live ("sandbox, staging"); None when nowhere.
    live: str | None
    latest: bool
    #: "from A r1" for a branch, "of B r2" for a restore.
    origin: str | None
    #: Restore it as the next revision (a to-be model's older revision).
    restorable: bool


class ModelHistory(BaseModel):
    label: str
    kind: str
    rev: int
    revisions: list[RevisionOut]


class ProcessRevisionOut(BaseModel):
    rev: int
    change: str
    name: str
    stage: StatusOut
    author: str
    at: str


class SpecRevisionOut(BaseModel):
    rev: int
    #: "A r1 against B r2".
    pair: str
    left: str
    right: str
    author: str
    at: str


class HistoryOut(BaseModel):
    head: Head
    revision_count: int
    marked_in: list[str]
    live: list[LiveRow]
    models: list[ModelHistory]
    process: list[ProcessRevisionOut]
    specs: list[SpecRevisionOut]
    #: The person's drafts that sit on an older revision: their labels.
    conflicts: list[str]


def _live(view: queries_processes.ProcessView) -> list[LiveRow]:
    out = []
    for env in queries_processes.ENVIRONMENTS:
        lv = view.live_in(env)
        m = lv.marks[0] if lv else None
        earlier = len(lv.marks) - 1 if lv else 0
        more = f" · {earlier} earlier mark{'' if earlier == 1 else 's'}" if earlier else ""
        out.append(
            LiveRow(
                environment=env,
                live=f"{lv.label} r{lv.rev}" if lv else None,
                status=status_out("process_model", "live")
                if lv
                else status_out("environment", "not_marked"),
                how=f"{m.author} · {m.created_at}{more}" if m else None,
                reason=m.reason if m else None,
            )
        )
    return out


def _models(v: dict[str, Any]) -> list[ModelHistory]:
    view = v["view"]
    out = []
    for x in reversed(view.models):
        label, to_be = x.model.label, x.model.kind == "to_be"
        revs = []
        for r in reversed(x.revisions):
            where = v["live_now"].get((label, r.rev), [])
            origin = None
            if r.change == "branch" and x.model.branched_from_rev:
                origin = f"from A r{x.model.branched_from_rev}"
            elif r.restored_from:
                origin = f"of {label} r{r.restored_from}"
            latest = r.rev == x.model.rev
            revs.append(
                RevisionOut(
                    label=label,
                    rev=r.rev,
                    change=r.change,
                    author=r.author,
                    at=r.created_at,
                    note=r.note,
                    live=", ".join(where) or None,
                    latest=latest,
                    origin=origin,
                    restorable=to_be and not latest,
                )
            )
        out.append(
            ModelHistory(
                label=label, kind="to-be" if to_be else "as-is", rev=x.model.rev, revisions=revs
            )
        )
    return out


def history(view: queries_processes.ProcessView, who: str | None) -> HistoryOut:
    v = process_views.history_values(view, who)
    labels = v["labels"]
    return HistoryOut(
        head=_head(view),
        revision_count=v["revision_count"],
        marked_in=v["marked_in"],
        live=_live(view),
        models=_models(v),
        process=[
            ProcessRevisionOut(
                rev=r.rev,
                change=r.change,
                name=r.name,
                stage=status_out("stage", r.stage),
                author=r.author,
                at=r.created_at,
            )
            for r in reversed(view.revisions)
        ],
        specs=[
            SpecRevisionOut(
                rev=s.rev,
                pair=f"{labels.get(s.left_model_id, '?')} r{s.left_rev} against "
                f"{labels.get(s.right_model_id, '?')} r{s.right_rev}",
                left=labels.get(s.left_model_id, "A"),
                right=labels.get(s.right_model_id, "B"),
                author=s.author,
                at=s.created_at,
            )
            for s in view.specs
        ],
        conflicts=[vv.model.label for vv, _ in v["conflicts"]],
    )
