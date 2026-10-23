"""FR-001 / SC-004: the dashboard can never change the crawl store."""

import hashlib
import sqlite3
from pathlib import Path

import pytest

from mudpuppy_dashboard import db, smoke

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


def _unchanged_after(store: Store, urls: list[str], allowed: tuple[int, ...]) -> None:
    store.connect().execute("PRAGMA wal_checkpoint(TRUNCATE)").close()
    before = digest(store.path)
    files_before = sorted(p.name for p in store.path.parent.iterdir())
    with make_client(store) as client:
        for url in urls:
            assert client.get(url).status_code in allowed, url
    assert digest(store.path) == before
    assert sorted(p.name for p in store.path.parent.iterdir()) == files_before


def test_every_scan_read_leaves_the_store_unchanged(liveinsurer_store: Store) -> None:
    sections = ("states", "actions", "frontier", "forms", "network", "robots", "decisions")
    urls = [
        "/healthz",
        "/api/portals",
        f"/api/scans/{BIG_RUN}",
        f"/api/scans/{BIG_RUN}/graph",
        *(f"/api/scans/{BIG_RUN}/{s}" for s in sections),
    ]
    _unchanged_after(liveinsurer_store, urls, (200,))


def test_every_console_read_leaves_the_store_unchanged(ba_fixture: Store) -> None:
    """T055: every read of the console is GET-only and never writes."""
    portal = "reference-insurer"
    urls = [
        *(a for a in smoke.addresses([portal], None) if "/app/" not in a and "/assistant" not in a),
        f"/api/portals/{portal}/docs/REQ-404",
        f"/api/portals/{portal}/docs?section=processes&flag=open_question&status=draft",
    ]
    _unchanged_after(ba_fixture, urls, (200, 404))
