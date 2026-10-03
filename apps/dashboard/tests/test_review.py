"""Review actions through the real `docs:review` command (spec 004 US3, T067).

The dashboard never writes the store: a POST runs `pnpm docs:review` (apps/crawler) as a subprocess.
These tests run that command against the fixture store, so they need pnpm and the crawler's
node_modules; without them they are skipped with a reason.
"""

from __future__ import annotations

import hashlib
import shutil
import sqlite3
from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from .conftest import Store, make_client

P = "reference-insurer"
CRAWLER = Path(__file__).resolve().parents[2] / "crawler"
pytestmark = pytest.mark.skipif(
    shutil.which("pnpm") is None or not (CRAWLER / "node_modules").is_dir(),
    reason="docs:review needs pnpm and apps/crawler/node_modules",
)
ORIGIN = {"Origin": "http://testserver"}


@pytest.fixture
def reviewer_client(ba_fixture: Store) -> Iterator[TestClient]:
    with make_client(ba_fixture, reviewer="Test Reviewer", crawler_dir=CRAWLER) as c:
        yield c


def rows(store: Store) -> dict[str, set[tuple]]:
    """Every row of the tables a review may touch, for an exact before/after diff."""
    conn = sqlite3.connect(f"file:{store.path}?mode=ro", uri=True)
    try:
        return {
            "doc_reviews": set(conn.execute("SELECT * FROM doc_reviews")),
            "doc_revisions": set(conn.execute("SELECT id, rev_no, status FROM doc_revisions")),
            "doc_records": set(
                conn.execute(
                    "SELECT id, latest_rev, confirmed_rev, title, withdrawn FROM doc_records"
                )
            ),
        }
    finally:
        conn.close()


def latest_draft(store: Store, key: str) -> int:
    conn = sqlite3.connect(f"file:{store.path}?mode=ro", uri=True)
    try:
        (rev,) = conn.execute(
            "SELECT latest_rev FROM doc_records WHERE portal_id = ? AND key = ?", (P, key)
        ).fetchone()
        return rev
    finally:
        conn.close()


def test_confirm_runs_docs_review_and_changes_only_the_reported_rows(
    reviewer_client: TestClient, ba_fixture: Store
) -> None:
    rev = latest_draft(ba_fixture, "REQ-001")
    before = rows(ba_fixture)
    r = reviewer_client.post(
        f"/docs/{P}/REQ-001/reviews",
        data={"rev_no": str(rev), "action": "confirm"},
        headers=ORIGIN,
    )
    assert r.status_code == 200, r.text
    assert 'id="region-reviews"' in r.text
    assert "hx-swap-oob" in r.text  # the header is refreshed out of band
    assert "CNFD" in r.text or "confirmed" in r.text.lower()

    after = rows(ba_fixture)
    new_reviews = after["doc_reviews"] - before["doc_reviews"]
    assert len(new_reviews) == 1
    (review,) = new_reviews
    assert review[2:5] == ("confirm", "Test Reviewer", None)
    changed = {(rid, n): s for rid, n, s in after["doc_revisions"] - before["doc_revisions"]}
    assert ("confirmed" in changed.values()) and all(
        s in {"confirmed", "superseded"} for s in changed.values()
    )
    assert len(after["doc_records"] - before["doc_records"]) == 1
    assert len(after["doc_revisions"]) == len(before["doc_revisions"])


def test_a_stale_revision_is_409_inline_and_writes_nothing(
    reviewer_client: TestClient, ba_fixture: Store
) -> None:
    rev = latest_draft(ba_fixture, "REQ-001")
    before = hashlib.sha256(ba_fixture.path.read_bytes()).hexdigest()
    r = reviewer_client.post(
        f"/docs/{P}/REQ-001/reviews",
        data={"rev_no": str(rev - 1), "action": "confirm"},
        headers=ORIGIN,
    )
    assert r.status_code == 409, r.text
    assert 'id="region-reviews"' in r.text
    assert "latest" in r.text.lower()
    assert hashlib.sha256(ba_fixture.path.read_bytes()).hexdigest() == before


def test_reject_with_a_reason_is_recorded(reviewer_client: TestClient, ba_fixture: Store) -> None:
    rev = latest_draft(ba_fixture, "REQ-001")
    r = reviewer_client.post(
        f"/docs/{P}/REQ-001/reviews",
        data={"rev_no": str(rev), "action": "reject", "text": "Wrong postcode format"},
        headers=ORIGIN,
    )
    assert r.status_code == 200, r.text
    conn = sqlite3.connect(f"file:{ba_fixture.path}?mode=ro", uri=True)
    try:
        status = conn.execute(
            "SELECT rev.status FROM doc_revisions rev JOIN doc_records r ON r.id = rev.record_id"
            " WHERE r.key = 'REQ-001' AND rev.rev_no = ?",
            (rev,),
        ).fetchone()
    finally:
        conn.close()
    assert status == ("rejected",)


def test_get_routes_still_leave_the_store_unchanged(
    reviewer_client: TestClient, ba_fixture: Store
) -> None:
    before = hashlib.sha256(ba_fixture.path.read_bytes()).hexdigest()
    for url in (f"/docs/{P}", f"/docs/{P}/REQ-001", f"/fragments/docs/{P}/REQ-001/reviews"):
        assert reviewer_client.get(url).status_code == 200
    assert hashlib.sha256(ba_fixture.path.read_bytes()).hexdigest() == before
