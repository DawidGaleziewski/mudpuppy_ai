"""FR-001 / SC-004: the dashboard can never change the crawl store."""

import hashlib
import sqlite3
from pathlib import Path

import pytest

from mudpuppy_dashboard import db

from .conftest import BIG_RUN, Store, make_client


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def test_connect_is_read_only(liveinsurer_store: Store) -> None:
    conn = db.connect(liveinsurer_store.data_dir, liveinsurer_store.env)
    assert conn.execute("PRAGMA query_only").fetchone()[0] == 1
    for statement in (
        "INSERT INTO open_questions VALUES ('q', 'run-001', 't', 's', 'open', 'now')",
        "UPDATE runs SET status = 'completed'",
        "DELETE FROM runs",
        "CREATE TABLE x (a)",
    ):
        with pytest.raises(sqlite3.OperationalError):
            conn.execute(statement)
    # query_only off is not enough either: the file itself is opened read-only.
    conn.execute("PRAGMA query_only = OFF")
    with pytest.raises(sqlite3.OperationalError, match="readonly"):
        conn.execute("DELETE FROM runs")
    conn.close()


def test_missing_store_is_reported_and_never_created(tmp_path: Path) -> None:
    data_dir = tmp_path / "data"
    (data_dir / "db").mkdir(parents=True)
    with pytest.raises(db.StoreMissing) as err:
        db.connect(data_dir, "production")
    assert "production.sqlite" in str(err.value)
    assert not (data_dir / "db" / "production.sqlite").exists()


def test_every_route_leaves_the_store_unchanged(liveinsurer_store: Store) -> None:
    liveinsurer_store.connect().execute("PRAGMA wal_checkpoint(TRUNCATE)").close()
    before = digest(liveinsurer_store.path)
    files_before = sorted(p.name for p in liveinsurer_store.path.parent.iterdir())
    urls = [
        "/",
        "/healthz",
        "/fragments/summary",
        "/fragments/runs",
        f"/runs/{BIG_RUN}",
        *(
            f"/fragments/runs/{BIG_RUN}/{section}"
            for section in (
                "header",
                "states",
                "actions",
                "frontier",
                "forms",
                "network",
                "robots",
                "decisions",
            )
        ),
    ]
    with make_client(liveinsurer_store) as client:
        for url in urls:
            assert client.get(url).status_code == 200, url
    assert digest(liveinsurer_store.path) == before
    assert sorted(p.name for p in liveinsurer_store.path.parent.iterdir()) == files_before


def test_every_docs_route_leaves_the_store_unchanged(ba_fixture: Store) -> None:
    """T055: the Docs pages, fragments and run tabs are GET-only and never write."""
    from .test_docs_routes import ALL_PAGES

    ba_fixture.connect().execute("PRAGMA wal_checkpoint(TRUNCATE)").close()
    before = digest(ba_fixture.path)
    files_before = sorted(p.name for p in ba_fixture.path.parent.iterdir())
    extra = [
        "/docs/nope",
        "/docs/reference-insurer/REQ-404",
        "/docs/reference-insurer?section=processes&flag=open_question&status=draft",
        "/fragments/docs/reference-insurer/section/traceability?push=1",
    ]
    with make_client(ba_fixture) as client:
        for url in (*ALL_PAGES, *extra):
            assert client.get(url).status_code in (200, 404), url
    assert digest(ba_fixture.path) == before
    assert sorted(p.name for p in ba_fixture.path.parent.iterdir()) == files_before
