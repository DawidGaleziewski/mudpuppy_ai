"""The recorded screen's side (R-100, spec 071; spec 022 screen 08, spec 024): its to-be
amendments with their revisions and what they can be written on, and who reached it, which
elements depend on access and two personas side by side, as typed JSON."""

from __future__ import annotations

import sqlite3
from pathlib import Path

from pydantic import BaseModel

from . import queries_access, queries_chat, queries_revisions, visuals
from .models import AmendmentWithTarget, State
from .queries_app import StatusOut, status_out


class AmendmentRev(BaseModel):
    rev: int
    change: str
    text: str | None
    author: str
    created_at: str


class Amendment(BaseModel):
    id: str
    key: str
    rev: int
    status: StatusOut
    #: active · needs_reanchor · dismissed · withdrawn: what a person can do with it.
    state: str
    text: str | None
    author: str
    created_at: str
    attachment: str | None
    #: The element it is written on; None: the whole screen.
    element: str | None
    #: Another revision of the screen it is anchored to; None: this one.
    other_state: str | None
    history: list[AmendmentRev]
    #: Its place on this screenshot (an active amendment on an element of this revision).
    pin: visuals.Highlight | None


class Amendments(BaseModel):
    items: list[Amendment]
    #: (element key, readable label) the add form offers; empty: only the whole screen.
    elements: list[tuple[str, str]]


class Seen(BaseModel):
    persona: str
    state: str
    attributes: str | None
    complete: bool


class ElementDiff(BaseModel):
    key: str
    seen_by: list[str]
    not_seen_by: list[str]
    explained_by: list[str]


class Side(BaseModel):
    persona: str
    state: str
    shot: str | None
    attributes: str | None


class SideBySide(BaseModel):
    left: Side
    right: Side
    only_left: list[str]
    only_right: list[str]
    text_differs: list[tuple[str, str]]
    same: int


class Access(BaseModel):
    reached: list[Seen]
    not_reached: list[str]
    reach_explained_by: list[str]
    elements_total: int
    elements: list[ElementDiff]
    personas: list[str]
    side_by_side: SideBySide | None


def _amendment(
    a: AmendmentWithTarget,
    state_id: str,
    history: list[AmendmentRev],
    pin: visuals.Highlight | None,
) -> Amendment:
    sid, _, element = a.target_id.partition("#")
    return Amendment(
        id=a.id,
        key=a.key,
        rev=a.rev,
        status=status_out("amendment", a.status),
        state=a.status,
        text=a.text,
        author=a.author,
        created_at=a.created_at,
        attachment=a.attachment_name,
        element=element if a.target_kind == "wireframe_element" else None,
        other_state=sid if sid != state_id and a.target_kind != "evidence" else None,
        history=history,
        pin=pin,
    )


def amendments(
    conn: sqlite3.Connection, data_dir: Path, state: State, elements: list[visuals.Highlight]
) -> Amendments:
    """Every amendment of the screen (every revision, spec 022 T032); an active one on an element
    of this revision is pinned on the screenshot, numbered in key order."""
    boxes = {e.key: e for e in elements}
    out: list[Amendment] = []
    for a in queries_chat.amendments_for_screen(conn, state.portal_id, state.id, state.screen_id):
        sid, _, key = a.target_id.partition("#")
        box = (
            boxes.get(key)
            if a.status == "active" and a.target_kind == "wireframe_element" and sid == state.id
            else None
        )
        pin = (
            box.model_copy(update={"n": sum(1 for x in out if x.pin) + 1, "note": a.key})
            if box
            else None
        )
        history = [
            AmendmentRev(
                rev=h.rev,
                change=h.change.replace("_", " "),
                text=h.text,
                author=h.author,
                created_at=h.created_at,
            )
            for h in queries_revisions.amendment_history(conn, a.id)
        ]
        out.append(_amendment(a, state.id, history, pin))
    return Amendments(items=out, elements=queries_chat.state_elements(data_dir, state))


def _pair(
    access: queries_access.ScreenAccess, left: str | None, right: str | None
) -> tuple[str, str] | None:
    """The asked personas when both reached the screen and differ, else the first seer and first
    non-seer of the first differing element, else the first two."""
    personas = [v.persona_id for v in access.variants]
    if len(personas) < 2:
        return None
    if left and right and left in personas and right in personas and left != right:
        return left, right
    if access.elements:
        e = access.elements[0]
        return e.seen_by[0], e.not_seen_by[0]
    return personas[0], personas[1]


def _side_by_side(
    conn: sqlite3.Connection,
    access: queries_access.ScreenAccess,
    pair: tuple[str, str],
    attrs: dict[str, str],
) -> SideBySide:
    state_of = {v.persona_id: v.state_id for v in access.variants}
    left, right = state_of[pair[0]], state_of[pair[1]]
    shots = queries_access.screenshots(conn, [left, right])
    diff = queries_access.variant_diff(conn, left, right)

    def side(persona: str, state: str) -> Side:
        ref = shots.get(state)
        return Side(
            persona=persona,
            state=state,
            shot=f"/evidence/{ref}" if ref else None,
            attributes=attrs.get(persona),
        )

    return SideBySide(
        left=side(pair[0], left),
        right=side(pair[1], right),
        only_left=diff.only_left,
        only_right=diff.only_right,
        text_differs=[(t.left, t.right) for t in diff.text_differs],
        same=diff.same,
    )


def access(
    conn: sqlite3.Connection,
    state: State,
    attrs: dict[str, str],
    pick: tuple[str | None, str | None],
) -> Access | None:
    """Who reached the screen and what depends on access; None before a persona observed it or
    for a state not grouped into a screen yet."""
    if not state.screen_id:
        return None
    matrix = queries_access.access_matrix(conn, state.portal_id, state.screen_id)
    a = matrix.screens[0] if matrix.screens else None
    if a is None:
        return None
    pair = _pair(a, *pick)
    return Access(
        reached=[
            Seen(
                persona=v.persona_id,
                state=v.state_id,
                attributes=attrs.get(v.persona_id),
                complete=v.complete_map_run,
            )
            for v in a.variants
        ],
        not_reached=a.not_reached,
        reach_explained_by=a.reach_explained_by,
        elements_total=a.elements_total,
        elements=[
            ElementDiff(
                key=e.key, seen_by=e.seen_by, not_seen_by=e.not_seen_by, explained_by=e.explained_by
            )
            for e in a.elements
        ],
        personas=[v.persona_id for v in a.variants],
        side_by_side=_side_by_side(conn, a, pair, attrs) if pair else None,
    )
