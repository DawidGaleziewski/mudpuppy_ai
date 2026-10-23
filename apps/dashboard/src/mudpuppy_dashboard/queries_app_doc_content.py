"""A record's content as blocks the React console draws without knowing record kinds (R-96,
spec 067; data-model.md "Content per kind", the htmx `partials/docs/content.html`): a sentence,
facts, a table, preformatted text, or the raw JSON when the shape is unknown, so nothing the BA
wrote is hidden. Portal-language values carry `lang`."""

from __future__ import annotations

import json
from collections.abc import Callable
from typing import Any, Literal

from pydantic import BaseModel

from .formats import short_id


class Fact(BaseModel):
    label: str
    values: list[str]  # one value, or a list ("None" when empty, as the htmx page says)
    mono: bool = False
    lang: str | None = None
    #: The values are steps or items: a list rather than a line.
    listed: bool = False


class Block(BaseModel):
    type: Literal["text", "facts", "table", "code"]
    text: str | None = None
    strong: bool = False
    facts: list[Fact] = []
    caption: str | None = None
    headers: list[str] = []
    rows: list[list[str]] = []


Content = dict[str, Any]


def _text(value: Any, strong: bool = False) -> Block:
    return Block(type="text", text=str(value or ""), strong=strong)


def _facts(*facts: Fact | None) -> Block:
    return Block(type="facts", facts=[f for f in facts if f is not None])


def _fact(label: str, value: Any, **kw: Any) -> Fact:
    return Fact(label=label, values=[str(value) if value not in (None, "") else "—"], **kw)


def _many(label: str, values: Any, none: str = "None", **kw: Any) -> Fact:
    items = [str(v) for v in values or []]
    return Fact(label=label, values=items or [none], **kw)


def _flow(steps: Any) -> list[str]:
    return [f"{s.get('n', '')}. {s.get('actor_or_system', '')}: {s.get('text', '')}" for s in steps]


def _screen(x: Content) -> list[Block]:
    blocks = [
        _facts(
            _fact("Purpose", x.get("purpose")),
            _many("Route templates", x.get("route_templates"), mono=True),
            _many("Entry points", x.get("entry_points"), listed=True),
        )
    ]
    if x.get("elements"):
        rows = [[e.get("role", ""), e.get("label_verbatim", "")] for e in x["elements"]]
        caption = "Elements (portal wording)"
        blocks.append(
            Block(type="table", caption=caption, headers=["Role", "Label as shown"], rows=rows)
        )
    return blocks


def _process(x: Content) -> list[Block]:
    extent = str(x.get("observed_extent") or "unknown").replace("_", " ")
    return [
        _facts(
            _fact("Goal", x.get("goal")),
            _fact("Persona", x.get("persona")),
            _fact("Trigger", x.get("trigger")),
            _fact("Outcome", x.get("outcome")),
            _fact("Observed extent", extent),
        )
    ]


def _use_case(x: Content) -> list[Block]:
    alternate = [
        Fact(label=f"Alternate flow {i}", values=_flow(f), listed=True)
        for i, f in enumerate(x.get("alternate_flows") or [], 1)
    ]
    exception = [
        Fact(label=f"Exception flow {i}", values=_flow(f), listed=True)
        for i, f in enumerate(x.get("exception_flows") or [], 1)
    ]
    return [
        _facts(
            _fact("Primary actor", x.get("primary_actor")),
            _many("Preconditions", x.get("preconditions"), listed=True),
            _fact("Trigger", x.get("trigger")),
            Fact(label="Main flow", values=_flow(x.get("main_flow") or []), listed=True),
            *alternate,
            *exception,
            _many("Postconditions", x.get("postconditions"), listed=True),
        )
    ]


def _scenarios(criteria: list[Content]) -> str:
    lines: list[str] = []
    for i, ac in enumerate(criteria, 1):
        lines.append(f"Scenario {i}")
        for word, part in (("Given", "given"), ("When", "when"), ("Then", "then")):
            for j, line in enumerate(ac.get(part) or []):
                lines.append(f"  {word if j == 0 else 'And'} {line}")
        lines.append("")
    return "\n".join(lines).rstrip()


def _requirement(x: Content) -> list[Block]:
    rationale = None
    if x.get("rationale"):
        sure = f" ({x['rationale_confidence']})" if x.get("rationale_confidence") else ""
        rationale = _fact("Rationale", f"{x['rationale']}{sure}")
    blocks = [
        _text(x.get("statement"), strong=True),
        _facts(_fact("Priority", x.get("priority") or "unset"), rationale),
    ]
    if x.get("acceptance_criteria"):
        caption = "Acceptance criteria"
        code = _scenarios(x["acceptance_criteria"])
        blocks.append(Block(type="code", caption=caption, text=code))
    return blocks


def _nfr(x: Content) -> list[Block]:
    m = x.get("measured")
    measured = (
        _fact("Measured", f"{m.get('value')} {m.get('unit')} · {m.get('how')}") if m else None
    )
    return [
        _text(x.get("statement"), strong=True),
        _facts(_fact("Category", x.get("category")), measured),
    ]


