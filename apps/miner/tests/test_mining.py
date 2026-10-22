import json
import random
from pathlib import Path

import pytest

from mudpuppy_miner.__main__ import main
from mudpuppy_miner.communities import communities
from mudpuppy_miner.rules import mine

DP = {"screen": "SC-0012", "action": "button|oblicz składkę|main|"}
TYPES = {"derived.age_years": "number", "persona.segment": "enum", "input.marka": "enum"}


def threshold_rows(threshold: int = 18) -> list[dict]:
    rows = []
    for age in range(12, 40):
        for seg in ("standard", "premium"):
            target = (
                "SC-0040 ok"
                if age < threshold
                else f"SC-{'0015' if seg == 'premium' else '0014'} ok"
            )
            rows.append(
                {
                    "features": {
                        "derived.age_years": age,
                        "persona.segment": seg,
                        "input.marka": "skoda",
                    },
                    "target": target,
                }
            )
    return rows


def test_threshold_rule_is_recovered_exactly() -> None:
    out = mine({"decision_point": DP, "types": TYPES, "rows": threshold_rows()})
    assert out["hitPolicy"] == "U"
    assert out["fitness"] == 1.0
    assert out["precision"] == 1.0
    exits = [r for r in out["rules"] if r["then"] == "SC-0040 ok"]
    assert exits == [{"when": {"derived.age_years": "< 18"}, "then": "SC-0040 ok"}]
    # the constant brand never becomes an input
    assert [i["name"] for i in out["inputs"]] == ["derived.age_years", "persona.segment"]


def test_a_moved_threshold_is_mined_as_the_new_one() -> None:
    out = mine({"decision_point": DP, "types": TYPES, "rows": threshold_rows(21)})
    exits = [r for r in out["rules"] if r["then"] == "SC-0040 ok"]
    assert exits[0]["when"] == {"derived.age_years": "< 21"}


def test_overlapping_outcomes_give_hit_policy_c() -> None:
    rng = random.Random(0)
    rows = []
    for i in range(80):
        manual = rng.random() < 0.3
        rows.append(
            {
                "features": {"derived.age_years": 30 + i % 10, "persona.segment": "standard"},
                "target": "SC-0050 ok" if manual else "SC-0014 ok",
            }
        )
    out = mine({"decision_point": DP, "types": TYPES, "rows": rows})
    assert out["hitPolicy"] == "C"
    assert {r["then"] for r in out["rules"]} == {"SC-0014 ok", "SC-0050 ok"}


def test_too_few_rows_per_target_needs_data() -> None:
    rows = threshold_rows()[:6]
    out = mine({"decision_point": DP, "types": TYPES, "rows": rows})
    assert out["needs_data"] is True


def test_missing_values_stay_missing() -> None:
    rows = threshold_rows()
    for r in rows[::7]:
        r["features"]["persona.segment"] = None
    out = mine({"decision_point": DP, "types": TYPES, "rows": rows})
    assert out["fitness"] > 0.8


def test_mining_is_deterministic() -> None:
    table = {"decision_point": DP, "types": TYPES, "rows": threshold_rows()}
    assert mine(table) == mine(json.loads(json.dumps(table)))


def test_leiden_splits_two_dense_groups() -> None:
    graph = {
        "nodes": ["A", "B", "C", "X", "Y", "Z"],
        "edges": [
            {"a": "A", "b": "B", "w": 3},
            {"a": "B", "b": "C", "w": 3},
            {"a": "A", "b": "C", "w": 3},
            {"a": "X", "b": "Y", "w": 3},
            {"a": "Y", "b": "Z", "w": 3},
            {"a": "X", "b": "Z", "w": 3},
            {"a": "C", "b": "X", "w": 0.5},
        ],
    }
    assert communities(graph) == {"communities": [["A", "B", "C"], ["X", "Y", "Z"]]}
    assert communities(graph) == communities(graph)


def test_cli_reads_a_table_file(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    f = tmp_path / "t.json"
    f.write_text(json.dumps({"decision_point": DP, "types": TYPES, "rows": threshold_rows()}))
    assert main(["rules", "--in", str(f)]) == 0
    assert json.loads(capsys.readouterr().out)["hitPolicy"] == "U"
    assert main(["rules"]) == 2
