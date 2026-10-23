"""Spec 034 R-70 (1): scans grouped by documented process; the model is shared with the BA server
(`apps/crawler/tests/fixtures/run-groups/cases.json`)."""

from __future__ import annotations

import json
from dataclasses import asdict

from mudpuppy_dashboard import queries_run_groups as q

from .paths import REPO_ROOT

CASES = json.loads(
    (REPO_ROOT / "apps/crawler/tests/fixtures/run-groups/cases.json").read_text(encoding="utf-8")
)


def test_matches_the_shared_case() -> None:
    inp = CASES["input"]
    got = q.group_runs(
        q.GroupInput(
            inp["runs"],
            inp["screens_of_run"],
            [q.GroupProcess(**p) for p in inp["processes"]],
        )
    )
    assert asdict(got) == CASES["expected"]
