"""The React console's scan sections (R-96, spec 055): States, Actions, Frontier, Forms, Network,
Robots, Decisions and Docs as typed JSON over the read models `queries` and `queries_docs`.
Statuses come mapped by the one status map; JSON comes as pretty-printed text; timestamps as
stored. Read-only, like every dashboard query."""

from __future__ import annotations

import sqlite3
from typing import Any, NamedTuple

from pydantic import BaseModel

from . import queries, queries_docs
from .formats import jget, pretty_json, short_id, top_locator
from .models import DECISION_KINDS, FRONTIER_STATUSES, SAFETY_CLASSES
from .queries_app import StatusOut, status_out
from .queries_app_screens import Option
from .status_map import status_of


class PageAt(NamedTuple):
    """Where a paged section starts (the API's cursor) and how many rows a page has."""

    cursor: str | None
    limit: int


#: Evidence the dashboard serves as a file (pictures); other refs are shown as their path.
PICTURES = ("png", "svg", "excalidraw")


class EvidenceOut(BaseModel):
    ref: str
    #: The picture's URL; None for a ref shown as its path (a snapshot, JSON).
    href: str | None


def evidence(ref: str | None) -> EvidenceOut | None:
    if not ref:
        return None
    served = ref.rsplit(".", 1)[-1] in PICTURES
    return EvidenceOut(ref=ref, href=f"/evidence/{ref}" if served else None)


def _json(value: Any) -> str | None:
    return None if value is None else pretty_json(value)


class StateRow(BaseModel):
    state: str
    title: str
    route: str
    picture: str | None
    confidence: StatusOut
    stabilization: str
    cluster: str
    evidence: EvidenceOut | None
    observed_at: str


def states(conn: sqlite3.Connection, scan: str) -> list[StateRow]:
    return [
        StateRow(
            state=o.state.id,
            title=o.state.title,
            route=o.state.route_template,
            picture=f"/evidence/{o.state.screenshot_ref}" if o.state.screenshot_ref else None,
            confidence=status_out("confidence", o.state.confidence),
            stabilization=o.state.stabilization.replace("_", " "),
            cluster=o.state.cluster_id,
            evidence=evidence(o.observation.evidence_ref),
            observed_at=o.observation.observed_at,
        )
        for o in queries.run_states(conn, scan)
    ]


class Count(BaseModel):
    #: The thing counted (a safety class, a status), as the filter takes it.
    value: str
    status: StatusOut
    #: A second facet (the decision, for actions); None when there is one.
    also: StatusOut | None = None
    count: int


class ActionRow(BaseModel):
    id: str
    name: str | None
    role: str
    safety: str
    decision: StatusOut
    skip_reason: str | None
    locator: str | None
    href: str | None


class ActionsTab(BaseModel):
    counts: list[Count]
    safety_options: list[Option]
    allowed_options: list[Option]
    filter: dict[str, str | None]
    items: list[ActionRow]
    total: int
    next_cursor: str | None


def _options(values: tuple[str, ...], vocabulary: str | None = None) -> list[Option]:
    return [
        Option(value=v, label=status_of(vocabulary, v).word if vocabulary else v) for v in values
    ]


def actions(
    conn: sqlite3.Connection, scan: str, safety: str | None, allowed: str | None, at: PageAt
) -> ActionsTab:
    safety = safety if safety in SAFETY_CLASSES else None
    flag = {"1": True, "0": False}.get(allowed or "")
    page = queries.run_actions(conn, scan, safety, flag, *at)
    return ActionsTab(
        counts=[
            Count(
                value=cls,
                status=StatusOut(shape=None, word=cls),
                also=status_out("allowed", "yes" if ok else "no"),
                count=n,
            )
            for (cls, ok), n in queries.action_counts(conn, scan).items()
        ],
        safety_options=_options(SAFETY_CLASSES),
        allowed_options=[Option(value="1", label="Allowed"), Option(value="0", label="Skipped")],
        filter={"safety_class": safety, "allowed": None if flag is None else allowed},
        items=[
            ActionRow(
                id=a.id,
                name=a.accessible_name,
                role=a.role,
                safety=a.safety_class,
                decision=status_out("allowed", "yes" if a.allowed else "no"),
                skip_reason=a.skip_reason,
                locator=top_locator(a.action_json),
                href=jget(a.action_json, "href"),
            )
            for a in page.items
        ],
        total=page.total,
        next_cursor=page.next_cursor,
    )


