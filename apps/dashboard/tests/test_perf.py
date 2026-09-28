"""SC-005: pages stay under 1 s on a run with 10 000 frontier items and actions, and on a trace
of 500 calls / 20 000 spans."""

import time

import pytest

from .conftest import Store, insert, make_client, make_trace_fixture

BIG = "run-big"
URLS = [
    "/",
    "/fragments/summary",
    "/fragments/runs",
    f"/runs/{BIG}",
    *(
        f"/runs/{BIG}?tab={tab}"
        for tab in ("actions", "frontier", "forms", "network", "robots", "decisions", "trace")
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


# --- T042: 500 calls / 20 000 spans (SC-005) --------------------------------------------------

TRACE_RUN = "run-trace-big"
TRACE_URLS = [
    f"/runs/{TRACE_RUN}?tab=trace",
    f"/fragments/runs/{TRACE_RUN}/trace",
    f"/fragments/runs/{TRACE_RUN}/trace/summary",
    f"/fragments/runs/{TRACE_RUN}/trace?problems=1",
]


@pytest.fixture(scope="module")
def trace_perf_store(tmp_path_factory: pytest.TempPathFactory) -> Store:
    from .conftest import make_store

    data_dir = tmp_path_factory.mktemp("trace-perf") / "data"
    store = Store(data_dir, "test", make_store(data_dir))
    w = store.connect()
    insert(w, "runs", id=TRACE_RUN, status="completed", elapsed_ms=120_000)
    make_trace_fixture(w, TRACE_RUN)  # 500 calls * 40 spans = 20 000
    w.commit()
    w.close()
    return store


def test_trace_fixture_has_20000_spans(trace_perf_store: Store) -> None:
    conn = trace_perf_store.connect()
    assert conn.execute("SELECT count(*) FROM trace_spans").fetchone()[0] == 20_000


@pytest.mark.parametrize("url", TRACE_URLS)
def test_trace_summary_and_first_page_render_under_one_second(
    trace_perf_store: Store, url: str
) -> None:
    with make_client(trace_perf_store) as client:
        client.get(url)  # warm templates
        start = time.perf_counter()
        response = client.get(url)
        elapsed = time.perf_counter() - start
    assert response.status_code == 200
    assert elapsed < 1.0, f"{url} took {elapsed:.3f}s"
