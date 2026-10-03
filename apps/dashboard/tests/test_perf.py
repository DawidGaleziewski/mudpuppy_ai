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


# --- T056: every Docs page < 1 s on 2 000 records x 3 revisions x 3 links (SC-005) -------------

DOC_PORTAL = "perf-portal"
DOC_RUN = "run-docs-perf"
DOC_KIND_PREFIX = (
    ("capability", "CAP"),
    ("screen", "SCR"),
    ("process", "PROC"),
    ("use_case", "UC"),
    ("requirement", "REQ"),
    ("business_rule", "BR"),
    ("glossary_term", "GL"),
    ("data_item", "DI"),
    ("nfr", "NFR"),
    ("assumption", "ASM"),
)


@pytest.fixture(scope="module")
def docs_perf_store(tmp_path_factory: pytest.TempPathFactory) -> Store:
    import json

    from .conftest import make_store

    data_dir = tmp_path_factory.mktemp("docs-perf") / "data"
    store = Store(data_dir, "test", make_store(data_dir))
    w = store.connect()
    insert(w, "runs", id=DOC_RUN, portal_id=DOC_PORTAL, status="completed")
    insert(w, "states", id="perf-state", portal_id=DOC_PORTAL, first_seen_run=DOC_RUN)
    w.execute(
        "INSERT INTO analysis_sessions (id, portal_id, status, passes_json, summary, gaps_json,"
        " started_at, ended_at) VALUES ('perf-sess', ?, 'completed', '[]', 's', '[]', 't', 't')",
        (DOC_PORTAL,),
    )
    records, revisions, links, relations = [], [], [], []
    n = 2_000
    for i in range(n):
        kind, prefix = DOC_KIND_PREFIX[i % len(DOC_KIND_PREFIX)]
        seq = i // len(DOC_KIND_PREFIX) + 1
        rid = f"rec-{i:05d}"
        records.append((rid, DOC_PORTAL, kind, f"{prefix}-{seq:04d}", seq, f"Title {i}", 3, 1, 0))
        for rev in (1, 2, 3):
            vid = f"{rid}-r{rev}"
            content = json.dumps({"kind": kind, "title": f"Title {i}", "statement": "s"})
            revisions.append(
                (vid, rid, rev, "perf-sess", "create" if rev == 1 else "revise", content,
                 "inferred" if i % 3 == 0 else "observed", int(i % 7 == 0),
                 "confirmed" if rev == 1 else "draft", None if rev == 1 else "n")
            )  # fmt: skip
            for j in range(3):
                links.append((f"{vid}-e{j}", vid, "state", "perf-state", DOC_RUN, "note"))
        relations.append((f"{rid}-r3", f"rec-{(i + 1) % n:05d}", "refines"))
    w.executemany(
        "INSERT INTO doc_records (id, portal_id, kind, key, seq, title, latest_rev, confirmed_rev,"
        " withdrawn, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 't', 't')",
        records,
    )
    w.executemany(
        "INSERT INTO doc_revisions (id, record_id, rev_no, session_id, change, content_json,"
        " confidence, not_observable, status, change_note, created_at)"
        " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 't')",
        revisions,
    )
    w.executemany(
        "INSERT INTO doc_evidence_links (id, revision_id, target_kind, target_id, run_id, note)"
        " VALUES (?, ?, ?, ?, ?, ?)",
        links,
    )
    w.executemany("INSERT INTO doc_relations VALUES (?, ?, ?)", relations)
    w.execute("INSERT INTO analysis_session_runs VALUES ('perf-sess', ?)", (DOC_RUN,))
    w.commit()
    w.close()
    return store


DOC_URLS = [
    "/docs",
    "/fragments/docs/portals",
    f"/docs/{DOC_PORTAL}",
    *(
        f"/docs/{DOC_PORTAL}?section={s}"
        for s in ("capabilities", "screens", "processes", "requirements", "traceability", "data")
    ),
    f"/docs/{DOC_PORTAL}?section=requirements&status=confirmed",
    f"/docs/{DOC_PORTAL}?section=requirements&confidence=inferred",
    f"/docs/{DOC_PORTAL}?section=traceability&flag=not_observable",
    f"/docs/{DOC_PORTAL}?section=traceability&flag=open_question",
    f"/fragments/docs/{DOC_PORTAL}/index",
    f"/fragments/docs/{DOC_PORTAL}/section/requirements",
    f"/docs/{DOC_PORTAL}/REQ-0001",
    f"/docs/{DOC_PORTAL}/REQ-0001?rev=1",
    f"/fragments/docs/{DOC_PORTAL}/REQ-0001/header",
    f"/fragments/docs/{DOC_PORTAL}/REQ-0001/body",
    f"/fragments/docs/{DOC_PORTAL}/REQ-0001/reviews",
    f"/docs/{DOC_PORTAL}/sessions/perf-sess",
    f"/runs/{DOC_RUN}?tab=docs",
    f"/fragments/runs/{DOC_RUN}/docs",
]


def test_docs_fixture_has_2000_records_x_3_revisions_x_3_links(docs_perf_store: Store) -> None:
    conn = docs_perf_store.connect()
    assert conn.execute("SELECT count(*) FROM doc_records").fetchone()[0] == 2_000
    assert conn.execute("SELECT count(*) FROM doc_revisions").fetchone()[0] == 6_000
    assert conn.execute("SELECT count(*) FROM doc_evidence_links").fetchone()[0] == 18_000


@pytest.mark.parametrize("url", DOC_URLS)
def test_docs_page_renders_under_one_second(docs_perf_store: Store, url: str) -> None:
    with make_client(docs_perf_store) as client:
        client.get(url)  # warm templates
        start = time.perf_counter()
        response = client.get(url)
        elapsed = time.perf_counter() - start
    assert response.status_code == 200, url
    assert elapsed < 1.0, f"{url} took {elapsed:.3f}s"
