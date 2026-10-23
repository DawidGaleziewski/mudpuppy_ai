"""Prev / Next on a documentation record (R-71 (b), spec 034 FR-022, A-8).

A Docs list links each record with `list=<the list's key>` (`/docs/<portal>?section=…&…`); the
record reads it back, rebuilds the same list (same filter, same order, every page) and links the
record before and after the current one, passing the same `list` on, so the owner walks a
filtered list without going back to it. Only known lists are rebuilt; anything else gives no
Prev / Next.
"""

from __future__ import annotations

import re
import sqlite3
from collections.abc import Container
from dataclasses import dataclass
from urllib.parse import parse_qs, urlsplit

from . import queries_docs


@dataclass(frozen=True)
class OrderedList:
    label: str
    ids: list[str]


DOCS_LIST = re.compile(r"^/docs/(?P<portal>[a-z0-9][a-z0-9_-]{0,63})$")


def _first(params: dict[str, list[str]], name: str) -> str | None:
    values = params.get(name)
    return values[0] if values else None


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
    return OrderedList(label, keys)


def ordered_list(conn: sqlite3.Connection, portal: str | None, list_url: str) -> OrderedList | None:
    """The list a `list=` value names, rebuilt, or None for an unknown or unsafe one."""
    if not list_url.startswith("/") or list_url.startswith("//"):
        return None
    parts = urlsplit(list_url)
    if m := DOCS_LIST.match(parts.path):
        return _docs(conn, m["portal"], parse_qs(parts.query))
    return None
