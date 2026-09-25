"""SC-005: pages stay under 1 s on a run with 10 000 frontier items and actions."""

import time

import pytest

from .conftest import Store, insert, make_client

BIG = "run-big"
URLS = [
    "/",
    "/fragments/summary",
    "/fragments/runs",
    f"/runs/{BIG}",
    *(
        f"/runs/{BIG}?tab={tab}"
        for tab in ("actions", "frontier", "forms", "network", "robots", "decisions")
    ),
    f"/fragments/runs/{BIG}/frontier?status=pending",
    f"/fragments/runs/{BIG}/decisions?kind=skip",
    f"/fragments/runs/{BIG}/actions?allowed=0",
]


@pytest.fixture(scope="module")
def big_store(tmp_path_factory: pytest.TempPathFactory) -> Store:
    from .conftest import make_store

    data_dir = tmp_path_factory.mktemp("perf") / "data"
    store = Store(data_dir, "test", make_store(data_dir))
    w = store.connect()
    insert(w, "runs", id=BIG, status="running", elapsed_ms=1000)
    insert(w, "states", id="s1", first_seen_run=BIG)
    insert(w, "state_observations", run_id=BIG, state_id="s1")
    statuses = ["pending", "done", "skipped_unsafe", "robots_disallowed", "unreachable"]
    for i in range(10_000):
        status = statuses[i % len(statuses)]
        insert(
            w,
            "actions",
            id=f"a{i:05d}",
            run_id=BIG,
            state_id="s1",
            allowed=0 if status == "skipped_unsafe" else 1,
            skip_reason="unsafe" if status == "skipped_unsafe" else None,
        )
        insert(
            w,
            "frontier",
            id=f"f{i:05d}",
            run_id=BIG,
            state_id="s1",
            action_id=f"a{i:05d}",
            status=status,
            reason=None if status in ("pending", "done") else "r",
        )
    for i in range(2_000):
        insert(
            w,
            "decision_log",
            id=f"d{i:05d}",
            run_id=BIG,
            kind=("skip", "refuse")[i % 2],
            rule=f"rule-{i % 7}",
            reason="because",
        )
    w.commit()
    w.close()
    return store


@pytest.mark.parametrize("url", URLS)
def test_page_renders_under_one_second(big_store: Store, url: str) -> None:
    with make_client(big_store) as client:
        client.get(url)  # warm templates
        start = time.perf_counter()
        response = client.get(url)
        elapsed = time.perf_counter() - start
    assert response.status_code == 200
    assert elapsed < 1.0, f"{url} took {elapsed:.3f}s"
