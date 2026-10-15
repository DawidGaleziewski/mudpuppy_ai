"""What the access views need (spec 024 US2): the matrix page and the screen page's Access tab,
built once for page and fragment from the read model `queries_access`."""

from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import Any

from .. import queries_access, queries_settings
from .deps import Ctx, Web


def attributes_line(attributes: dict[str, Any]) -> str:
    """`tariff: basic · features: export, share`; attributes as written, never interpreted."""
    parts = []
    for key, value in attributes.items():
        shown = ", ".join(str(v) for v in value) if isinstance(value, list) else str(value)
        parts.append(f"{key}: {shown}")
    return " · ".join(parts)


def persona_attributes(web: Web, portal: str) -> dict[str, str]:
    """persona id → its attributes line; personas without attributes are left out."""
    return attributes_by_persona(web.settings.personas_dir, portal)


def attributes_by_persona(personas_dir: Path, portal: str) -> dict[str, str]:
    rows = queries_settings.persona_rows(personas_dir, portal)
    return {r.id: attributes_line(r.attributes) for r in rows if r.attributes}


def matrix_values(web: Web, c: Ctx, conn: sqlite3.Connection) -> dict[str, Any]:
    """The portal's matrix; no portal chosen → an empty view with `portal` None."""
    portal = c.portal
    if not portal:
        return {"portal": None, "personas": [], "rows": [], "attrs": {}}
    matrix = queries_access.access_matrix(conn, portal)
    rows = []
    for s in matrix.screens:
        by_persona = {v.persona_id: v for v in s.variants}
        rows.append(
            {
                "screen": s,
                "cells": [by_persona.get(p) for p in matrix.personas],
                "open": s.variants[0].state_id if s.variants else None,
            }
        )
    return {
        "portal": portal,
        "personas": matrix.personas,
        "rows": rows,
        "attrs": persona_attributes(web, portal),
        "self_url": c.url("/fragments/access"),
    }


def screen_values(web: Web, c: Ctx, conn: sqlite3.Connection, state: Any) -> dict[str, Any] | None:
    """The Access tab of a screen page; None for a state not grouped into a screen yet."""
    if not state.screen_id:
        return None
    matrix = queries_access.access_matrix(conn, state.portal_id, state.screen_id)
    access = matrix.screens[0] if matrix.screens else None
    q = c.request.query_params
    pair = _pair(access, q.get("left"), q.get("right")) if access else None
    return {
        "access": access,
        "attrs": persona_attributes(web, state.portal_id),
        "portal": state.portal_id,
        "self_url": c.url(f"/fragments/states/{state.id}/access", **(pair or {})),
        "state_id": state.id,
        "side_by_side": _side_by_side(conn, access, pair) if pair else None,
    }


def _pair(access: Any, left: str | None, right: str | None) -> dict[str, str] | None:
    """The two personas to compare: the asked ones when both reached the screen and differ, else
    the first seer and first non-seer of the first differing element, else the first two."""
    personas = [v.persona_id for v in access.variants]
    if len(personas) < 2:
        return None
    if left in personas and right in personas and left != right:
        return {"left": left, "right": right}
    if access.elements:
        e = access.elements[0]
        return {"left": e.seen_by[0], "right": e.not_seen_by[0]}
    return {"left": personas[0], "right": personas[1]}


def _side_by_side(conn: sqlite3.Connection, access: Any, pair: dict[str, str]) -> dict[str, Any]:
    state_of = {v.persona_id: v.state_id for v in access.variants}
    left, right = state_of[pair["left"]], state_of[pair["right"]]
    return {
        **pair,
        "left_state": left,
        "right_state": right,
        "shots": queries_access.screenshots(conn, [left, right]),
        "diff": queries_access.variant_diff(conn, left, right),
    }
