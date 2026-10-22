"""Spec 028 F-02 (owner 2026-10-15: measure first): the nav's Review marker builds the access
matrix on every page. Budget on a big store: 300 screens, 5 personas with completed map runs,
20 actions per variant, half the screens with an element only some personas see. Measured
2026-10-15: the whole test (store built included) 0.43 s, so no cache (owner: cache if slow)."""

import sqlite3
import time

import pytest

from mudpuppy_dashboard import queries_review

from .conftest import Store, insert, make_store

pytestmark = pytest.mark.perf

PORTAL = "big-portal"
PERSONAS = [f"p{i}" for i in range(5)]
SCREENS = 300
BUDGET_S = 0.5


@pytest.fixture(scope="module")
def big_access(tmp_path_factory: pytest.TempPathFactory) -> Store:
    data_dir = tmp_path_factory.mktemp("perf-access") / "data"
    store = Store(data_dir, "test", make_store(data_dir))
    w = store.connect()
    for p in PERSONAS:
        insert(w, "runs", id=f"run-{p}", portal_id=PORTAL, persona_id=p, status="completed")
    for s in range(SCREENS):
        insert(
            w, "screens", id=f"sc{s}", portal_id=PORTAL, cluster_id=f"c{s}",
            route_template=f"/s{s}", title=f"S{s}", first_seen_run="run-p0",
            created_at="2026-10-15T00:00:00.000Z",
        )  # fmt: skip
        for i, p in enumerate(PERSONAS):
            state = f"st{s}-{p}"
            insert(
                w, "states", id=state, portal_id=PORTAL, fingerprint=state, screen_id=f"sc{s}",
                screen_rev=i + 1, route_template=f"/s{s}", first_seen_run=f"run-{p}",
            )  # fmt: skip
            insert(w, "state_observations", run_id=f"run-{p}", state_id=state, persona_id=p)
            names = [f"Link {n}" for n in range(20)] + (["Extra"] if s % 2 and i % 2 else [])
            for n, name in enumerate(names):
                insert(
                    w, "actions", id=f"a{s}-{p}-{n}", run_id=f"run-{p}", state_id=state,
                    accessible_name=name,
                )  # fmt: skip
    w.commit()
    w.close()
    return store


def test_review_count_stays_within_budget_on_a_big_portal(big_access: Store) -> None:
    conn = big_access.connect()
    conn.row_factory = sqlite3.Row
    queries_review.count(conn, PORTAL)  # warm the page cache
    started = time.perf_counter()
    n = queries_review.count(conn, PORTAL)
    took = time.perf_counter() - started
    conn.close()
    assert n == SCREENS // 2  # one unexplained "Extra" per odd screen
    assert took < BUDGET_S, f"count() took {took:.3f} s"
