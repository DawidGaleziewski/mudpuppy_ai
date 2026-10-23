"""One row of the React Review inbox per kind (R-96, spec 062): the facts a row shows, with
statuses mapped, and each group's empty state. Used by `queries_app_review`."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from pydantic import BaseModel

from .queries_app import Chip, StatusOut, status_out
from .queries_queue import QueueItem

# A group's empty state.
EMPTY = {
    "findings": "No finding waits. A change of the portal model that no rule explains lands"
    " here, with its Before / after.",
    "rules": "No business rule waits. A rule mined from the cases, a broken or a changed one"
    " lands here to confirm or reject.",
    "removals": "Nothing was removed without a release. Such removals land here and are"
    " confirmed together.",
    "processes": "No process proposal waits. After a scan the portal model proposes processes;"
    " accept or dismiss them on Processes.",
    "records": "No draft records wait. When the BA agent writes or revises a record, its draft"
    " lands here to confirm, reject or comment.",
    "assumptions": "No assumptions to check. Every assumption the BA agent writes waits here"
    " until a reviewer confirms it.",
    "differences": "No unexplained differences. When personas see different things on a"
    " screen, each difference waits here until a BA record explains it.",
    "reanchor": "Nothing to re-anchor. When a scan changes a screen and an amendment's element"
    " is gone, the amendment lands here. It is never deleted.",
    "proposals": "No open proposals. Changes the assistant suggests in chat wait here if you"
    " don't apply or discard them there.",
    "suites": "No probe suites wait. After a probing scan the BA agent proposes one suite per"
    " form; it runs only after you approve it here.",
    "conflicts": "No conflicts. If someone saves a revision while you're editing the same"
    " process or amendment, both versions wait here to compare.",
}


class ReviewRow(BaseModel):
    """One item of a group, whatever its kind: tags, a chip, a status, the line and a hint."""

    kind: str
    id: str
    tags: list[str] = []
    chip: Chip | None = None
    status: StatusOut | None = None
    meta: str | None = None
    title: str
    hint: str | None = None
    route: str | None = None
    at: str | None = None
    #: What a decision on it settles; empty: nothing to decide here.
    keys: list[str] = []


def _queue(kind: str, it: QueueItem) -> ReviewRow:
    return ReviewRow(
        kind=kind,
        id=it.id,
        chip=Chip(word=it.chip.word, variant=it.chip.chip or None),
        status=status_out("rule", it.status) if it.status else None,
        meta=it.where,
        title=it.claim,
        hint=it.hint,
        at=it.at,
        keys=list(it.keys),
    )


def _record(kind: str, it: Any) -> ReviewRow:
    return ReviewRow(
        kind=kind,
        id=it.key,
        tags=[it.key],
        status=status_out("doc", it.status),
        meta=f"rev {it.rev} · {it.kind.replace('_', ' ')}",
        title=it.title,
    )


def _difference(kind: str, it: Any) -> ReviewRow:
    reach = f"Not reached by {', '.join(it.screen.not_reached)}"
    return ReviewRow(
        kind=kind,
        id=it.id,
        status=status_out("access", "depends"),
        title=it.screen.title or "(untitled page)",
        route=it.screen.route,
        hint=it.element.key if it.element else reach,
    )


def _reanchor(kind: str, it: Any) -> ReviewRow:
    return ReviewRow(
        kind=kind,
        id=it.key,
        tags=[f"{it.key} r{it.rev}"],
        status=status_out("amendment", it.status),
        meta=it.anchor_route_template or "screen changed",
        title=it.text or it.attachment_name or "(no text)",
    )


def _proposal(kind: str, it: Any) -> ReviewRow:
    return ReviewRow(
        kind=kind,
        id=it.p.id,
        tags=[it.key] if it.key else [],
        status=status_out("proposal", "stale" if it.stale else it.p.status),
        meta="new amendment" if it.is_new else "change",
        title=it.p.summary,
    )


def _suite(kind: str, it: Any) -> ReviewRow:
    step = f" · {it.step_label}" if it.step_label else ""
    return ReviewRow(
        kind=kind,
        id=it.id,
        status=status_out("suite", "proposed"),
        meta=f"{len(it.variants)} variants{step}",
        title=it.name,
    )


ROWS: dict[str, Callable[[str, Any], ReviewRow]] = {
    "findings": _queue,
    "rules": _queue,
    "removals": _queue,
    "processes": _queue,
    "records": _record,
    "assumptions": _record,
    "differences": _difference,
    "reanchor": _reanchor,
    "proposals": _proposal,
    "suites": _suite,
}


def row_of(kind: str, it: Any) -> ReviewRow:
    """The row of an inbox item; an edit conflict (no row of its own yet) by its id."""
    make = ROWS.get(kind)
    if make is not None:
        return make(kind, it)
    return ReviewRow(kind=kind, id=str(getattr(it, "id", "")), title=str(it))
