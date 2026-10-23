"""What the React console's to-be editor needs (R-96, spec 059; designer screen 05): the person's
draft over a to-be model (or the head until a first edit starts one), each step's change against
the model it was branched from, what it removed, how many changes are pending, and whether someone
saved first. The htmx editor's values (`web/processes.editor_values`) as typed JSON. Read-only."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel

from . import process_diff, queries_processes
from .queries_app import StatusOut, status_out


class DraftOut(BaseModel):
    #: The revision the draft was started on; a later head means someone saved first.
    base_rev: int
    updated_at: str
    #: Steps the draft adds, removes or changes against the head.
    pending: int
    conflict: bool


class EditorOut(BaseModel):
    #: The person may draw this model (a to-be model, a reviewer named, not archived).
    editable: bool
    #: Who draws (the reviewer's name): an annotation the page adds is signed with it.
    author: str | None
    draft: DraftOut | None
    #: The steps exactly as stored (the draft's when there is one): the page edits these and
    #: autosaves them whole.
    steps: list[dict[str, Any]]
    #: Step id → its change against the parent model ("Merged", "Added", "Changed").
    changes: dict[str, StatusOut]
    #: The parent's steps the model no longer has ("Car · /car").
    removed: list[str]
    #: A's steps for reference ("1 · Home /").
    as_is: list[str]


def editor(
    view: queries_processes.ProcessView,
    mv: queries_processes.ModelView,
    reviewer: str | None,
) -> EditorOut:
    """The editor of to-be model `mv` for `reviewer` (who sees only their own draft)."""
    draft = mv.draft_of(reviewer)
    steps = list(draft.steps) if draft else mv.steps
    parent = queries_processes.parent_steps(view, mv.model.label)
    rows = process_diff.diff(parent, steps) if parent else []
    a = view.as_is
    return EditorOut(
        editable=bool(reviewer) and view.process.archived_at is None,
        author=reviewer,
        draft=DraftOut(
            base_rev=draft.base_rev,
            updated_at=draft.updated_at,
            pending=queries_processes.pending_changes(mv.steps, steps),
            conflict=draft.base_rev != mv.model.rev,
        )
        if draft
        else None,
        steps=steps,
        changes={r.right["id"]: status_out("step_change", r.change) for r in rows if r.right},
        removed=[
            f"{r.left[0].get('title', '')} · {r.left[0].get('route') or ''}"
            for r in rows
            if r.change == "removed" and r.left
        ],
        as_is=[
            f"{n} · {s.get('title', '')} {s.get('route') or ''}".strip()
            for n, s in enumerate(a.steps if a else [], start=1)
        ],
    )
