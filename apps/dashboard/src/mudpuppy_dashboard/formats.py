"""How the console writes a duration, a timestamp, a short id, JSON and an action's locator and
link, for the console's API (specs 054, 055)."""

from __future__ import annotations

import json
from typing import Any


def short_id(value: str, keep: int = 13) -> str:
    """`01a0da64-3bf1-7000-…` → `01a0da64-3bf1…`: enough to tell UUIDv7 runs apart at a glance."""
    return value if len(value) <= keep + 1 else value[:keep] + "…"


def jget(value: Any, key: str) -> Any:
    """`value[key]` for a parsed JSON object, None for any other shape."""
    return value.get(key) if isinstance(value, dict) else None


def top_locator(value: Any) -> str | None:
    """The rank-0 locator of an action descriptor (what QA would use first)."""
    locators = jget(value, "locators")
    if isinstance(locators, list) and locators and isinstance(locators[0], dict):
        best = min(locators, key=lambda loc: loc.get("rank", 99) if isinstance(loc, dict) else 99)
        return str(best.get("value")) if isinstance(best, dict) else None
    return None


def pretty_json(value: Any) -> str:
    if isinstance(value, str):
        return value
    return json.dumps(value, indent=2, ensure_ascii=False, sort_keys=True)


def fmt_duration(ms: int | None) -> str:
    if ms is None:
        return "—"
    seconds = ms // 1000
    if seconds < 60:
        return f"{seconds}s" if seconds else f"{ms}ms"
    minutes, seconds = divmod(seconds, 60)
    if minutes < 60:
        return f"{minutes}m {seconds:02d}s"
    hours, minutes = divmod(minutes, 60)
    return f"{hours}h {minutes:02d}m"


def fmt_when(iso: str | None) -> str:
    """`2026-09-25T19:44:01.776Z` → `2026-09-25 19:44:01Z` (UTC, as stored)."""
    if not iso:
        return "—"
    return iso.replace("T", " ")[:19] + "Z"
