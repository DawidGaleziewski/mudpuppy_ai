"""Spec 075 (R-96 spike): a stored view spec compiled to A2UI v0.9.1, checked against the
designer's catalog and the golden streams in `packages/workbench-contract/workbench/a2ui/`."""

from __future__ import annotations

import json

from mudpuppy_dashboard import wb_a2ui

from .paths import REPO_ROOT

A2UI = REPO_ROOT / "packages" / "workbench-contract" / "workbench" / "a2ui"
EXAMPLES = REPO_ROOT / "packages" / "workbench-contract" / "workbench" / "examples" / "valid"


def _stream(name: str) -> list[dict]:
    return [
        json.loads(line) for line in (A2UI / "examples" / name).read_text().splitlines() if line
    ]


def test_data_paths_match_the_catalog() -> None:
    catalog = json.loads((A2UI / "catalog.json").read_text())
    assert catalog["catalogId"] == wb_a2ui.CATALOG_ID
    paths = {k: v["x-mudpuppy"]["dataPath"] for k, v in catalog["components"].items()}
    assert paths == wb_a2ui.DATA_PATHS


def test_the_live_mapping_view_compiles_to_the_golden_stream() -> None:
    spec = json.loads((EXAMPLES / "mapping-live.json").read_text())
    golden = _stream("mapping-live.jsonl")
    messages = wb_a2ui.surface_messages("t1", wb_a2ui.compile_view(spec))
    assert messages == golden[:2]


def test_the_stopped_view_and_its_resume_card() -> None:
    golden = _stream("mapping-stopped-resume.jsonl")
    spec = json.loads((EXAMPLES / "mapping-stopped.json").read_text())
    compiled = wb_a2ui.compile_view(spec)
    assert compiled[1:] == golden[1]["updateComponents"]["components"][1:]


def test_server_owned_and_unknown_types_are_not_compiled() -> None:
    for kind in ("View", "CommandCard", "Choice", "Script"):
        assert wb_a2ui.compile_component({"id": "x", "type": kind}) is None


def test_card_ids_are_valid_component_ids() -> None:
    cmd = wb_a2ui.command_card("01A110D5-0000-7000-8000-0000000000D1", "scan.start")
    assert cmd == {
        "id": "cmd-0000000000d1",
        "component": "CommandCard",
        "command": "scan.start",
        "data": {"path": "/commands/cmd-0000000000d1"},
    }
    assert wb_a2ui.choice_card("0199a000-0000-7000-8000-00000000abcd")["data"] == {
        "path": "/choices/choice-00000000abcd"
    }
