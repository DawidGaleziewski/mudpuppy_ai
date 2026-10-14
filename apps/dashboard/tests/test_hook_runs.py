"""The portal hooks that ran in a scan, on the scan page (spec 023 US2.3)."""

from __future__ import annotations

from pathfinder_dashboard import db, queries_hooks

from .conftest import Store, insert, make_client, ts
from .test_chat import text


def seed(store: Store) -> None:
    conn = store.connect()
    insert(conn, "runs", id="run-h", portal_id="liveinsurer", started_at=ts(1))
    for i, (rule, reason) in enumerate(
        (
            ("hook:onRunStart:acceptConsent", "ok (cookies.add 1)"),
            ("hook:onPageLoad:patchCalculator", "ok (inPage)"),
            ("hook:onPageLoad:patchCalculator", "failed: boom"),
            ("hook:patched", "patched by hook patchCalculator before it was observed"),
            ("hook:onBeforePageLoad:skipPrint", "skip: print view"),
        )
    ):
        insert(
            conn,
            "decision_log",
            id=f"d-{i}",
            run_id="run-h",
            kind="note",
            rule=rule,
            reason=reason,
            created_at=ts(2, i),
        )
    conn.commit()
    conn.close()


def test_hook_runs_group_by_hook_with_outcomes(empty_store: Store) -> None:
    seed(empty_store)
    conn = db.connect(empty_store.data_dir, empty_store.env)
    rows = {(r.point, r.fn): r for r in queries_hooks.hook_runs(conn, "run-h")}
    conn.close()
    assert set(rows) == {
        ("onRunStart", "acceptConsent"),
        ("onPageLoad", "patchCalculator"),
        ("onBeforePageLoad", "skipPrint"),
    }
    calc = rows[("onPageLoad", "patchCalculator")]
    assert calc.runs == 2 and calc.outcomes == {"ok": 1, "failed": 1} and calc.pages_patched == 1
    assert rows[("onBeforePageLoad", "skipPrint")].outcomes == {"skip": 1}


def test_scan_page_lists_the_hooks_that_ran(empty_store: Store) -> None:
    seed(empty_store)
    with make_client(empty_store) as c:
        body = text(c.get("/runs/run-h").text)
    assert "Portal hooks" in body
    assert "onPageLoad · patchCalculator ran 2" in body and "Failed" in body
    assert "Skipped the page" in body and "patched 1 page" in body
