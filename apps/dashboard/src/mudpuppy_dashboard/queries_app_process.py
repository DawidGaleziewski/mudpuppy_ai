"""The React console's one process (R-96, spec 058; designer screens 05, v2-10): the read models
`queries_processes`, `queries_process_doc` and `queries_model_facts` as typed JSON (the to-be
draft editor is `queries_app_process_editor`). Statuses come mapped; pictures as URLs.
Read-only."""

from __future__ import annotations

import sqlite3
from typing import Any, NamedTuple

from pydantic import BaseModel

from . import (
    queries_app_process_editor,
    queries_model_facts,
    queries_process_doc,
    queries_processes,
)
from .queries_app import StatusOut, status_out
from .queries_app_processes import LiveOut, ModelOut
from .queries_app_screens import Option

#: The kinds of record a step's documentation groups, in the page's order, with their headings.
RECORD_KINDS = (
    ("requirement", "Requirements"),
    ("business_rule", "Business rules"),
    ("data_item", "Fields"),
    ("nfr", "NFRs"),
    ("glossary_term", "Terms"),
    ("open_question", "Open questions"),
    ("assumption", "Assumptions"),
    ("followup", "Follow-ups"),
)


class RecordOut(BaseModel):
    key: str
    title: str
    #: None when confirmed (the ordinary case says nothing).
    status: StatusOut | None


class RecordGroup(BaseModel):
    kind: str
    label: str
    records: list[RecordOut]


class Annotation(BaseModel):
    text: str
    author: str
    at: str


class StepOut(BaseModel):
    id: str
    n: int
    title: str
    route: str | None
    #: The recorded state; None for a designed step.
    state: str | None
    observed: bool
    #: The steps of the parent model it is built from (their titles and routes).
    built_from: list[str]
    annotations: list[Annotation]
    shot: str | None
    wire: str | None
    scans: int
    #: A's documentation: the records citing its screen, by kind (empty for a to-be model).
    records: list[RecordGroup]
    documented: bool
    amendments: int
    reanchor: int


class SignOffOut(BaseModel):
    by: str
    at: str
    signed_rev: int | None
    head_rev: int
    changed: bool


class AsIsDoc(BaseModel):
    questions: int
    unconfirmed: int
    reanchor: int
    sign_off: SignOffOut | None
    #: The move that ends the as-is work: "Mark as-is documented", "Sign off A r3", or None.
    sign_off_action: str | None
    stages: list[Option]
    #: Screens of the portal that A does not walk yet (to add one at the end).
    addable: list[Option]


class TriggerOut(BaseModel):
    #: "SC-0003 Kalkulator → button "Oblicz"", or "A URL opened on the first screen (deep link)".
    text: str
    screen_key: str | None
    count: int


class RuleOut(BaseModel):
    key: str
    claim: str
    status: StatusOut


class PathOut(BaseModel):
    name: str
    screens: list[tuple[str, str]]
    outcome: str
    count: int


class FactsOut(BaseModel):
    model_seq: int
    triggers: list[TriggerOut]
    outcomes: list[str]
    explored: StatusOut
    #: "to depth 3 plus 12 random walks, 2026-10-22 …: no counterexamples"; None when not explored.
    explored_text: str | None
    #: "8 / 11 actions on its screens on 9c21"; None without actions.
    checked: str | None
    rules: list[RuleOut]
    paths: list[PathOut]


class ProcessPage(BaseModel):
    portal: str
    id: str
    key: str
    name: str
    persona: str
    rev: int
    stage: StatusOut
    stage_value: str
    live: list[LiveOut]
    screens: int
    record_key: str | None
    archived_at: str | None
    models: list[ModelOut]
    #: The model shown: its label, kind and revision; its steps (the head, never someone's draft).
    model: ModelOut
    to_be_first: str | None
    steps: list[StepOut]
    selected: StepOut | None
    as_is: AsIsDoc | None
    facts: FactsOut | None
    #: The to-be editor (None on A): the person's draft, each step's change, what it removed.
    editor: queries_app_process_editor.EditorOut | None


def _records(d: queries_process_doc.StepDoc) -> list[RecordGroup]:
    groups = []
    for kind, label in RECORD_KINDS:
        rs = d.of_kind(kind)
        if rs:
            groups.append(
                RecordGroup(
                    kind=kind,
                    label=label,
                    records=[
                        RecordOut(
                            key=r.key,
                            title=r.title,
                            status=None if r.status == "confirmed" else status_out("doc", r.status),
                        )
                        for r in rs
                    ],
                )
            )
    return groups


def _step(
    s: dict[str, Any], n: int, doc: queries_process_doc.StepDoc | None, parent: dict[str, Any]
) -> StepOut:
    pic = doc.picture if doc else queries_process_doc.Picture()
    built = []
    for f in s.get("from") or []:
        src = parent.get(f)
        built.append(f"{src.get('title', '')} {src.get('route') or ''}".strip() if src else f)
    return StepOut(
        id=s["id"],
        n=n,
        title=s.get("title") or "(untitled)",
        route=s.get("route"),
        state=s.get("state_id"),
        observed=bool(s.get("observed", s.get("state_id"))),
        built_from=built,
        annotations=[
            Annotation(text=a.get("text", ""), author=a.get("author", ""), at=a.get("at", ""))
            for a in s.get("annotations") or []
            if isinstance(a, dict)
        ],
        shot=f"/evidence/{pic.shot}" if pic.shot else None,
        wire=f"/evidence/{pic.wire}" if pic.wire else None,
        scans=pic.scans,
        records=_records(doc) if doc else [],
        documented=bool(doc and doc.records),
        amendments=doc.amendments if doc else 0,
        reanchor=doc.reanchor if doc else 0,
    )


