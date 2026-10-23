"""The detail of the Review kinds spec 063 moves to React (R-96): an unexplained difference (who
sees what, read-only), an amendment to re-anchor (why it lost its place, where it was, the screens
to put it on), an assistant proposal (what it changes, before and after) and a probe suite (its
variants and steps, to edit). The facts the htmx partials show (`partials/review_difference.html`,
`review_reanchor.html`, `proposal.html`, `review_suite.html`), with statuses mapped."""

from __future__ import annotations

import sqlite3
from typing import Any

from pydantic import BaseModel

from . import queries_chat, suite_form
from .queries_app import StatusOut, status_out


class Option(BaseModel):
    value: str
    label: str


class Who(BaseModel):
    """Personas on one side of a difference, each with its attributes ("no attributes")."""

    label: str
    personas: list[Option]


class DifferenceDetail(BaseModel):
    element: str | None
    sides: list[Who]
    compare: Option | None
    advice: str


class ReanchorDetail(BaseModel):
    amendment: str
    key: str
    rev: int
    #: A person's text: shown as their note.
    text: str | None
    author: str
    at: str
    attachment: str | None
    why: str
    why_detail: str | None
    was_on: Option | None
    element: str | None
    changed_by_scan: str | None
    #: The form's starting values and the screens to choose from.
    state_id: str
    element_key: str
    states: list[Option]


class Change(BaseModel):
    before: str | None
    after: str


class ProposalDetail(BaseModel):
    id: str
    key: str | None
    is_new: bool
    base_rev: int | None
    next_rev: int
    status: StatusOut
    stale: bool
    head_rev: int | None
    target: Change | None
    text: Change | None
    screen: str | None


class SuiteStep(BaseModel):
    kind: str
    name: str
    value: str


class SuiteVariantOut(BaseModel):
    id: str
    expect: str
    probe: str | None
    fault: str | None
    why: str
    steps: list[SuiteStep]


class SuiteDetail(BaseModel):
    id: str
    trace_id: str
    run_id: str
    goal: str
    start_url: str
    step_label: str | None
    variants: list[SuiteVariantOut]
    expects: list[Option]
    kinds: list[Option]
    traces_file: str
    run_command: str


EXPECT_WORDS = {
    "proceed": "Moves on",
    "validation_error": "Refused with a message",
    "technical_error": "Shows a technical error",
    "branch": "Leads elsewhere",
}
KIND_WORDS = {"fill": "Type", "select": "Pick", "check": "Tick", "click": "Press"}
WHY = {
    "state_replaced": "The screen it was written for was recorded differently by a newer scan.",
    "element_removed": "The element it was anchored to is gone from the newer recording.",
    "element_changed": "The element it was anchored to changed in the newer recording.",
}
ELEMENT_ADVICE = (
    "Explain it with a business rule that cites this element on the screen of a persona who sees"
    " it and the screen of a persona who does not. It leaves Review once that record exists."
)
REACH_ADVICE = (
    "A screen some personas never reach may be access or a scan that stopped early. Explain it"
    " with a business rule or an open question that cites this screen and a screen the other"
    " persona reached. It leaves Review once that record exists."
)


def difference(d: Any, attrs: dict[str, str]) -> DifferenceDetail:
    def who(label: str, personas: list[str]) -> Who:
        return Who(
            label=label,
            personas=[Option(value=p, label=attrs.get(p, "no attributes")) for p in personas],
        )

    s = d.screen
    state_of = {v.persona_id: v.state_id for v in s.variants}
    if d.element:
        e = d.element
        seen, unseen = e.seen_by[0], e.not_seen_by[0]
        href = f"/states/{state_of.get(seen, '')}?side=access&left={seen}&right={unseen}"
        return DifferenceDetail(
            element=e.key,
            sides=[who("Seen by", e.seen_by), who("Not seen by", e.not_seen_by)],
            compare=Option(value=href, label=f"Compare {seen} and {unseen} side by side"),
            advice=ELEMENT_ADVICE,
        )
    first = s.variants[0].state_id if s.variants else None
    return DifferenceDetail(
        element=None,
        sides=[
            who("Reached by", [v.persona_id for v in s.variants]),
            who("Not reached by", s.not_reached),
        ],
        compare=Option(value=f"/states/{first}?side=access", label="Open the screen's Access tab")
        if first
        else None,
        advice=REACH_ADVICE,
    )


def reanchor(conn: sqlite3.Connection, a: Any) -> ReanchorDetail:
    on_state = a.target_kind != "evidence"
    sid = a.target_id.split("#", 1)[0] if on_state else ""
    element = a.target_id.split("#", 1)[1] if a.target_kind == "wireframe_element" else None
    anchor = a.anchor_element if isinstance(a.anchor_element, dict) else {}
    states = queries_chat.portal_states(conn, a.portal_id)
    return ReanchorDetail(
        amendment=a.id,
        key=a.key,
        rev=a.rev,
        text=a.text,
        author=a.author,
        at=a.created_at,
        attachment=a.attachment_name,
        why=WHY.get(a.superseded_reason or "", "A newer scan changed what it was anchored to."),
        why_detail=a.superseded_detail,
        was_on=Option(value=f"/states/{sid}", label=a.anchor_route_template or "the screen")
        if sid
        else None,
        element=element,
        changed_by_scan=a.superseded_by_run,
        state_id=sid,
        element_key=str(anchor.get("key", "")),
        states=[Option(value=s.id, label=f"{s.title} · {s.route_template}") for s in states],
    )


def proposal(v: Any) -> ProposalDetail:
    pl = v.payload
    target = pl.get("target_id") if isinstance(pl.get("target_id"), str) else None
    text = pl.get("text") if isinstance(pl.get("text"), str) else None
    return ProposalDetail(
        id=v.p.id,
        key=v.key,
        is_new=v.is_new,
        base_rev=v.p.base_rev,
        next_rev=v.next_rev,
        status=status_out("proposal", "stale" if v.stale else v.p.status),
        stale=v.stale,
        head_rev=v.head_rev,
        target=Change(before=v.before_target, after=target) if target else None,
        text=Change(before=v.before_text, after=text) if text else None,
        screen=target.split("#")[0] if target else None,
    )


def suite(s: Any, portal: str) -> SuiteDetail:
    def steps(rows: list[dict[str, Any]]) -> list[SuiteStep]:
        return [
            SuiteStep(
                kind=str(r.get("kind") or "fill"),
                name=str(r.get("name") or ""),
                value=str(r.get("value") or ""),
            )
            for r in rows
        ]

    return SuiteDetail(
        id=s.id,
        trace_id=s.trace_id,
        run_id=s.run_id,
        goal=s.goal,
        start_url=s.start_url,
        step_label=s.step_label,
        variants=[
            SuiteVariantOut(
                id=v.id,
                expect=v.expect,
                probe=v.probe,
                fault=v.fault,
                why=v.why,
                steps=steps(v.step_rows),
            )
            for v in s.variants
        ],
        expects=[Option(value=k, label=EXPECT_WORDS[k]) for k in suite_form.EXPECTS],
        kinds=[Option(value=k, label=KIND_WORDS[k]) for k in suite_form.KINDS],
        traces_file=f"portals/{portal}/traces.yaml",
        run_command=f"pnpm --dir apps/crawler portal:trace {portal} {s.trace_id} <persona>",
    )
