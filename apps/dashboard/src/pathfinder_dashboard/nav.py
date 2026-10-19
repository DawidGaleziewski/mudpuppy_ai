"""The side nav's seven portal sections (spec 022 FE-N03, wireframe 01-IA).

Each section points at the page that holds it today; later milestones repoint a section when its
redesigned page lands (Processes M5; Screens and Review landed in M4). `pages` lists the Console
page keys (`nav_current` in the templates) that belong to the section, so the current one is
marked.
"""

from __future__ import annotations

from collections.abc import Callable
from typing import NamedTuple


class Section(NamedTuple):
    key: str
    label: str
    href: Callable[[str | None], str | None]  # portal → path, None when it needs a portal
    pages: frozenset[str]


def _settings(portal: str | None) -> str | None:
    return f"/portals/{portal}/settings" if portal else None


SECTIONS: tuple[Section, ...] = (
    Section("home", "Home", lambda p: "/", frozenset({"home", "overview", "chat"})),
    Section("processes", "Processes", lambda p: "/processes", frozenset({"processes"})),
    Section("screens", "Screens", lambda p: "/screens", frozenset({"screens", "state", "access"})),
    Section("docs", "Docs", lambda p: f"/docs/{p}" if p else "/docs", frozenset({"docs"})),
    Section(
        "review", "Review", lambda p: "/review", frozenset({"review", "amendments", "changes"})
    ),
    Section("scans", "Scans", lambda p: "/scans", frozenset({"scans", "activity", "run"})),
    Section("settings", "Settings", _settings, frozenset({"settings", "portals"})),
)


def href_of(key: str, portal: str | None) -> str | None:
    """The path of section `key` for `portal`; None when the section needs a portal."""
    return next(s.href(portal) for s in SECTIONS if s.key == key)


def current_section(page: str | None) -> str:
    for s in SECTIONS:
        if page in s.pages:
            return s.key
    return "home"