def _business_rule(x: Content) -> list[Block]:
    kind = str(x.get("rule_type") or "unknown").replace("_", " ")
    blocks = [_text(x.get("statement"), strong=True), _facts(_fact("Rule type", kind))]
    t = x.get("decision_table")
    if t:
        headers = [f"If {h}" for h in t.get("conditions", [])]
        headers += [f"Then {h}" for h in t.get("actions", [])]
        rows = [[str(c) for c in row] for row in t.get("rows", [])]
        blocks.append(Block(type="table", caption="Decision table", headers=headers, rows=rows))
    return blocks


def _glossary_term(x: Content) -> list[Block]:
    lang = x.get("lang")
    return [
        _facts(
            Fact(label="Term as shown", values=[str(x.get("term_verbatim", ""))], lang=lang),
            _fact("Definition", x.get("definition")),
            _many("Synonyms as shown", x.get("synonyms_verbatim"), lang=lang),
        )
    ]


def _constraints(k: Content) -> str:
    parts = ["required" if k.get("required") else "optional"]
    if k.get("format"):
        parts.append(f"format {k['format']}")
    if k.get("pattern_observed"):
        parts.append(f"pattern {k['pattern_observed']}")
    if k.get("min_length") is not None:
        parts.append(f"min length {k['min_length']}")
    if k.get("max_length") is not None:
        parts.append(f"max length {k['max_length']}")
    if k.get("allowed_values"):
        parts.append("allowed: " + ", ".join(str(a) for a in k["allowed_values"]))
    return " · ".join(parts)


def _data_item(x: Content) -> list[Block]:
    seen = [
        f"{str(s.get('kind', '')).replace('_', ' ')} {short_id(str(s.get('target_id', '')))}"
        for s in x.get("seen_in") or []
    ]
    return [
        _facts(
            Fact(
                label="Name as shown", values=[str(x.get("name_verbatim", ""))], lang=x.get("lang")
            ),
            _fact("Name", x.get("name_en")),
            _fact("Type", x.get("data_type"), mono=True),
            _fact("Constraints", _constraints(x.get("constraints") or {})),
            _many("Seen in", seen, none="Nowhere recorded"),
        )
    ]


def _api_endpoint(x: Content) -> list[Block]:
    return [
        _text(f"{x.get('method', '')} {x.get('path', '')}", strong=True),
        _facts(
            _fact("Purpose", x.get("purpose")),
            _many("Called from", x.get("called_from"), none="Not recorded"),
            _many("Request fields", x.get("request_fields"), mono=True),
            _many("Response fields", x.get("response_fields"), mono=True),
            _many("Statuses seen", x.get("statuses")),
        ),
    ]


def _followup(x: Content) -> list[Block]:
    t = x.get("target") or {}
    if t.get("process_name"):
        target = f"process “{t['process_name']}”: {t.get('goal', '')}"
    else:
        target = t.get("url") or "Unspecified"
    return [
        _text(x.get("question"), strong=True),
        _facts(
            _fact("Suggested mode", x.get("suggested_mode")),
            _fact("Target", target),
            _fact("Persona", x.get("persona")),
            _fact("Reason", x.get("reason")),
        ),
    ]


KINDS: dict[str, Callable[[Content], list[Block]]] = {
    "capability": lambda x: [_text(x.get("description"))],
    "screen": _screen,
    "process": _process,
    "use_case": _use_case,
    "requirement": _requirement,
    "nfr": _nfr,
    "business_rule": _business_rule,
    "glossary_term": _glossary_term,
    "data_item": _data_item,
    "api_endpoint": _api_endpoint,
    "assumption": lambda x: [
        _text(x.get("statement"), strong=True),
        _facts(_fact("Impact if wrong", x.get("impact_if_wrong"))),
    ],
    "open_question": lambda x: [
        _text(x.get("question"), strong=True),
        _facts(
            _fact("Why it matters", x.get("why_it_matters")),
            _fact("Answer needed from", x.get("answer_needed_from")),
        ),
    ],
    "followup": _followup,
}


def _raw(x: Any, what: str) -> list[Block]:
    text = json.dumps(x, ensure_ascii=False, indent=2)
    return [Block(type="code", caption=f"Content ({what})", text=text)]


def content_blocks(x: Any) -> list[Block]:
    """The blocks of one revision's `content_json`; the raw JSON for an unknown shape or kind,
    or one whose fields do not have the expected types."""
    if not isinstance(x, dict):
        return _raw(x, "unrecognised shape")
    kind = x.get("kind")
    render = KINDS.get(kind) if isinstance(kind, str) else None
    if render is None:
        return _raw(x, kind if isinstance(kind, str) else "unknown kind")
    try:
        body = render(x)
    except (AttributeError, TypeError):
        return _raw(x, "unrecognised shape")
    summary = [_text(x["summary"])] if x.get("summary") else []
    return [*summary, *body]
