"""What the Workbench's frame partials render (spec 043 T015; designer 16-genui-components.md
§ 5.3–5.6, § 5.12): a generated view frame, its "Why this view?" facts and a command card. The
model's words (`why`, the asked message) arrive here as plain strings; the templates escape them
(autoescape) and never put them in an attribute or a URL."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

PATH_WORDS = {
    "chat": "Chat",
    "mapping": "Mapping",
    "troubleshoot": "Troubleshoot",
    "explain": "Explain",
}
REASONS = (
    ("wrong_path", "Wrong path"),
    ("missing_something", "Missing something"),
    ("too_much", "Too much"),
    ("wrong_data", "Wrong data"),
    ("other", "Other"),
)


def clock(iso: str | None) -> str:
    """`2026-10-06T10:58:44.000Z` → `10:58:44Z` (the Workbench's times, UTC with Z)."""
    return f"{iso[11:19]}Z" if iso and len(iso) >= 19 else "—"


@dataclass(frozen=True)
class WhyFacts:
    """The lead frame's "Why this view?" (§ 5.4): only the spec's words and the server's."""

    path: str
    by_you: bool
    because: str
    asked: str
    shows: tuple[str, ...]
    data: str
    other_paths: tuple[str, ...]  # the paths the person has, the current one left out

    @property
    def path_word(self) -> str:
        who = "you switched to it" if self.by_you else "picked by the assistant"
        return f"{PATH_WORDS[self.path]} · {who}"


@dataclass(frozen=True)
class Feedback:
    """Right view? Yes / No with reasons (§ 5.5), one answer per view per person."""

    url: str
    value: str | None = None  # yes · no · None (not answered)
    reasons: tuple[str, ...] = ()


@dataclass(frozen=True)
class Frame:
    """One generated frame; the first of a view is its lead frame (Why and feedback)."""

    dom_id: str  # t{turn}-{spec id}
    title: str
    source: str  # "From events up to 10:58:44Z"
    title_mono: bool = False  # a route as the title keeps its case
    card: bool = False  # inline placement: inside a chat message
    failure: bool = False  # ErrorCard only
    state: str = "ready"  # ready · composing · stale
    status: str | None = None  # a `wb_scan` value for live frames
    why: WhyFacts | None = None  # lead frame only
    feedback: Feedback | None = None  # lead frame only
    stale_since: str | None = None  # the last event time when the stream dropped


@dataclass(frozen=True)
class CommandCard:
    """A command card (§ 5.12) in one of its seven states; facts in the designer's fixed order."""

    dom_id: str
    title: str
    state: str  # proposed · running · done · failed · cancelled · expired · undone
    facts: tuple[tuple[str, str], ...] = ()
    reason: str = ""
    proposed_by: str = "assistant"  # assistant · button
    confirm_url: str | None = None
    cancel_url: str | None = None
    token: str | None = None  # the one-time confirm token (proposed only)
    result: str = ""  # done: what happened; expired: why it no longer applies
    result_links: tuple[tuple[str, str], ...] = field(default=())  # (label, href)
    error: str = ""  # failed: the command's message
    error_ref: str | None = None
    retry_url: str | None = None
    running_word: str = "Running"  # "Resuming…", "Stopping…"
    # A Start card's persona choice (spec 044): asked only when `personas` is set; `persona` is
    # the one selected first; `no_persona_url` when the portal has none (no Confirm then).
    ask_persona: bool = False
    personas: tuple[str, ...] = ()
    persona: str | None = None
    no_persona_url: str | None = None
    # An editable card (spec 072, designer 19/04: persona.add): its fields come from `args`, the
    # person edits them before Confirm; `sign_ins` are the credential names it may use.
    editable: bool = False
    args: dict[str, Any] = field(default_factory=dict)
    sign_ins: tuple[str, ...] = ()
    #: done persona.add: Undo removes the persona while no scan used it.
    undo_url: str | None = None
