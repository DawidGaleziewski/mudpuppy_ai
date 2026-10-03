"""Mermaid source for the Docs tab (spec 004 research §9).

Python twin of ``apps/crawler/packages/docs/src/render/mermaid.ts``: the export uses the TS builder,
the dashboard this one, so pages stay under the 1 s budget. Both must produce byte-identical text
for the shared goldens in ``specs/004-ba-documentation/contracts/diagram-fixtures/``; change them
together.
"""

from __future__ import annotations

import re
from collections.abc import Mapping, Sequence
from typing import Any

_WS = re.compile(r"\s+")
_NON_ID = re.compile(r"[^A-Za-z0-9_]")


def node_id(key: str) -> str:
    """Node id from a record key: ``SCR-001`` -> ``SCR_001``."""
    return _NON_ID.sub("_", key)


def label(text: str) -> str:
    """A label safe inside ``"..."``: quotes and brackets as entities, whitespace collapsed."""
    return (
        _WS.sub(" ", text)
        .strip()
        .replace("&", "#amp;")
        .replace('"', "#quot;")
        .replace("<", "#lt;")
        .replace(">", "#gt;")
    )


def process_map(data: Mapping[str, Any]) -> str:
    steps = sorted(data["steps"], key=lambda s: s["ord"])
    boundary = data.get("boundary")
    lines = ["flowchart TD", f'  start(["{label(data["process"]["title"])}"])']
    for s in steps:
        lines.append(f'  s{s["ord"]}["{s["ord"]}. {label(s["kind"])}: {label(s["intent"])}"]')
    if boundary:
        lines.append(
            f'  boundary{{{{"{label(boundary["action"])}: {label(boundary["not_observable"])}"}}}}'
        )
    prev = "start"
    for s in steps:
        lines.append(f"  {prev} --> s{s['ord']}")
        prev = f"s{s['ord']}"
    if boundary:
        lines.append(f"  {prev} -.-> boundary")
        lines.append("  classDef notObservable stroke-dasharray: 4 3")
        lines.append("  class boundary notObservable")
    return "\n".join(lines) + "\n"


def screen_nav(data: Mapping[str, Any]) -> str:
    screens = sorted(data["screens"], key=lambda s: s["key"])
    known = {s["key"] for s in screens}
    transitions = sorted(
        (
            (t["from"], t["to"], label(t["label"]))
            for t in data["transitions"]
            if t["from"] in known and t["to"] in known
        ),
    )
    lines = ["flowchart LR"]
    for s in screens:
        lines.append(f'  {node_id(s["key"])}["{label(s["key"])}: {label(s["title"])}"]')
    seen: set[str] = set()
    for frm, to, text in transitions:
        line = f'  {node_id(frm)} -->|"{text}"| {node_id(to)}'
        if line in seen:
            continue
        seen.add(line)
        lines.append(line)
    return "\n".join(lines) + "\n"


def capability_map(data: Mapping[str, Sequence[Mapping[str, Any]]]) -> str:
    lines = ["flowchart TB"]
    for c in sorted(data["capabilities"], key=lambda c: c["key"]):
        cid = node_id(c["key"])
        lines.append(f'  subgraph {cid}["{label(c["key"])}: {label(c["title"])}"]')
        for p in sorted(c["contains"], key=lambda p: p["key"]):
            pid = f"{cid}__{node_id(p['key'])}"
            lines.append(f'    {pid}["{label(p["key"])}: {label(p["title"])}"]')
        lines.append("  end")
    return "\n".join(lines) + "\n"
