"""Release lanes (spec 039 T100, designer screens v2-01 / v2-02, 12-v2-ux.md § 2): each portal
part's releases as the latest model version's build epochs (a release = one build of one scope,
from its first to its last observation), the scans under them, and a range bracket. Releases are
known from scans only (owner answer 17: no release watch). Read-only."""

from __future__ import annotations

import sqlite3
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any


@dataclass(frozen=True)
class Span:
    name: str  # the release's short name: a marker's value, or a build hash's first 4 characters
    left: float  # percent of the track
    width: float
    start: str
    end: str
    current: bool
    rollout: bool  # old and new served together (the span covers only the overlap)


@dataclass(frozen=True)
class Lane:
    name: str
    scope: str
    spans: list[Span]
    marker: bool  # False: builds told apart by asset hashes, or unknown


@dataclass(frozen=True)
class ScanMark:
    id: str
    left: float
    started_at: str
    status: str
    check: bool  # a check run (probe mode, no AI)


@dataclass(frozen=True)
class Timeline:
    lanes: list[Lane]
    scans: list[ScanMark]
    axis: list[tuple[float, str]]
    start: str
    end: str
    range_left: float | None = None
    range_width: float | None = None


def _rows(conn: sqlite3.Connection, sql: str, args: tuple[Any, ...]) -> list[sqlite3.Row]:
    try:
        return conn.execute(sql, args).fetchall()
    except sqlite3.OperationalError:
        return []  # a store before migration 0030


def _at(ts: str) -> datetime:
    t = datetime.fromisoformat(ts)
    return t if t.tzinfo else t.replace(tzinfo=UTC)


def release_name(signature: str) -> str:
    """`marker:9c21` → `9c21`; a sha256 → its first 4 characters; `unknown` stays."""
    if signature.startswith("marker:"):
        return signature.removeprefix("marker:")
    return signature if signature == "unknown" else signature[:4]


def part_name(scope: str) -> str:
    """The portal part in the UI's words (12-v2-ux.md § 3)."""
    if scope == "shell":
        return "Shell"
    kind, _, rest = scope.partition(":")
    return {"mfe": f"App {rest}", "frame": f"Frame {rest}"}.get(kind, scope)


def _epochs(conn: sqlite3.Connection, portal: str) -> list[sqlite3.Row]:
    return _rows(
        conn,
        "SELECT e.scope, e.overlaps_previous, b.signature, b.source,"
        "  fo.created_at AS start, lo.created_at AS end"
        " FROM build_epochs e JOIN builds b ON b.id = e.build_id"
        " JOIN observations fo ON fo.id = e.first_observation_id"
        " JOIN observations lo ON lo.id = e.last_observation_id"
        " WHERE e.portal_id = ? AND e.model_version_id = (SELECT id FROM model_versions"
        "   WHERE portal_id = ? ORDER BY seq DESC LIMIT 1)"
        " ORDER BY e.scope, fo.created_at",
        (portal, portal),
    )


def _lanes(epochs: list[sqlite3.Row], pos: Any) -> list[Lane]:
    by_scope: dict[str, list[sqlite3.Row]] = {}
    for e in epochs:
        by_scope.setdefault(e["scope"], []).append(e)
    lanes = []
    for scope, rows in sorted(by_scope.items(), key=lambda kv: (kv[0] != "shell", kv[0])):
        spans: list[Span] = []
        for i, e in enumerate(rows):
            start = e["start"]
            if e["overlaps_previous"] and i:
                prev_end = rows[i - 1]["end"]
                spans.append(_span("both", (start, prev_end), pos, current=False, rollout=True))
                start = max(start, prev_end)
            last = i == len(rows) - 1
            name = release_name(e["signature"])
            spans.append(_span(name, (start, e["end"]), pos, current=last, rollout=False))
        lanes.append(
            Lane(part_name(scope), scope, spans, any(r["source"] == "marker" for r in rows))
        )
    return lanes


def _span(name: str, period: tuple[str, str], pos: Any, *, current: bool, rollout: bool) -> Span:
    start, end = period
    left = pos(start)
    return Span(name, left, max(pos(end) - left, 0.8), start, end, current, rollout)


def timeline(
    conn: sqlite3.Connection,
    portal: str,
    range_from: str | None = None,
    range_to: str | None = None,
) -> Timeline | None:
    """The portal's release lanes and scans; None when it has no scans. `range_from` /
    `range_to` (timestamps) draw the bracket."""
    epochs = _epochs(conn, portal)
    runs = _rows(
        conn,
        "SELECT id, started_at, status, mode FROM runs WHERE portal_id = ? ORDER BY started_at",
        (portal,),
    )
    stamps = [*(e["start"] for e in epochs), *(e["end"] for e in epochs)]
    times = [_at(t) for t in [*stamps, *(r["started_at"] for r in runs)]]
    if not times:
        return None
    t0, t1 = min(times), max(times)
    total = (t1 - t0).total_seconds() or 1.0

    def pos(ts: str) -> float:
        return round(min(max((_at(ts) - t0).total_seconds() / total, 0.0), 1.0) * 100, 2)

    ticks = [t0 + (t1 - t0) * (i / 4) for i in range(5)]
    short = (t1 - t0).total_seconds() < 2 * 86400  # within two days the dates repeat: show times
    axis = [
        (i * 25.0, f"{t:%H:%M}Z" if short and i else f"{t.day} {t:%b}") for i, t in enumerate(ticks)
    ]
    left = pos(range_from) if range_from else 0.0
    right = pos(range_to) if range_to else 100.0
    return Timeline(
        lanes=_lanes(epochs, pos),
        scans=[
            ScanMark(
                r["id"], pos(r["started_at"]), r["started_at"], r["status"], r["mode"] == "probe"
            )
            for r in runs
        ],
        axis=axis,
        start=t0.isoformat(),
        end=t1.isoformat(),
        range_left=left,
        range_width=round(max(right - left, 0.8), 2),
    )
