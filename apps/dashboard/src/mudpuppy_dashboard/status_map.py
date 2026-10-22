"""The ONE mapping from stored statuses to Salvage Yard statuses (spec 022 FR-001, FE-V08).

Every status is shape + word: `data-status` picks the shape and colour, the word is always
shown. The enum and meanings are in `docs/design/salvage-yard/docs/03-colour-guide.md` §3;
`migration/status-map.csv` maps the Console labels. A value that is a kind rather than a state
(a decision "merge", a span "phase") has no shape: `shape` is None and it renders as a mono label.
"""

from __future__ import annotations

from collections.abc import Iterable
from typing import Literal, NamedTuple, get_args

Shape = Literal[
    "ok",
    "running",
    "live",
    "needs",
    "stopped",
    "skipped",
    "todo",
    "queued",
    "unobserved",
    "draft",
    "inferred",
    "failed",
]
SHAPES: frozenset[str] = frozenset(get_args(Shape))


class Status(NamedTuple):
    shape: Shape | None
    word: str


def _s(shape: Shape | None, word: str) -> Status:
    return Status(shape, word)


VOCABULARIES: dict[str, dict[str, Status]] = {
    "run": {
        "completed": _s("ok", "Completed"),
        "running": _s("running", "Running"),
        "stopped_warning": _s("failed", "Stopped"),
        "interrupted": _s("stopped", "Interrupted"),
    },
    "frontier": {
        "done": _s("ok", "Done"),
        "pending": _s("queued", "Queued"),
        "skipped_unsafe": _s("skipped", "Skipped · safety"),
        "denylisted": _s("skipped", "Skipped · denylist"),
        "robots_disallowed": _s("skipped", "Skipped · robots"),
        "out_of_scope": _s("skipped", "Skipped · scope"),
        "budget_reached": _s("skipped", "Skipped · budget"),
        "unreachable": _s("failed", "Unreachable"),
    },
    "decision": {
        "warning": _s("needs", "Warning"),
        "skip": _s("skipped", "Skipped"),
        "refuse": _s("skipped", "Refused"),
        "merge": _s(None, "merge"),
        "split": _s(None, "split"),
        "note": _s(None, "note"),
    },
    "span": {
        "ok": _s("ok", "OK"),
        "running": _s("running", "Running"),
        "refused": _s("skipped", "Refused"),
        "stopped": _s("failed", "Stopped"),
        "error": _s("failed", "Failed"),
        "unfinished": _s("failed", "Unfinished"),
    },
    "span_kind": {"phase": _s(None, "phase"), "event": _s(None, "event")},
    "doc": {
        "confirmed": _s("ok", "Confirmed"),
        "draft": _s("draft", "Draft"),
        "rejected": _s("stopped", "Rejected"),
        "superseded": _s("stopped", "Superseded"),
        "withdrawn": _s("stopped", "Withdrawn"),
    },
    "followup": {
        "open": _s("todo", "Open"),
        "in_progress": _s("running", "In progress"),
        "done": _s("ok", "Done"),
        "blocked": _s("stopped", "Blocked"),
        "cancelled": _s("stopped", "Cancelled"),
    },
    "review": {
        "confirm": _s("ok", "Confirmed"),
        "reject": _s("stopped", "Rejected"),
        "comment": _s(None, "comment"),
    },
    "outcome": {
        "goal_reached": _s("ok", "Goal reached"),
        "boundary_reached": _s("stopped", "Boundary reached"),
        "stopped": _s("failed", "Stopped"),
        "abandoned": _s("stopped", "Abandoned"),
        "": _s("running", "Running"),  # no outcome yet: the trace is still running
    },
    "step": {
        "todo": _s("todo", "To do"),
        "pending": _s("queued", "Pending"),
        "in_progress": _s("running", "In progress"),
        "done": _s("ok", "Done"),
        "failed": _s("failed", "Failed"),
        "stopped": _s("stopped", "Stopped"),
    },
    "amendment": {
        "active": _s("live", "Active"),
        "superseded": _s("needs", "Re-anchor"),
        "needs_reanchor": _s("needs", "Re-anchor"),
        "dismissed": _s("stopped", "Dismissed"),
        "withdrawn": _s("stopped", "Withdrawn"),
    },
    # A credential the assistant asked for in the chat (spec 022 FE-A05).
    "credential": {"needed": _s("needs", "Needs you"), "stored": _s("ok", "Stored")},
    # The assistant's proposals (spec 022 FE-A04); "undone" is a discarded one that was applied.
    "proposal": {
        "open": _s("draft", "Proposed"),
        "applied": _s("ok", "Applied"),
        "saved": _s("ok", "Saved"),  # the revision applying wrote
        "discarded": _s("skipped", "Discarded"),
        "undone": _s("skipped", "Undone"),
        "stale": _s("stopped", "Out of date"),
    },
    # Form probes (spec 032): a suite the BA proposed waits for the owner; what a probe produced;
    # the kind of a form step's state. Red is kept for technical errors (a failure the user sees).
    "suite": {
        "proposed": _s("draft", "Proposed"),
        "approved": _s("ok", "Approved"),
        "dismissed": _s("skipped", "Dismissed"),
    },
    "probe_outcome": {
        "next": _s("ok", "Next"),
        "branch": _s("live", "Branch"),
        "validation": _s("todo", "Validation"),
        "technical": _s("failed", "Technical error"),
        "temporary": _s("queued", "Temporary"),
        "blocked": _s("skipped", "Blocked"),
    },
    # The map (spec 033): a node's `data-state` and its word. Red only where the crawler failed.
    "map_node": {
        "observed": _s("ok", "Observed"),
        "unobserved": _s("unobserved", "Not in these scans"),
        "failed": _s("failed", "Failed"),
        "blocked": _s("skipped", "Blocked"),
        "frontier": _s("queued", "Queued"),
    },
    "state_kind": {
        "main": _s("ok", "Main"),
        "validation": _s("todo", "Validation"),
        "technical": _s("failed", "Technical"),
    },
    "confidence": {
        "observed": _s("ok", "Observed"),
        "inferred": _s("inferred", "Inferred"),
        "needs_confirmation": _s("needs", "Needs confirmation"),
    },
    "allowed": {"yes": _s("ok", "Allowed"), "no": _s("skipped", "Skipped")},
    # spec 039: a deviation of the portal model and the hypothesis that explains it
    "deviation": {
        "open": _s("needs", "Needs you"),
        "waiting_test": _s("queued", "Waiting for a check"),
        "explained": _s("inferred", "Explained automatically"),  # v2-02: overturnable, not ok
    },
    # spec 039 T100: a business rule in the UI's words (12-v2-ux.md § 4) and its boundary tests
    "rule": {
        "broken": _s("failed", "Broken"),
        "changed": _s("needs", "Changed"),  # spec 040 FR-007: drifted on a release, re-mine it
        "proposed": _s("inferred", "Proposed"),
        "tested": _s("inferred", "Tested"),
        "confirmed": _s("ok", "Confirmed"),
        "replaced": _s("skipped", "Replaced"),
        "rejected": _s("stopped", "Rejected"),
    },
    # spec 039 T100 (v2-06 / v2-07): a screen of the portal model, and an action or link on it
    "model_screen": {
        "active": _s("live", "Active"),
        "merged": _s("skipped", "Merged"),
        "retired": _s("stopped", "Retired"),
    },
    "action": {
        "active": _s("live", "Active"),
        "not_seen_since": _s("unobserved", "Not seen lately"),
        "untested": _s("todo", "Not checked"),
        "retired": _s("skipped", "Retired"),
    },
    "explored": {
        "thorough": _s("ok", "Thorough"),
        "partial": _s("needs", "Partial"),
        "not_explored": _s("todo", "Not explored"),
    },
    "boundary_test": {
        "pass": _s("ok", "Pass"),
        "fail": _s("failed", "Fail"),
        "inconclusive": _s("stopped", "Inconclusive"),
        "waiting": _s("queued", "Waiting"),
    },
    "hypothesis": {
        "proposed": _s("needs", "Proposed"),
        "testing": _s("running", "Testing"),
        "supported": _s("inferred", "Supported"),
        "confirmed": _s("ok", "Confirmed"),
        "refuted": _s("stopped", "Refuted"),
        "rejected": _s("stopped", "Rejected"),
        "superseded": _s("skipped", "Superseded"),
    },
    "robots": {
        "rules": _s("ok", "Rules"),
        "no_rules": _s("ok", "No rules"),
        "unreachable": _s("failed", "Unreachable"),
    },
    "http": {"ok": _s("ok", "OK"), "error": _s("failed", "Error")},
    "assistant": {
        "up": _s("ok", "Assistant up"),
        "down": _s("failed", "Assistant down"),
        "connecting": _s("queued", "Connecting"),
    },
    "environment": {
        "not_configured": _s("todo", "Not configured"),
        "not_marked": _s("todo", "Not marked"),
    },
    # Portal hook runs (spec 023 US2.3).
    "hook": {
        "ok": _s("ok", "Ran"),
        "skip": _s("skipped", "Skipped the page"),
        "rewrite": _s("ok", "Opened another URL"),
        "wait": _s("ok", "Waited"),
        "failed": _s("failed", "Failed"),
        "timeout": _s("failed", "Timed out"),
    },
    # Does a screen change with who is looking (spec 024 US2)?
    "access": {
        "depends": _s("live", "Differs"),
        "same": _s("skipped", "Same for all"),
    },
    # Has a BA record explained a difference between personas (spec 024 US3.4)?
    "explained": {
        "no": _s("needs", "Unexplained"),
    },
    # An assumption a record rests on, until a reviewer confirms it (spec 029).
    "assumption": {
        "to_check": _s("needs", "To check"),
    },
    # BA processes (spec 022 M5, screens 04–07).
    "stage": {
        "suggested": _s("inferred", "Suggested"),
        "scoped": _s("todo", "Scoped"),
        "as_is_documented": _s("ok", "As-is documented"),
        "to_be_design": _s("draft", "To-be in design"),
        "migrating": _s("running", "Migrating"),
        "migrated": _s("ok", "Migrated"),
    },
    "step_change": {
        "unchanged": _s("ok", "Unchanged"),
        "changed": _s("draft", "Changed"),
        "merged": _s("draft", "Merged"),
        "added": _s("draft", "Added"),
        "removed": _s("skipped", "Removed"),
    },
    "process_model": {
        "as_is": _s("ok", "Observed"),
        "to_be": _s("draft", "Drawn"),
        "draft": _s("draft", "Draft open"),
        "live": _s("live", "Live"),
        "conflict": _s("stopped", "Someone saved first"),
    },
    # Workbench (spec 043, designer 16-genui-components.md § 4.2, § 5.3, § 5.12). A stopped scan is
    # ash (the failure is the ErrorCard's job); a dropped stream is "Not live", never "Stopped".
    "wb_scan": {
        "running": _s("running", "Running"),
        "stopped": _s("stopped", "Stopped"),
        "finished": _s("ok", "Finished"),
        "stale": _s("unobserved", "Not live"),
    },
    "wb_cmd": {
        "proposed": _s("draft", "Proposed"),
        "running": _s("running", "Running"),
        "done": _s("ok", "Done"),
        "failed": _s("failed", "Failed"),
        "undone": _s("stopped", "Undone"),
    },
}


def options(values: Iterable[str], vocabulary: str | None = None) -> list[tuple[str, str]]:
    """(value, label) pairs for a filter select: the status word when a vocabulary is given."""
    return [(v, status_of(vocabulary, v).word if vocabulary else v) for v in values]


def status_of(vocabulary: str, value: object) -> Status:
    """The status for a stored value (None counts as ""); an unknown value keeps its own text
    with no shape."""
    key = "" if value is None else str(value)
    found = VOCABULARIES[vocabulary].get(key)
    if found is not None:
        return found
    return Status(None, key.replace("_", " ") or "—")