def _as_is(conn: sqlite3.Connection, view: queries_processes.ProcessView) -> tuple[AsIsDoc, list]:
    a = view.as_is
    assert a is not None
    portal = view.process.portal_id
    docs = queries_process_doc.step_docs(conn, portal, a.steps)
    open_ = queries_process_doc.still_open(docs)
    so = queries_process_doc.sign_off(view)
    action = None
    if view.process.stage == "scoped":
        action = "Mark as-is documented"
    elif so and so.changed:
        action = f"Sign off A r{a.model.rev}"
    in_a = {s.get("state_id") for s in a.steps}
    return (
        AsIsDoc(
            questions=open_.questions,
            unconfirmed=open_.unconfirmed,
            reanchor=open_.reanchor,
            sign_off=SignOffOut(
                by=so.by,
                at=so.at,
                signed_rev=so.signed_rev,
                head_rev=so.head_rev,
                changed=so.changed,
            )
            if so
            else None,
            sign_off_action=action,
            stages=[
                Option(value=st, label=status_out("stage", st).word)
                for st in queries_processes.STAGES
            ],
            addable=[
                Option(value=st.id, label=f"{st.route_template} · {st.title}")
                for st in queries_processes.portal_screens(conn, portal)
                if st.id not in in_a
            ],
        ),
        docs,
    )


def _facts(conn: sqlite3.Connection, view: queries_processes.ProcessView) -> FactsOut | None:
    steps = view.as_is.steps if view.as_is else []
    m = queries_model_facts.model_facts(conn, view.process.portal_id, view.process.id, steps)
    if m.model_seq is None:
        return None
    e = m.explored
    explored = "not_explored" if e is None else ("thorough" if e.new_deviations == 0 else "partial")
    explored_text = None
    if e is not None:
        found = f"{e.new_deviations} new changes" if e.new_deviations else "no counterexamples"
        explored_text = (
            f"to depth {e.depth} plus {e.random_walks} random walks, {e.completed_at}: {found}"
        )
    c = m.checked
    checked = None
    if c and c.actions:
        on = f" on {c.release}" if c.release else ""
        checked = f"{c.checked} / {c.actions} actions on its screens{on}"
    return FactsOut(
        model_seq=m.model_seq,
        triggers=[
            TriggerOut(
                text="A URL opened on the first screen (deep link)"
                if t.deep_link
                else f"{t.screen_title or 'outside the model'} → {t.element}",
                screen_key=None if t.deep_link else t.screen_key,
                count=t.count,
            )
            for t in m.triggers
        ],
        outcomes=[f"{n} {o}" for o, n in m.outcomes.items()],
        explored=status_out("explored", explored),
        explored_text=explored_text,
        checked=checked,
        rules=[
            RuleOut(key=r.shown_key, claim=r.claim, status=status_out("rule", r.status))
            for r in m.rules
        ],
        paths=[
            PathOut(name=p.name, screens=p.screens, outcome=p.outcome, count=p.count)
            for p in m.paths
        ],
    )


def _models(view: queries_processes.ProcessView) -> list[ModelOut]:
    return [
        ModelOut(
            label=v.model.label,
            kind=v.model.kind.replace("_", "-"),
            rev=v.model.rev,
            draft=status_out("process_model", "draft") if v.drafts else None,
        )
        for v in view.models
    ]


class Shown(NamedTuple):
    """Which process page: the model asked for (its default when None), the step selected, and
    who looks (a to-be model shows their own draft)."""

    model: str | None
    step: str | None
    reviewer: str | None


def process_page(
    conn: sqlite3.Connection, portal: str, key: str, shown: Shown
) -> ProcessPage | None:
    """One process with the model asked for (or the default), None when there is none."""
    view = queries_processes.process_view(conn, portal, key)
    if view is None or view.as_is is None:
        return None
    mv = view.model(shown.model or queries_processes.default_model(view)) or view.as_is
    p = view.process
    as_is, docs = _as_is(conn, view)
    by_step = {d.step["id"]: d for d in docs}
    is_a = mv.model.kind == "as_is"
    edit = None if is_a else queries_app_process_editor.editor(view, mv, shown.reviewer)
    parent = {s["id"]: s for s in queries_processes.parent_steps(view, mv.model.label)}
    raw = edit.steps if edit else mv.steps
    steps = [
        _step(s, n, by_step.get(s["id"]) if is_a else None, {} if is_a else parent)
        for n, s in enumerate(raw, start=1)
    ]
    step = shown.step
    models = _models(view)
    return ProcessPage(
        portal=portal,
        id=p.id,
        key=p.key,
        name=p.name,
        persona=p.persona,
        rev=p.rev,
        stage=status_out("stage", p.stage),
        stage_value=p.stage,
        live=[
            LiveOut(
                environment=lv.environment,
                status=status_out("process_model", "live"),
                what=f"{lv.label} r{lv.rev}",
            )
            for lv in view.live
        ],
        screens=len(view.as_is.steps),
        record_key=p.record_key,
        archived_at=p.archived_at,
        models=models,
        model=next(m for m in models if m.label == mv.model.label),
        to_be_first=next((v.model.label for v in view.models if v.model.kind == "to_be"), None),
        steps=steps,
        selected=next((s for s in steps if s.id == step), None),
        as_is=as_is,
        facts=_facts(conn, view),
        editor=edit,
    )
