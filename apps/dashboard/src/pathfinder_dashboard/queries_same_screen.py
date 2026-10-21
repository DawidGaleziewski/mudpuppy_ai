"""Same screen? (spec 039 T100, designer screen v2-14, UX-R34): pairs of page versions a person
answers "same screen?" for. Conflicts first: a person's label the model disagrees with (labelled
different, grouped as one screen; or labelled same, grouped apart). Then each screen's variants
against its first one, not yet labelled, least similar first. Answering posts to the chat
service (`POST /portals/{p}/model/label`); the next rebuild applies it. Read-only."""

from __future__ import annotations

import sqlite3
import struct
from dataclasses import dataclass

from .queries_change_detail import Differ, Side, differs_of, side_of
from .queries_changes import process_of_screens, rows_of

ANSWERS = ("same", "same_data", "different")
WORDS = {
    "same": "Same screen",
    "same_data": "Same, different data",
    "different": "Different screens",
}


def answer_of(label: str, nd_kind: str | None) -> str:
    """A stored label (design § 6.3) in the UI's three answers."""
    if label == "distinct":
        return "different"
    return "same_data" if nd_kind == "dynamic_data" else "same"


@dataclass(frozen=True)
class Version:
    state_id: str
    ordinal: int | None  # r1, r2… on its screen; None when no screen holds it
    screen_key: str | None
    screen_title: str | None


@dataclass(frozen=True)
class Label:
    answer: str  # same · same_data · different
    by: str
    at: str
    reason: str | None


@dataclass(frozen=True)
class Pair:
    a: Version
    b: Version
    similarity: float | None
    label: Label | None

    @property
    def model_same(self) -> bool:
        return self.a.screen_key is not None and self.a.screen_key == self.b.screen_key

    @property
    def conflict(self) -> bool:
        if self.label is None:
            return False
        return (self.label.answer == "different") == self.model_same

    @property
    def model_answer(self) -> str:
        return "same" if self.model_same else "different"


@dataclass(frozen=True)
class PairDetail:
    pair: Pair
    a: Side
    b: Side
    differs: list[Differ]
    process: tuple[str, str] | None
    position: int  # 1-based in the queue; 0 when not in it
    total: int
    next_pair: tuple[str, str] | None
    earlier: list[Label]  # answers the current label replaced, newest first (owner, 2026-10-21)


@dataclass(frozen=True)
class LabelEvent:
    """One answer for a pair of page versions, on a screen's History."""

    a: str  # r1, r2… or a short id
    b: str
    a_id: str
    b_id: str
    label: Label


HISTORY_SQL = (
    "SELECT state_a, state_b, label, nd_kind, labelled_by, labelled_at, reason"
    " FROM state_pair_label_history WHERE portal_id = ?"
)


def _label(r: sqlite3.Row) -> Label:
    answer = answer_of(r["label"], r["nd_kind"])
    return Label(answer, r["labelled_by"], r["labelled_at"], r["reason"])


def _earlier(conn: sqlite3.Connection, portal: str, a: str, b: str) -> list[Label]:
    rows = rows_of(
        conn,
        HISTORY_SQL + " AND state_a = ? AND state_b = ? ORDER BY labelled_at DESC, id DESC",
        (portal, a, b),
    )
    return [_label(r) for r in rows[1:]]


def screen_labels(conn: sqlite3.Connection, portal: str, screen_key: str) -> list[LabelEvent]:
    """Every answer about a pair with a page version of this screen, newest first."""
    versions = _versions(conn, portal)
    rows = rows_of(conn, HISTORY_SQL + " ORDER BY labelled_at DESC, id DESC", (portal,))
    return [
        LabelEvent(_name(va), _name(vb), r["state_a"], r["state_b"], _label(r))
        for r in rows
        if (va := versions.get(r["state_a"])) and (vb := versions.get(r["state_b"]))
        if screen_key in (va.screen_key, vb.screen_key)
    ]


VERSION_SQL = (
    "SELECT st.id, m.ordinal, ms.key, ms.title FROM states st"
    " LEFT JOIN screen_members m ON m.state_id = st.id AND m.to_model_version IS NULL"
    " LEFT JOIN model_screens ms ON ms.id = m.screen_id"
)


def _versions(conn: sqlite3.Connection, portal: str) -> dict[str, Version]:
    return {
        r["id"]: Version(r["id"], r["ordinal"], r["key"], r["title"])
        for r in rows_of(conn, VERSION_SQL + " WHERE st.portal_id = ?", (portal,))
    }


