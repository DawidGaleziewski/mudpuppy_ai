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


LABEL_WINDOW = 0.05  # the crawler's MODEL_DEFAULTS.labelWindow (`pnpm model:pairs`)
NEAR_LIMIT = 20  # pairs near τ asked per page load, as `pnpm model:pairs` lists them


def tau_in_force(conn: sqlite3.Connection, portal: str) -> float | None:
    """The accepted τ of the latest fingerprint profile, else the latest model version's."""
    rows = rows_of(
        conn,
        "SELECT v.threshold, (SELECT a.tau FROM tau_acceptances a WHERE a.portal_id = v.portal_id"
        "   AND a.profile IS v.fingerprint_profile ORDER BY a.accepted_at DESC, a.id DESC LIMIT 1)"
        " AS accepted FROM model_versions v WHERE v.portal_id = ? ORDER BY v.seq DESC LIMIT 1",
        (portal,),
    )
    if not rows:
        return None
    return float(rows[0]["accepted"] if rows[0]["accepted"] is not None else rows[0]["threshold"])


def _near_tau(
    conn: sqlite3.Connection,
    portal: str,
    tau: float,
    versions: dict[str, Version],
    screen: str | None,
) -> list[tuple[str, str]]:
    """Spec 040 T022 (F-53): pairs of page versions on one route whose similarity is within the
    window around τ, nearest first: the answers that move τ most."""
    routes: dict[str, list[str]] = {}
    for r in rows_of(conn, "SELECT id, route_template FROM states WHERE portal_id = ?", (portal,)):
        routes.setdefault(r["route_template"], []).append(r["id"])
    sig = _signatures(conn, set(versions))
    near = []
    for ids in routes.values():
        ids = sorted(i for i in ids if i in sig)
        for i, a in enumerate(ids):
            for b in ids[i + 1 :]:
                s = _similarity(sig, a, b)
                keys = (versions[a].screen_key, versions[b].screen_key)
                if s is not None and abs(s - tau) <= LABEL_WINDOW and screen in (None, *keys):
                    near.append((abs(s - tau), a, b))
    return [(a, b) for _, a, b in sorted(near)[:NEAR_LIMIT]]


def queue(conn: sqlite3.Connection, portal: str, screen: str | None = None) -> list[Pair]:
    """Conflicts first, then the unlabelled pairs nearest τ (the window `pnpm model:pairs` uses),
    then each screen's variants against its first, least similar first. `screen` (SC-…) keeps the
    pairs with a version on that screen."""
    versions = _versions(conn, portal)
    labels = _labels(conn, portal)
    tau = tau_in_force(conn, portal)
    near = _near_tau(conn, portal, tau, versions, screen) if tau is not None else []
    ids = [p for p in dict.fromkeys([*near, *_open_pairs(versions, screen)]) if p not in labels]
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
    rank = {pair: i for i, pair in enumerate(near)}

    def order(p: Pair) -> tuple[bool, int, bool, float]:
        at = rank.get((p.a.state_id, p.b.state_id), len(rank))
        return (not p.conflict, at, p.similarity is None, p.similarity or 0)

    return sorted(shown, key=order)


# Findings that say a new page version is a variant of its screen (12-v2-ux § 5.5): confirming
# one also answers the version's open Same screen? pairs as "Same screen".
VARIANT_KINDS = ("structural_drift", "context_variant", "ab_test")


def linked(conn: sqlite3.Connection, portal: str, deviation_id: str) -> list[Pair]:
    """Spec 040 T023, Also settles: the Same screen? pairs (conflicts and open ones) of the page
    version a variant finding is about; none for other findings."""
    rows = rows_of(
        conn,
        "SELECT d.state_id FROM deviations d JOIN hypotheses h ON h.deviation_id = d.id"
        f" WHERE d.portal_id = ? AND d.id = ? AND h.kind IN ({','.join('?' * len(VARIANT_KINDS))})",
        (portal, deviation_id, *VARIANT_KINDS),
    )
    state = rows[0]["state_id"] if rows else None
    if not state:
        return []
    return [p for p in queue(conn, portal) if state in (p.a.state_id, p.b.state_id)]


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
