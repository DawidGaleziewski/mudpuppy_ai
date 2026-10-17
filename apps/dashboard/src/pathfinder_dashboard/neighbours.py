"""Prev / Next on detail pages (R-71 (b), spec 034 FR-022, A-8).

A list links each row with `list=<the list's path and query>`; the detail page reads it back,
rebuilds the same list (same filter, same order, every page) and links the item before and after
the current one, passing the same `list` on, so the owner walks a filtered list without going
back to it. Only known lists are rebuilt; anything else gives no Prev / Next.
"""

from __future__ import annotations

import re
import sqlite3
from collections.abc import Callable, Container
from dataclasses import dataclass
from urllib.parse import parse_qs, urlsplit

from . import queries, queries_docs, queries_screens


@dataclass(frozen=True)
class Neighbours:
    position: int
    total: int
    list_url: str
    list_label: str
    prev_url: str | None
    next_url: str | None


@dataclass(frozen=True)
class OrderedList:
    label: str
    ids: list[str]
    detail_path: Callable[[str], str]


DOCS_LIST = re.compile(r"^/docs/(?P<portal>[a-z0-9][a-z0-9_-]{0,63})$")
RUN_LIST = re.compile(r"^/runs/(?P<run>[0-9a-f-]{8,64})$")


def _first(params: dict[str, list[str]], name: str) -> str | None:
    values = params.get(name)
    return values[0] if values else None


def _screens(
    conn: sqlite3.Connection, portal: str | None, params: dict[str, list[str]]
) -> OrderedList:
    ids = queries_screens.screen_ids(conn, portal, _first(params, "q"))
    return OrderedList("Screens", ids, lambda i: f"/states/{i}")


def _docs(
    conn: sqlite3.Connection, portal: str, params: dict[str, list[str]]
) -> OrderedList | None:
    section = _first(params, "section") or "overview"
    kinds = queries_docs.SECTION_KINDS.get(section)
    if not kinds or section in ("overview", "traceability"):
        return None
    label = next(lbl for sid, lbl, _ in queries_docs.DOC_SECTIONS if sid == section)

    def pick(name: str, allowed: Container[str]) -> str | None:
        value = _first(params, name)
        return value if value is not None and value in allowed else None

    keys = queries_docs.record_keys(
        conn,
        portal,
        kinds,
        kind=pick("kind", kinds),
        status=pick("status", queries_docs.DOC_STATUSES),
        confidence=pick("confidence", queries_docs.CONFIDENCES),
        flag=pick("flag", dict(queries_docs.FLAGS)),
    )
    return OrderedList(label, keys, lambda k: f"/docs/{portal}/{k}")


def _run_states(
    conn: sqlite3.Connection, run_id: str, params: dict[str, list[str]]
) -> OrderedList | None:
    if _first(params, "tab") != "states":
        return None
    ids = [s.id for s in queries.run_states(conn, run_id)]
    return OrderedList(f"States of scan {run_id[:8]}", ids, lambda i: f"/states/{i}")


def ordered_list(conn: sqlite3.Connection, portal: str | None, list_url: str) -> OrderedList | None:
    """The list a `list=` value names, rebuilt, or None for an unknown or unsafe one."""
    if not list_url.startswith("/") or list_url.startswith("//"):
        return None
    parts = urlsplit(list_url)
    params = parse_qs(parts.query)
    if parts.path == "/screens":
        return _screens(conn, portal, params)
    if m := DOCS_LIST.match(parts.path):
        return _docs(conn, m["portal"], params)
    if m := RUN_LIST.match(parts.path):
        return _run_states(conn, m["run"], params)
    return None


def neighbours(
    conn: sqlite3.Connection,
    portal: str | None,
    list_url: str | None,
    current: str,
    url: Callable[..., str],
) -> Neighbours | None:
    """Prev / Next for `current` in the list `list_url`; `url` is `Ctx.url` (keeps the store)."""
    if not list_url:
        return None
    found = ordered_list(conn, portal, list_url)
    if found is None or current not in found.ids:
        return None
    i = found.ids.index(current)

    def link(j: int) -> str | None:
        if j < 0 or j >= len(found.ids):
            return None
        return url(found.detail_path(found.ids[j]), list=list_url)

    return Neighbours(
        position=i + 1,
        total=len(found.ids),
        list_url=list_url,
        list_label=found.label,
        prev_url=link(i - 1),
        next_url=link(i + 1),
    )
