"""Diagram parity with the TS builder (spec 004 research §9, T054): shared goldens, same bytes."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from pathfinder_dashboard.diagrams import capability_map, label, node_id, process_map, screen_nav

SPEC = Path(__file__).resolve().parents[3] / "specs" / "004-ba-documentation"
FIXTURES = SPEC / "contracts" / "diagram-fixtures"


def _input(name: str) -> dict:
    return json.loads((FIXTURES / f"{name}.json").read_text(encoding="utf-8"))


@pytest.mark.parametrize(
    ("name", "build"),
    [("process-map", process_map), ("screen-nav", screen_nav), ("capability-map", capability_map)],
)
def test_matches_golden_byte_for_byte(name, build):
    golden = (FIXTURES / f"{name}.mmd").read_bytes()
    assert build(_input(name)).encode("utf-8") == golden


def test_process_without_boundary_has_no_boundary_node():
    data = _input("process-map") | {"boundary": None}
    assert "boundary" not in process_map(data)


def test_escapes_labels_and_ids():
    assert label(' a  "b" <c> & d ') == "a #quot;b#quot; #lt;c#gt; #amp; d"
    assert node_id("SCR-001") == "SCR_001"
