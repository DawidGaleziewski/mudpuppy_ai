"""A trace event's detail as label–value facts (R-96, spec 056): the htmx macro
`trace_event_detail` (contracts/005 trace-spans.md "Names") in the API's words, so the React
console renders facts and never reads an event's attributes itself. Pure functions."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from pydantic import BaseModel

from .formats import jget
from .status_map import status_of


class Fact(BaseModel):
    label: str
    value: str
    #: A mono value (an id, a rule, a selector).
    mono: bool = False


class EventDetail(BaseModel):
    facts: list[Fact]
    #: Lines under the facts (requests still in flight when a page did not settle).
    lines: list[str]
    #: The decision log's rule this event names: the page links the Decisions section to it.
    rule: str | None


def _url(u: Any) -> str:
    """A shaped URL (`route`, `query_keys`, `origin`) as one line."""
    if not isinstance(u, dict):
        return "—"
    keys = jget(u, "query_keys") or []
    query = f"?{','.join(keys)}" if keys else ""
    origin = f" {u['origin']}" if jget(u, "origin") else ""
    return f"{jget(u, 'route') or ''}{query}{origin}" or "—"


def _allowed(flag: object) -> str:
    return status_of("allowed", "yes" if flag else "no").word


def _num(v: object, fmt: str = "{}") -> str:
    return "—" if v is None else fmt.format(v)


def _gate(a: dict[str, Any]) -> list[Fact]:
    action = jget(a, "action")
    target = (
        _url(a["url"])
        if jget(a, "url")
        else f'{jget(action, "role") or ""} "{jget(action, "accessible_name") or ""}"'
    )
    facts = [
        Fact(label="Input", value=f"{a.get('input_kind', '')} · {target}"),
        Fact(label="Safety class", value=str(a.get("safety_class", "")), mono=True),
        Fact(
            label="Verdict",
            value=" ".join(filter(None, [_allowed(a.get("allowed")), a.get("rule")])),
        ),
    ]
    if a.get("reason"):
        facts.append(Fact(label="Reason", value=str(a["reason"])))
    return facts


def _robots(a: dict[str, Any]) -> list[Fact]:
    return [
        Fact(label="URL", value=_url(a.get("url"))),
        Fact(label="Rule", value=str(a.get("rule") or "—"), mono=True),
        Fact(label="Action", value=_allowed(a.get("action") == "allowed")),
    ]


def _request(a: dict[str, Any]) -> list[Fact]:
    main = " main frame" if a.get("main_frame") else ""
    decision = [
        a.get("decision"),
        a.get("reason"),
        a.get("status"),
        "failed" if a.get("failed") else None,
    ]
    facts = [
        Fact(
            label="Request",
            value=f"{a.get('method', '')} {a.get('resource_type', '')} {_url(a.get('url'))}{main}",
        ),
        Fact(label="Decision", value=" · ".join(str(x) for x in decision if x)),
    ]
    if a.get("robots_rule"):
        facts.append(Fact(label="Robots rule", value=str(a["robots_rule"]), mono=True))
    if a.get("redirect_to"):
        facts.append(Fact(label="Redirect to", value=_url(a["redirect_to"])))
    if a.get("limiter_wait_ms"):
        facts.append(Fact(label="Limiter wait", value=f"{a['limiter_wait_ms']} ms"))
    return facts


def _block(a: dict[str, Any]) -> list[Fact]:
    return [
        Fact(label="Signature", value=str(a.get("signature", "")), mono=True),
        Fact(label="Response status", value=_num(a.get("status"))),
        Fact(label="URL", value=_url(a.get("url"))),
    ]


def _decision(a: dict[str, Any]) -> list[Fact]:
    return [
        Fact(label="Kind", value=status_of("decision", a.get("kind")).word),
        Fact(label="Rule", value=str(a.get("rule") or "—"), mono=True),
        Fact(label="Decision log", value=str(a.get("decision_id") or "—"), mono=True),
    ]


def _fingerprint(a: dict[str, Any]) -> list[Fact]:
    matched = " · matched existing" if a.get("matched") else " · new state"
    similarity = _num(a.get("similarity"), "{:.3f}")
    threshold = _num(a.get("threshold"), "{:.3f}")
    return [
        Fact(label="Route", value=str(a.get("route_template", "")), mono=True),
        Fact(label="Decision", value=f"{a.get('decision', '')}{matched}"),
        Fact(label="Cluster", value=str(a.get("cluster_id") or "—"), mono=True),
        Fact(label="Similarity", value=f"{similarity} (threshold {threshold})"),
    ]


def _frontier(a: dict[str, Any]) -> list[Fact]:
    facts = [
        Fact(label="Action", value=f"{a.get('action', '')} {a.get('safety_class', '')}", mono=True),
        Fact(label="Priority / depth", value=f"{a.get('priority')} / {a.get('depth')}"),
    ]
    if a.get("rule"):
        reason = f" · {a['reason']}" if a.get("reason") else ""
        facts.append(Fact(label="Rule", value=f"{a['rule']}{reason}"))
    return facts


def _pick(a: dict[str, Any]) -> list[Fact]:
    if a.get("frontier_id"):
        picked = f"priority {a.get('priority')}, depth {a.get('depth')}"
    else:
        picked = "nothing" + (f" · {a['reason']}" if a.get("reason") else "")
    return [Fact(label="Picked", value=picked), Fact(label="Pending", value=_num(a.get("pending")))]


def _settle(a: dict[str, Any]) -> list[Fact]:
    return [
        Fact(label="Timeout", value=f"{a.get('timeout_ms')} ms"),
        Fact(label="Since last mutation", value=f"{a.get('since_mutation_ms')} ms"),
        Fact(label="Running animations", value=_num(a.get("running_animations"))),
    ]


def _obstacle(a: dict[str, Any]) -> list[Fact]:
    return [
        Fact(label="Obstacle", value=str(a.get("obstacle_id", "")), mono=True),
        Fact(label="Selector", value=str(a.get("selector", "")), mono=True),
        Fact(label="Dismissed by", value=str(a.get("via", ""))),
    ]


FACTS: dict[str, Callable[[dict[str, Any]], list[Fact]]] = {
    "gate_decision": _gate,
    "robots_check": _robots,
    "request": _request,
    "block_verdict": _block,
    "decision": _decision,
    "fingerprint_assign": _fingerprint,
    "frontier_enqueue": _frontier,
    "frontier_skip": _frontier,
    "frontier_pick": _pick,
    "stabilization_timeout": _settle,
    "obstacle": _obstacle,
}


def event_detail(name: str, attrs: Any) -> EventDetail:
    """The facts of an event by its name; an unknown name (or no attributes) has none."""
    a = attrs if isinstance(attrs, dict) else {}
    fn = FACTS.get(name)
    lines = []
    if name == "stabilization_timeout":
        lines = [
            f"{r.get('resource_type', '')} {_url(r.get('url'))} {r.get('age_ms')} ms in flight"
            for r in a.get("in_flight") or []
            if isinstance(r, dict)
        ]
    rule = a.get("rule") if name == "decision" and a.get("rule") else None
    return EventDetail(facts=fn(a) if fn and a else [], lines=lines, rule=rule)
