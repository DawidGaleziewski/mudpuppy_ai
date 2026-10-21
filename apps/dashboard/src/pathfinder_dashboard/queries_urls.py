"""Entry URLs and the parameter inventory of a state (spec 019, R-37/R-38), from `observations`.

The same read model as `@pathfinder/docs` `parameterInventory` (TypeScript); both are tested on
`apps/crawler/tests/fixtures/params/param-inventory.json`, so the dashboard and the BA see the same
inventory. Nothing is normalised away: session ids, tracking parameters and repeats all count.
"""

from __future__ import annotations

import json
import sqlite3
from dataclasses import dataclass, field
from typing import Any
from urllib.parse import unquote, unquote_plus, urlsplit

MAX_VALUES = 20
MAX_ENTRY_URLS = 50


@dataclass
class UrlParam:
    name: str
    value: str | None
    where: str  # 'path' | 'query' | 'fragment_query'


def _pair(piece: str, plus_is_space: bool) -> tuple[str, str | None]:
    decode = unquote_plus if plus_is_space else unquote
    if "=" not in piece:
        return decode(piece), None
    name, value = piece.split("=", 1)
    return decode(name), decode(value)


def parse_url_params(url: str) -> list[UrlParam]:
    """Path parameters, then the query, then a hash route's query, as written."""
    try:
        parts = urlsplit(url)
    except ValueError:
        return []
    out: list[UrlParam] = []
    for segment in parts.path.split("/"):
        for p in segment.split(";")[1:]:
            if p:
                out.append(UrlParam(*_pair(p, False), "path"))
    for p in parts.query.split("&"):
        if p:
            out.append(UrlParam(*_pair(p, True), "query"))
    frag = parts.fragment
    if "?" in frag:
        for p in frag.split("?", 1)[1].split("&"):
            if p:
                out.append(UrlParam(*_pair(p, True), "fragment_query"))
    return out


@dataclass
class EntryUrl:
    url: str
    visits: int = 0
    via: list[str] = field(default_factory=list)
    hop_kinds: list[str] = field(default_factory=list)
    # The hops of the latest visit under this URL, for display (not in the TypeScript model).
    last_hops: list[dict[str, Any]] = field(default_factory=list)


@dataclass
class ParamEntry:
    name: str
    where: str
    visits: int = 0
    values: list[str | None] = field(default_factory=list)
    distinct: int = 0
    set_by: list[dict[str, Any]] = field(default_factory=list)


@dataclass
class StateUrls:
    state_id: str
    entry_urls: list[EntryUrl]
    entry_urls_more: int
    params: list[ParamEntry]


def _arrival_hop(hops: list[dict[str, Any]]) -> str:
    for h in reversed(hops):
        if h["kind"] not in ("start", "blocked"):
            return str(h["kind"])
    return "navigate"


# (location, name) -> the entry and the value keys seen so far
ParamAcc = dict[tuple[str, str], tuple[ParamEntry, set[str]]]


def _add_params(acc: ParamAcc, v: dict[str, Any]) -> None:
    counted: set[tuple[str, str]] = set()
    for p in parse_url_params(v["url"]):
        key = (p.where, p.name)
        if key not in acc:
            acc[key] = (ParamEntry(p.name, p.where), set())
        entry, seen = acc[key]
        if key not in counted:
            entry.visits += 1
            counted.add(key)
        value_key = "\0null" if p.value is None else p.value
        if value_key in seen:
            continue
        seen.add(value_key)
        entry.distinct += 1
        if len(entry.values) < MAX_VALUES:
            entry.values.append(p.value)
        by = {"transition_id": v["transition_id"], "hop": _arrival_hop(v["hops"])}
        if by not in entry.set_by:
            entry.set_by.append(by)


def inventory(visits: list[dict[str, Any]]) -> list[StateUrls]:
    """Per state, in first-visit order: entry URLs and parameters (see the module docstring)."""
    states: dict[str, tuple[dict[str, EntryUrl], ParamAcc]] = {}
    for v in visits:
        entries, params = states.setdefault(v["state_id"], ({}, {}))
        e = entries.setdefault(v["url"], EntryUrl(v["url"]))
        e.visits += 1
        e.last_hops = v["hops"]
        if v["via"] not in e.via:
            e.via.append(v["via"])
        for h in v["hops"]:
            if h["kind"] != "start" and h["kind"] not in e.hop_kinds:
                e.hop_kinds.append(h["kind"])
        _add_params(params, v)
    return [
        StateUrls(
            state_id,
            list(entries.values())[:MAX_ENTRY_URLS],
            max(0, len(entries) - MAX_ENTRY_URLS),
            [entry for entry, _ in params.values()],
        )
        for state_id, (entries, params) in states.items()
    ]


def state_visits(conn: sqlite3.Connection, state_id: str) -> list[dict[str, Any]]:
    """Every recorded visit of a state, oldest first; `[]` on a store from before 0012."""
    try:
        rows = conn.execute(
            "SELECT id, state_id, transition_id, via, url, hops_json FROM observations"
            " WHERE state_id = ? ORDER BY created_at, rowid",
            (state_id,),
        ).fetchall()
    except sqlite3.OperationalError:  # no observations table: a store older than spec 019
        return []
    return [
        {
            "id": r["id"],
            "state_id": r["state_id"],
            "transition_id": r["transition_id"],
            "via": r["via"],
            "url": r["url"],
            "hops": json.loads(r["hops_json"]),
        }
        for r in rows
    ]


def state_urls(conn: sqlite3.Connection, state_id: str) -> StateUrls | None:
    found = inventory(state_visits(conn, state_id))
    return found[0] if found else None
