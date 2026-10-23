"""Whole-app smoke (R-100, spec 071): every read the React console makes, for every portal of the
store, answers 200. The same list as `mudpuppy-dashboard-smoke`, in process, on the BA fixture
and on a copy of the real sandbox store (skipped when there is none). A read that crashes on real
data fails here."""

from __future__ import annotations

import shutil
import sqlite3
from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from mudpuppy_dashboard import smoke

from .conftest import MIGRATIONS, Store, make_client

REAL_SANDBOX = Path(__file__).resolve().parents[3] / "data" / "db" / "sandbox.sqlite"
# Not in process: the shell needs a build of apps/web, the assistant asks the chat service.
SKIPPED = ("/app/", "/assistant")


def check(client: TestClient, env: str) -> tuple[int, list[str]]:
    """GET every address the console reads; returns (addresses checked, failures)."""
    portals = [p["id"] for p in client.get("/api/portals", params={"env": env}).json()["portals"]]
    paths = [a for a in smoke.addresses(portals, env) if not any(s in a for s in SKIPPED)]
    failures = [f"{r.status_code} {p}" for p in paths if (r := client.get(p)).status_code != 200]
    return len(paths), failures


def test_every_read_answers_on_the_ba_fixture(ba_client: TestClient, ba_fixture: Store) -> None:
    checked, failures = check(ba_client, ba_fixture.env)
    assert failures == []
    assert checked > 15  # at least one portal's pages, not only the global reads


def test_the_old_addresses_lead_to_the_console(ba_client: TestClient) -> None:
    assert ba_client.get("/", follow_redirects=False).headers["location"] == "/app/"
    old = ba_client.get("/runs/run-1", follow_redirects=False)
    assert old.status_code == 301 and old.headers["location"] == "/app/scans/run-1"
    docs = ba_client.get("/docs/shop/BR-001", follow_redirects=False)
    assert docs.headers["location"] == "/app/portals/shop/docs/BR-001"
    review = ba_client.get("/review?portal=shop&show=reanchor", follow_redirects=False)
    assert review.headers["location"] == "/app/portals/shop/review?show=reanchor"
    state = ba_client.get("/states/st-1?hl=btn", follow_redirects=False)
    assert state.headers["location"] == "/app/states/st-1?hl=btn"


@pytest.fixture
def real_sandbox(tmp_path: Path) -> Iterator[TestClient]:
    if not REAL_SANDBOX.exists():
        pytest.skip(f"no real sandbox store at {REAL_SANDBOX}")
    data = tmp_path / "data"
    (data / "db").mkdir(parents=True)
    (data / "migrations").mkdir()
    for suffix in ("", "-wal", "-shm"):
        src = REAL_SANDBOX.with_name(REAL_SANDBOX.name + suffix)
        if src.exists():
            shutil.copy(src, data / "db" / src.name)
    store = Store(data, "sandbox", data / "db" / "sandbox.sqlite")
    migrate_copy(store.path)
    with make_client(store) as c:
        yield c


def migrate_copy(path: Path) -> None:
    """Apply the up-migrations the copy lacks (a branch's new one; the real store is never
    migrated by a test, and never before its migration is merged, R-54)."""
    conn = sqlite3.connect(path)
    applied = {row[0] for row in conn.execute("SELECT version FROM schema_migrations")}
    for migration in MIGRATIONS:
        version, _, name = migration.stem.removesuffix(".up").partition("_")
        if version in applied:
            continue
        conn.execute("PRAGMA foreign_keys = OFF")
        conn.executescript(migration.read_text())
        conn.execute(
            "INSERT INTO schema_migrations VALUES (?, ?, ?)",
            (version, name, "1970-01-01T00:00:00Z"),
        )
    conn.commit()
    conn.close()


def test_every_read_answers_on_a_copy_of_the_real_sandbox(real_sandbox: TestClient) -> None:
    _, failures = check(real_sandbox, "sandbox")
    assert failures == []
