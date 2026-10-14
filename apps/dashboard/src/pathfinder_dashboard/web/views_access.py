"""What the access views need (spec 024 US2): the matrix page and the screen page's Access tab,
built once for page and fragment from the read model `queries_access`."""

from __future__ import annotations

import sqlite3
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
    rows = queries_settings.persona_rows(web.settings.personas_dir, portal)
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
    return {
        "access": matrix.screens[0] if matrix.screens else None,
        "attrs": persona_attributes(web, state.portal_id),
        "self_url": c.url(f"/fragments/states/{state.id}/access"),
        "state_id": state.id,
    }
