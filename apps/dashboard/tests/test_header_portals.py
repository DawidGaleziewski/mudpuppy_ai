"""The header's portal list by environment (R-94 (8), F-18 (b) of spec 043, owner 2026-10-22)."""

from __future__ import annotations

import sqlite3
from pathlib import Path

from mudpuppy_dashboard.queries_chat import portals_by_environment


def _portal(root: Path, name: str, env: str) -> None:
    (root / name).mkdir(parents=True)
    (root / name / "portal.yaml").write_text(f"id: {name}\nenvironment: {env}\n", encoding="utf-8")


def test_this_stores_portals_first_the_other_environments_apart(tmp_path: Path) -> None:
    portals = tmp_path / "portals"
    _portal(portals, "shop-local", "local-dev")
    _portal(portals, "shop", "sandbox")
    _portal(portals, "bank", "sandbox")
    conn = sqlite3.connect(":memory:")
    conn.execute("CREATE TABLE runs (portal_id TEXT)")
    conn.execute("INSERT INTO runs VALUES ('bank'), ('gone')")  # runs here count as this store's
    here, other = portals_by_environment(conn, portals, "local-dev")
    assert here == ["bank", "gone", "shop-local"]
    assert other == ["shop"]


def test_a_portal_file_that_does_not_read_stays_with_this_store(tmp_path: Path) -> None:
    portals = tmp_path / "portals"
    (portals / "broken").mkdir(parents=True)
    (portals / "broken" / "portal.yaml").write_text("id: [unclosed\n", encoding="utf-8")
    here, other = portals_by_environment(None, portals, "sandbox")
    assert (here, other) == (["broken"], [])
