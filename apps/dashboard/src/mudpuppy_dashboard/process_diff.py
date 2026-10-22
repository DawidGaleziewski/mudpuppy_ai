"""The step diff of two process models (spec 022 screen 06, FE-P03). Pure: no database.

A to-be step names, in `from`, the steps of the model it was branched from that it replaces.
Against that model each right step is:
- `unchanged`: from one step, same screen (or same title and route when drawn);
- `changed`: from one step, something differs;
- `merged`: from two or more steps;
- `added`: from none.
A left step no right step comes from is `removed`. Rows follow the left order; an added step sits
after the row of the step before it on the right.
"""

from __future__ import annotations

from typing import Any, Literal, NamedTuple

Change = Literal["unchanged", "changed", "merged", "added", "removed"]

Step = dict[str, Any]


class DiffRow(NamedTuple):
    change: Change
    left: list[Step]  # the left steps this row covers (two or more when merged)
    right: Step | None  # None when removed


def _same(a: Step, b: Step) -> bool:
    if a.get("state_id") and b.get("state_id"):
        return bool(a["state_id"] == b["state_id"])
    return (a.get("title"), a.get("route")) == (b.get("title"), b.get("route"))


def _classify(right: Step, left_by_id: dict[str, Step]) -> Change:
    sources = [left_by_id[f] for f in right.get("from", []) if f in left_by_id]
    if not sources:
        return "added"
    if len(sources) > 1:
        return "merged"
    return "unchanged" if _same(sources[0], right) else "changed"


def diff(left: list[Step], right: list[Step]) -> list[DiffRow]:
    """Rows of the comparison, in reading order."""
    left_by_id = {s["id"]: s for s in left}
    claimed: dict[str, Step] = {}  # left step id → the right step that comes from it
    for r in right:
        for f in r.get("from", []):
            claimed.setdefault(f, r)
    rows: list[DiffRow] = []
    placed: set[str] = set()  # right step ids already in a row
    pending_added: list[Step] = []
    right_index = {r["id"]: i for i, r in enumerate(right)}

    def flush_added_before(limit: int) -> None:
        while pending_added and right_index[pending_added[0]["id"]] < limit:
            step = pending_added.pop(0)
            rows.append(DiffRow("added", [], step))
            placed.add(step["id"])

    for r in right:
        if _classify(r, left_by_id) == "added":
            pending_added.append(r)
    for step in left:
        r = claimed.get(step["id"])
        if r is None:
            rows.append(DiffRow("removed", [step], None))
            continue
        if r["id"] in placed:
            continue  # the second source of a merge: already in that row
        flush_added_before(right_index[r["id"]])
        sources = [left_by_id[f] for f in r.get("from", []) if f in left_by_id]
        rows.append(DiffRow(_classify(r, left_by_id), sources, r))
        placed.add(r["id"])
    flush_added_before(len(right))
    return rows


def counts(rows: list[DiffRow]) -> dict[Change, int]:
    out: dict[Change, int] = {"unchanged": 0, "changed": 0, "merged": 0, "added": 0, "removed": 0}
    for row in rows:
        out[row.change] += 1
    return out
