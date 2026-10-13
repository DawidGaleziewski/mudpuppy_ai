"""The generated change spec of a process (spec 022 screen 06, FR-008). Pure: no database.

Built from the A/B step diff and the records that cite the screens; every section is plain text
or a list of lines that a person edits before saving (each save is a change spec revision).
Export is Markdown.
"""

from __future__ import annotations

from typing import Any, NamedTuple

from .process_diff import DiffRow

SECTIONS: tuple[tuple[str, str], ...] = (
    ("scope", "Scope"),
    ("as_is", "As-is"),
    ("to_be", "To-be"),
    ("delta", "Delta"),
    ("records", "Records that cite these screens"),
    ("migration_cut", "Migration cut"),
    ("open_questions", "Open questions"),
)

Sections = dict[str, str | list[str]]


class SpecInput(NamedTuple):
    name: str
    persona: str
    environment: str | None
    left_label: str  # "A r1"
    right_label: str  # "B r2"
    left_steps: list[dict[str, Any]]
    right_steps: list[dict[str, Any]]
    rows: list[DiffRow]
    scans: int  # scans that observed the left variant's screens
    records: list[str]  # "CAP-005 Product and help information"


def _title(step: dict[str, Any]) -> str:
    return f"{step.get('title') or '(untitled)'} ({step.get('route') or '—'})"


def _delta_line(row: DiffRow) -> str | None:
    lefts = ", ".join(_title(s) for s in row.left)
    right = _title(row.right) if row.right else ""
    lines = {
        "removed": f"Remove {lefts}",
        "added": f"Add {right}",
        "merged": f"Merge {lefts} into {right}",
        "changed": f"Change {lefts} to {right}",
    }
    return lines.get(row.change)


def _routes(steps: list[dict[str, Any]]) -> set[str]:
    return {s["route"] for s in steps if s.get("route")}


def generate(spec: SpecInput) -> Sections:
    """Every section, ready to edit."""
    drawn = [s for s in spec.right_steps if not s.get("observed")]
    moved = sorted(_routes(spec.left_steps) - _routes(spec.right_steps))
    new = sorted(_routes(spec.right_steps) - _routes(spec.left_steps))
    questions = [f"{_title(s)} is designed, not observed: confirm it with the team." for s in drawn]
    if not spec.left_steps:
        questions.append("The as-is has no steps yet: scan the portal before sign-off.")
    env = f" · {spec.environment}" if spec.environment else ""
    return {
        "scope": f"{spec.name} · persona {spec.persona}{env}",
        "as_is": (
            f"{spec.left_label}: {len(spec.left_steps)} screens observed in {spec.scans} "
            f"scan{'' if spec.scans == 1 else 's'}."
        ),
        "to_be": f"{spec.right_label}: {len(spec.right_steps)} steps: "
        + ", ".join(s.get("title") or "(untitled)" for s in spec.right_steps)
        + ".",
        "delta": [line for row in spec.rows if (line := _delta_line(row))],
        "records": list(spec.records),
        "migration_cut": (
            f"Routes that go: {', '.join(moved) or 'none'}. New routes: {', '.join(new) or 'none'}."
            " Rollback: mark the as-is live again."
        ),
        "open_questions": questions,
    }


def to_markdown(name: str, sections: Sections) -> str:
    """The export file: one heading per section, lists as bullets."""
    out = [f"# Change spec: {name}", ""]
    for key, title in SECTIONS:
        value = sections.get(key)
        out.append(f"## {title}")
        out.append("")
        if isinstance(value, list) and value:
            out.extend(f"- {line}" for line in value)
        else:
            out.append(value if isinstance(value, str) and value else "None.")
        out.append("")
    return "\n".join(out)
