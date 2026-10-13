"""Which pages render in Salvage Yard (spec 022 FR-002).

`PATHFINDER_UI_SALVAGE` is "all" or a comma-separated list of page names. A page name is a
template path without ".html" (`overview`, `run_detail`, `partials/runs_table`). A page that is
on renders its twin under `salvage/` when the twin exists, so one page never loads both
stylesheets; a page without a twin keeps its Console template.
"""

from __future__ import annotations

from collections.abc import Callable

SALVAGE_DIR = "salvage/"


def page_name(template: str) -> str:
    return template.removesuffix(".html")


def salvage_on(flag: str, template: str) -> bool:
    names = {n.strip() for n in flag.split(",") if n.strip()}
    return "all" in names or page_name(template) in names


def pick_template(flag: str, template: str, exists: Callable[[str], bool]) -> str:
    """The template to render: the `salvage/` twin when the flag covers it and it exists."""
    if template.startswith(SALVAGE_DIR) or not salvage_on(flag, template):
        return template
    twin = SALVAGE_DIR + template
    return twin if exists(twin) else template
