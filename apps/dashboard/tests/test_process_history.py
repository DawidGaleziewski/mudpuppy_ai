"""Process history (spec 022 screen 07, FE-P04): who is live where, the revisions of every
model newest first with Restore, the conflict notice with Rebase, and escaping."""

from __future__ import annotations

from .conftest import Store, insert, ts
from .test_chat import text
from .test_processes_pages import P, client, seed

URL = f"/processes/PRC-001/history?portal={P}"


def test_history_shows_live_markers_revisions_and_restore(empty_store: Store) -> None:
    with client(seed(empty_store, draft_base=2, b_rev=3)) as c:
        body = c.get(URL).text
    flat = text(body)
    assert "2 process models · 4 revisions · live in sandbox" in flat
    assert "Which process model runs where" in flat and "Revisions" in flat
    assert "A r1" in flat and "Live" in flat and "Anna" in flat
    assert flat.count("Not marked") == 2  # staging and production
    assert 'data-process="/chat/portals/liveinsurer/processes/pr-1/live"' in body
    assert 'data-from="#live-label-staging #live-reason-staging"' in body
    # newest first, Restore only on the older to-be revisions
    assert body.index("B r3") < body.index("B r2") < body.index("B r1")
    assert body.count("/models/B/restore") == 2
    assert 'data-body=\'{"rev": 1, "base_rev": 3}\'' in body
    assert 'data-confirm="Restore B r1 as B r4? Nothing is deleted."' in body
    assert "/models/A/restore" not in body
    assert "Latest" in flat and "superseded" in flat and "branch" in flat
    assert "Someone saved first" in flat and "/models/B/rebase" in body
    assert body.count("<h1") == 1 and "sy-btn--primary" not in body


def test_no_conflict_without_an_older_draft_and_no_actions_without_a_reviewer(
    empty_store: Store,
) -> None:
    store = seed(empty_store)
    with client(store) as c:
        ok = c.get(URL).text
    with client(store, reviewer=None) as c:
        anon = c.get(URL).text
    assert "Someone saved first" not in ok
    assert "data-process" not in anon and "MUDPUPPY_REVIEWER" in anon


def test_human_text_is_escaped_and_missing_is_404(empty_store: Store) -> None:
    store = seed(empty_store)
    conn = store.connect()
    insert(
        conn,
        "process_live",
        id="lv-2",
        process_id="pr-1",
        environment="staging",
        model_id="v-b",
        model_rev=1,
        author="Anna",
        reason="<script>alert(1)</script>",
        created_at=ts(7),
    )
    conn.commit()
    conn.close()
    with client(store) as c:
        body = c.get(URL).text
        missing = c.get(f"/processes/PRC-999/history?portal={P}")
    assert "<script>alert(1)</script>" not in body and "&lt;script&gt;alert(1)" in body
    assert "live in sandbox, staging" in text(body) or "live in staging, sandbox" in text(body)
    assert missing.status_code == 404
