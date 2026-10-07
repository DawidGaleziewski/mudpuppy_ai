"""Live map of a run for the chat side panel (spec 010 T049, F-22 item 2).

Pages the run observed and the moves between them, as Mermaid source. Pages first seen in the
last minute are marked ``fresh``, the page the crawler last reached ``current``; app.css colours
both. Not part of the Docs diagrams in ``diagrams.py`` (those are byte-identical twins of the
TS exporter); only its escaping helpers are shared.
"""

from __future__ import annotations

import hashlib
import sqlite3
from dataclasses import dataclass
from datetime import datetime, timedelta

from .diagrams import label, node_id

FRESH = timedelta(seconds=60)
# Beyond this the map is unreadable in a side panel; the newest pages are kept.
MAX_PAGES = 60
# Link names on the arrows are cut to this many characters.
MAX_LABEL = 16


@dataclass(frozen=True)
class LiveMap:
    source: str
    version: str  # changes when the drawing changes; the poll answers 204 while it is the same
    pages: int  # pages the run observed
    shown: int  # pages drawn (at most MAX_PAGES)


def _parse(iso: str) -> datetime:
    return datetime.fromisoformat(iso.replace("Z", "+00:00"))


def run_map(conn: sqlite3.Connection, run_id: str, now: datetime) -> LiveMap | None:
    """None when the run observed no page yet."""
    try:
        pages = conn.execute(
            "SELECT s.id, s.route_template, so.observed_at FROM state_observations so"
            " JOIN states s ON s.id = so.state_id WHERE so.run_id = ?"
            " ORDER BY so.observed_at DESC, s.id LIMIT ?",
            (run_id, MAX_PAGES),
        ).fetchall()
        total = conn.execute(
            "SELECT count(*) FROM state_observations WHERE run_id = ?", (run_id,)
        ).fetchone()[0]
        # The discovery tree: for each page, the move that reached it first. All moves make a
        # hairball (every page links to every footer page), the tree shows how the scan spread.
        moves = conn.execute(
            "SELECT from_state, to_state, label FROM ("
            "  SELECT from_state, to_state,"
            "         json_extract(action_json, '$.accessible_name') AS label,"
            "         row_number() OVER (PARTITION BY to_state ORDER BY created_at, id) AS n"
            "    FROM edges WHERE run_id = ? AND status = 'executed'"
            "     AND to_state IS NOT NULL AND to_state != from_state"
            ") WHERE n = 1 ORDER BY to_state",
            (run_id,),
        ).fetchall()
        last = conn.execute(
            "SELECT to_state FROM edges WHERE run_id = ? AND to_state IS NOT NULL"
            " ORDER BY created_at DESC, id DESC LIMIT 1",
            (run_id,),
        ).fetchone()
    except sqlite3.OperationalError:
        return None
    if not pages:
        return None
    pages = sorted(pages, key=lambda p: (p["observed_at"], p["id"]))  # oldest first: stable layout
    shown = {p["id"] for p in pages}
    # Natural size in the panel's scroll box (Mermaid otherwise shrinks it to the panel width);
    # left to right: a scan's tree is wide and shallow (most pages hang off the home page), so
    # its children stack in a column that fits the tall side panel.
    lines = [
        '%%{init: {"themeVariables": {"fontSize": "11px"}, "flowchart":'
        ' {"useMaxWidth": false, "nodeSpacing": 16, "rankSpacing": 28, "padding": 6}}}%%',
        "flowchart LR",
    ]
    for p in pages:
        lines.append(f'  {node_id("s_" + p["id"])}["{label(p["route_template"])}"]')
    for m in moves:
        if m["from_state"] in shown and m["to_state"] in shown:
            name = m["label"] or ""
            name = name if len(name) <= MAX_LABEL else name[: MAX_LABEL - 1] + "…"
            arrow = f'-->|"{label(name)}"|' if name else "-->"
            frm, to = node_id("s_" + m["from_state"]), node_id("s_" + m["to_state"])
            lines.append(f"  {frm} {arrow} {to}")
    fresh = [node_id("s_" + p["id"]) for p in pages if now - _parse(p["observed_at"]) < FRESH]
    current = last["to_state"] if last and last["to_state"] in shown else None
    lines.append("  classDef fresh stroke-width:2px")
    lines.append("  classDef current stroke-width:3px")
    if fresh:
        lines.append(f"  class {','.join(fresh)} fresh")
    if current:
        lines.append(f"  class {node_id('s_' + current)} current")
    source = "\n".join(lines) + "\n"
    version = hashlib.sha1(source.encode()).hexdigest()[:12]
    return LiveMap(source, version, total, len(pages))