class FrontierRow(BaseModel):
    id: str
    status: StatusOut
    role: str | None
    name: str | None
    href: str | None
    safety: str
    depth: int
    priority: int
    reason: str | None


class FrontierTab(BaseModel):
    counts: list[Count]
    status_options: list[Option]
    filter: dict[str, str | None]
    items: list[FrontierRow]
    total: int
    next_cursor: str | None


def frontier(conn: sqlite3.Connection, scan: str, status: str | None, at: PageAt) -> FrontierTab:
    status = status if status in FRONTIER_STATUSES else None
    page = queries.run_frontier(conn, scan, status, *at)
    return FrontierTab(
        counts=[
            Count(value=st, status=status_out("frontier", st), count=n)
            for st, n in queries.frontier_counts(conn, scan).items()
        ],
        status_options=_options(FRONTIER_STATUSES, "frontier"),
        filter={"status": status},
        items=[
            FrontierRow(
                id=f.id,
                status=status_out("frontier", f.status),
                role=jget(f.action_json, "role"),
                name=jget(f.action_json, "accessible_name"),
                href=jget(f.action_json, "href"),
                safety=f.safety_class,
                depth=f.depth,
                priority=f.priority,
                reason=f.reason,
            )
            for f in page.items
        ],
        total=page.total,
        next_cursor=page.next_cursor,
    )


class Field(BaseModel):
    name: str
    type: str
    required: bool


class FormRow(BaseModel):
    id: str
    state: str
    #: The fields; None when the stored JSON has another shape (then `raw` shows it).
    fields: list[Field] | None
    raw: str | None
    confidence: StatusOut
    evidence: EvidenceOut | None


def _fields(value: Any) -> list[Field] | None:
    if not isinstance(value, list):
        return None
    return [
        Field(
            name=str(jget(f, "name") or "?"),
            type=str(jget(f, "type") or ""),
            required=bool(jget(f, "required")),
        )
        for f in value
    ]


def forms(conn: sqlite3.Connection, scan: str) -> list[FormRow]:
    out = []
    for f in queries.run_forms(conn, scan):
        fields = _fields(f.fields_json)
        out.append(
            FormRow(
                id=f.id,
                state=f.state_id,
                fields=fields,
                raw=None if fields is not None else _json(f.fields_json),
                confidence=status_out("confidence", f.confidence),
                evidence=evidence(f.evidence_ref),
            )
        )
    return out


class NetworkRow(BaseModel):
    id: str
    method: str
    url_template: str
    #: The transition that made the call; None: on screen load.
    transition: str | None
    code: int
    status: StatusOut
    request: str | None
    response: str | None
    console_errors: str | None
    errors: int


class Paged[T](BaseModel):
    items: list[T]
    total: int
    next_cursor: str | None


def network(conn: sqlite3.Connection, scan: str, at: PageAt) -> Paged[NetworkRow]:
    page = queries.run_network_calls(conn, scan, *at)
    return Paged[NetworkRow](
        items=[
            NetworkRow(
                id=n.id,
                method=n.method,
                url_template=n.url_template,
                transition=n.transition_id,
                code=n.status,
                status=status_out("http", "error" if n.status >= 400 else "ok"),
                request=_json(n.req_schema),
                response=_json(n.res_schema),
                console_errors=_json(n.console_errors) if n.console_errors else None,
                errors=len(n.console_errors) if isinstance(n.console_errors, list) else 0,
            )
            for n in page.items
        ],
        total=page.total,
        next_cursor=page.next_cursor,
    )


