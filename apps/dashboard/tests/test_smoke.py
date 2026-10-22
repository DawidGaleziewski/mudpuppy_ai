"""Whole-app smoke: every page and fragment reachable from the nav answers 200.

Runs the same breadth-first link crawl as `mudpuppy-dashboard-smoke`, in process, on the BA
fixture and on a copy of the real sandbox store (skipped when there is none). A route that is
linked but missing, or a page that crashes on real data, fails here.
"""

from __future__ import annotations

import re
import shutil
import sqlite3
from collections import deque
from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from mudpuppy_dashboard import smoke
from mudpuppy_dashboard.version import STARTUP_FINGERPRINT, code_fingerprint
from mudpuppy_dashboard.web.deps import PORTAL_COOKIE

from .conftest import MIGRATIONS, Store, make_client

BASE = "http://testserver/"
REAL_SANDBOX = Path(__file__).resolve().parents[3] / "data" / "db" / "sandbox.sqlite"
_LINK = re.compile(r'(?:href|hx-get)="([^"]+)"')
# The error-log lookup is fetched from the chat service and answers 503 by design without it
# (the assistant drawer on every page lists these references from the store's conversations).
_NEEDS_CHAT_SERVICE = ("/chat/errors/",)


def _portal_of(client: TestClient) -> str | None:
    """The portal choice now in force: the page's own `?portal=` sets the cookie again for the
    server's domain beside the one the crawl set, so the newest one wins."""
    values = [c.value for c in client.cookies.jar if c.name == PORTAL_COOKIE]
    return values[-1] if values else None


def crawl(client: TestClient, env: str, limit: int = 3000) -> tuple[int, list[str]]:
    """GET every same-origin link from the nav pages; returns (pages checked, failures).

    A link is followed with the portal choice of the page it was found on, as a reader clicking
    it would: breadth-first, another page's `?portal=` would otherwise have switched the cookie
    in between (a process key is per portal, spec 028 F-01)."""
    queue: deque[tuple[str, str | None]] = deque()
    seen: set[str] = set()
    for start in smoke.START_PAGES:
        u = smoke._normalise(BASE, start, env)
        assert u
        queue.append((u, None))
        seen.add(u)
    failures: list[str] = []
    checked = 0
    while queue and checked < limit:
        path, portal = queue.popleft()
        client.cookies.clear()
        if portal is not None:
            client.cookies.set(PORTAL_COOKIE, portal)
        r = client.get(path)
        checked += 1
        # 204: a poll whose content has not changed (the live map, T049); htmx keeps what it has.
        if r.status_code == 204 and "v=" in path:
            continue
        if r.status_code != 200:
            failures.append(f"{r.status_code} {path}")
            continue
        for href in _LINK.findall(r.text):
            if href.startswith(_NEEDS_CHAT_SERVICE):
                continue
            u = smoke._normalise(BASE, href, env)
            if u and u not in seen:
                seen.add(u)
                queue.append((u, _portal_of(client)))
    return checked, failures


def test_every_linked_page_renders_on_the_ba_fixture(ba_client: TestClient, ba_fixture: Store):
    checked, failures = crawl(ba_client, ba_fixture.env)
    assert failures == []
    # The crawl reached the Docs tab, record pages and run tabs, not just the overview.
    assert checked > 50


def test_nav_links_resolve(ba_client: TestClient, ba_fixture: Store):
    html = ba_client.get(f"/?env={ba_fixture.env}").text
    nav = html[html.index("<nav") : html.index("</nav>")]
    hrefs = re.findall(r'href="([^"]+)"', nav)
    assert any("/docs" in h for h in hrefs)
    for h in hrefs:
        assert ba_client.get(h.replace("&amp;", "&")).status_code == 200, h


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
    # Screenshots and wireframes are linked as /evidence/<ref> (R-20/R-21).
    evidence = REAL_SANDBOX.parents[1] / "evidence"
    if evidence.exists():
        shutil.copytree(evidence, data / "evidence")
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


def test_every_linked_page_renders_on_a_copy_of_the_real_sandbox(real_sandbox: TestClient):
    checked, failures = crawl(real_sandbox, "sandbox")
    assert failures == []
    assert checked > 50


def test_healthz_reports_the_startup_code_fingerprint(ba_client: TestClient):
    body = ba_client.get("/healthz").json()
    assert body["code"] == STARTUP_FINGERPRINT == code_fingerprint()


def test_fingerprint_changes_when_a_template_changes(tmp_path: Path):
    pkg = tmp_path / "pkg"
    (pkg / "templates").mkdir(parents=True)
    (pkg / "app.py").write_text("x = 1\n")
    (pkg / "templates" / "a.html").write_text("<p>a</p>")
    before = code_fingerprint(pkg)
    (pkg / "templates" / "a.html").write_text("<p>b</p>")
    assert code_fingerprint(pkg) != before