def _signatures(conn: sqlite3.Connection, ids: set[str]) -> dict[str, tuple[int, ...]]:
    if not ids:
        return {}
    marks = ",".join("?" * len(ids))
    rows = rows_of(
        conn,
        f"SELECT state_id, minhash FROM state_components WHERE state_id IN ({marks})",
        tuple(sorted(ids)),
    )
    return {r["state_id"]: struct.unpack(">128I", r["minhash"]) for r in rows}


def _similarity(sig: dict[str, tuple[int, ...]], a: str, b: str) -> float | None:
    """The share of equal MinHash positions (the crawler's `similarity`)."""
    if a not in sig or b not in sig:
        return None
    return sum(x == y for x, y in zip(sig[a], sig[b], strict=True)) / 128


def _labels(conn: sqlite3.Connection, portal: str) -> dict[tuple[str, str], Label]:
    return {
        (r["state_a"], r["state_b"]): Label(
            answer_of(r["label"], r["nd_kind"]), r["labelled_by"], r["labelled_at"], r["reason"]
        )
        for r in rows_of(
            conn,
            "SELECT state_a, state_b, label, nd_kind, labelled_by, labelled_at, reason"
            " FROM state_pair_labels WHERE portal_id = ? ORDER BY labelled_at",
            (portal,),
        )
    }


def _open_pairs(versions: dict[str, Version], screen: str | None) -> list[tuple[str, str]]:
    """Each screen's later variants against its first one (r1 · r2, r1 · r3…)."""
    by_screen: dict[str, list[Version]] = {}
    for v in versions.values():
        if v.screen_key and (screen is None or v.screen_key == screen):
            by_screen.setdefault(v.screen_key, []).append(v)
    out = []
    for members in by_screen.values():
        members.sort(key=lambda v: v.ordinal or 0)
        out += [tuple(sorted((members[0].state_id, m.state_id))) for m in members[1:]]
    return out  # type: ignore[return-value]


def queue(conn: sqlite3.Connection, portal: str, screen: str | None = None) -> list[Pair]:
    """Conflicts first, then the unlabelled pairs, least similar first. `screen` (SC-…) keeps the
    pairs with a version on that screen."""
    versions = _versions(conn, portal)
    labels = _labels(conn, portal)
    ids = [p for p in _open_pairs(versions, screen) if p not in labels]
    conflicts = [
        p
        for p, lab in labels.items()
        if p[0] in versions
        and p[1] in versions
        and (screen is None or screen in (versions[p[0]].screen_key, versions[p[1]].screen_key))
    ]
    sig = _signatures(conn, {s for p in [*ids, *conflicts] for s in p})
    pairs = [
        Pair(versions[a], versions[b], _similarity(sig, a, b), labels.get((a, b)))
        for a, b in [*conflicts, *ids]
    ]
    shown = [p for p in pairs if p.conflict or p.label is None]
    return sorted(shown, key=lambda p: (not p.conflict, p.similarity is None, p.similarity or 0))


def pair_detail(
    conn: sqlite3.Connection, portal: str, a: str, b: str, screen: str | None = None
) -> PairDetail | None:
    """One pair side by side with what differs; None when either version is not the portal's."""
    a, b = sorted((a, b))
    rows = {
        r["id"]: r
        for r in rows_of(
            conn,
            "SELECT id, title, route_template FROM states WHERE portal_id = ? AND id IN (?, ?)",
            (portal, a, b),
        )
    }
    if a == b or a not in rows or b not in rows:
        return None
    versions = _versions(conn, portal)
    sig = _signatures(conn, {a, b})
    pair = Pair(versions[a], versions[b], _similarity(sig, a, b), _labels(conn, portal).get((a, b)))
    side_a = side_of(conn, _name(pair.a), "", rows[a])
    side_b = side_of(conn, _name(pair.b), "", rows[b])
    q = [(p.a.state_id, p.b.state_id) for p in queue(conn, portal, screen)]
    pos = q.index((a, b)) + 1 if (a, b) in q else 0
    rest = [p for p in q if p != (a, b)]
    key = pair.a.screen_key or pair.b.screen_key
    return PairDetail(
        pair=pair,
        a=side_a,
        b=side_b,
        differs=differs_of(side_a, side_b),
        process=process_of_screens(conn, portal).get(key or ""),
        position=pos,
        total=len(q),
        next_pair=rest[pos - 1] if pos and pos - 1 < len(rest) else (rest[0] if rest else None),
        earlier=_earlier(conn, portal, a, b),
    )


def _name(v: Version) -> str:
    return f"r{v.ordinal}" if v.ordinal else v.state_id[:8]