class RobotsRow(BaseModel):
    host: str
    url: str
    outcome: StatusOut
    http_status: int | None
    truncated: bool
    group: str | None
    product_token: str
    crawl_delay_s: float | None
    fetched_at: str
    evidence: EvidenceOut | None


def robots(conn: sqlite3.Connection, scan: str) -> list[RobotsRow]:
    return [
        RobotsRow(
            host=p.host,
            url=p.final_url or p.source_url,
            outcome=status_out("robots", p.outcome),
            http_status=p.http_status,
            truncated=p.truncated,
            group=p.group_used,
            product_token=p.product_token,
            crawl_delay_s=p.crawl_delay_s,
            fetched_at=p.fetched_at,
            evidence=evidence(p.evidence_ref),
        )
        for p in queries.run_robots_policies(conn, scan)
    ]


class DecisionGroupOut(BaseModel):
    kind: StatusOut
    rule: str | None
    count: int
    example: str


class DecisionRow(BaseModel):
    id: str
    kind: StatusOut
    rule: str | None
    reason: str
    detail: str | None
    subject: str | None
    at: str


class DecisionsTab(BaseModel):
    groups: list[DecisionGroupOut]
    kind_options: list[Option]
    rule_options: list[Option]
    filter: dict[str, str | None]
    items: list[DecisionRow]
    total: int
    next_cursor: str | None


def decisions(
    conn: sqlite3.Connection, scan: str, kind: str | None, rule: str | None, at: PageAt
) -> DecisionsTab:
    kind = kind if kind in DECISION_KINDS else None
    rule = rule or None
    page = queries.run_decisions(conn, scan, kind, rule, *at)
    return DecisionsTab(
        groups=[
            DecisionGroupOut(
                kind=status_out("decision", g.kind),
                rule=g.rule,
                count=g.count,
                example=g.example_reason,
            )
            for g in queries.decision_groups(conn, scan)
        ],
        kind_options=_options(DECISION_KINDS, "decision"),
        rule_options=_options(tuple(queries.decision_rules(conn, scan))),
        filter={"kind": kind, "rule": rule},
        items=[
            DecisionRow(
                id=d.id,
                kind=status_out("decision", d.kind),
                rule=d.rule,
                reason=d.reason,
                detail=_json(d.detail_json),
                subject=d.subject_ref,
                at=d.created_at,
            )
            for d in page.items
        ],
        total=page.total,
        next_cursor=page.next_cursor,
    )


class Cite(BaseModel):
    #: What it cites ("state", "network call"), and its id cut short.
    kind: str
    id: str
    #: The scan section that lists it; None for a kind no section lists.
    tab: str | None
    note: str | None


class DocRow(BaseModel):
    key: str
    portal: str
    title: str
    kind: str
    rev: int
    status: StatusOut
    confidence: StatusOut
    cites: list[Cite]


def docs(conn: sqlite3.Connection, scan: str, at: PageAt) -> Paged[DocRow]:
    page = queries_docs.run_citing_records(conn, scan, cursor=at.cursor, limit=at.limit)
    tabs = queries_docs.EVIDENCE_TABS
    return Paged[DocRow](
        items=[
            DocRow(
                key=it.row.record.key,
                portal=it.row.record.portal_id,
                title=it.row.record.title,
                kind=it.row.record.kind.replace("_", " "),
                rev=it.row.rev_no,
                status=status_out("doc", it.row.status),
                confidence=status_out("confidence", it.row.confidence),
                cites=[
                    Cite(
                        kind=c.target_kind.replace("_", " "),
                        id=short_id(c.target_id),
                        tab=tabs.get(c.target_kind),
                        note=c.note,
                    )
                    for c in it.cites
                ],
            )
            for it in page.items
        ],
        total=page.total,
        next_cursor=page.next_cursor,
    )
