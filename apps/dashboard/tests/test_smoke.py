"""Whole-app smoke: every page and fragment reachable from the nav answers 200.

Runs the same breadth-first link crawl as `pathfinder-dashboard-smoke`, in process, on the BA
fixture and on a copy of the real sandbox store (skipped when there is none). A route that is
linked but missing, or a page that crashes on real data, fails here.
"""

from __future__ import annotations

import re
import shutil
from collections import deque
from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from pathfinder_dashboard import smoke
from pathfinder_dashboard.version import STARTUP_FINGERPRINT, code_fingerprint

from .conftest import Store, make_client

BASE = "http://testserver/"
REAL_SANDBOX = Path(__file__).resolve().parents[3] / "data" / "db" / "sandbox.sqlite"
_LINK = re.compile(r'(?:href|hx-get)="([^"]+)"')


def crawl(client: TestClient, env: str, limit: int = 3000) -> tuple[int, list[str]]:
    """GET every same-origin link from the nav pages; returns (pages checked, failures)."""
    queue: deque[str] = deque()
    seen: set[str] = set()
    for start in ("/", "/docs", "/activity"):
        u = smoke._normalise(BASE, start, env)
        assert u
        queue.append(u)
        seen.add(u)
    failures: list[str] = []
    checked = 0
    while queue and checked < limit:
        path = queue.popleft()
        r = client.get(path)
        checked += 1
        if r.status_code != 200:
            failures.append(f"{r.status_code} {path}")
            continue
        for href in _LINK.findall(r.text):
            u = smoke._normalise(BASE, href, env)
            if u and u not in seen:
                seen.add(u)
                queue.append(u)
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
    store = Store(data, "sandbox", data / "db" / "sandbox.sqlite")
    with make_client(store) as c:
        yield c


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
