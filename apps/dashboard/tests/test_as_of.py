"""As of (spec 040 FR-001, designer 12-v2-ux.md § 2): the model pages as a past model version had
them, a banner with Back to now, links that stay in the past, and no writes."""

from __future__ import annotations

from mudpuppy_dashboard import as_of, db

from .conftest import Store, ts
from .test_changes import P, seed
from .test_chat import ORIGIN, text
from .test_rules import client, seed_table_rule

FORM = {"Content-Type": "application/x-www-form-urlencoded", **ORIGIN}


def seed_versions(store: Store) -> Store:
    """Versions 1 and 2 (test_changes) and a third; SC-0002 first built in version 2; the table
    rule H-0003 created with version 2, its events after it."""
    seed(store)
    seed_table_rule(store)
    conn = store.connect()
    conn.execute(
        "INSERT INTO model_versions (id, portal_id, seq, built_at, algorithm, threshold,"
        " stats_json) VALUES ('mv3', ?, 3, ?, 'minhash-avglink-v1', 0.9, '{}')",
        (P, ts(10)),
    )
    conn.execute(
        "INSERT INTO model_screens (id, key, portal_id, route_key, title, status,"
        " first_model_version, created_at) VALUES ('M2', 'SC-0002', ?, '/b', 'Wyniki', 'retired',"
        " 'mv2', ?)",
        (P, ts(2)),
    )
    conn.commit()
    conn.close()
    return store


def test_the_views_hide_what_came_after_the_version(empty_store: Store) -> None:
    seed_versions(empty_store)
    conn = db.connect(empty_store.data_dir, empty_store.env, lambda c: as_of.shadow(c, ts(1)))
    screens = [r["key"] for r in conn.execute("SELECT key FROM model_screens ORDER BY key")]
    newest = conn.execute("SELECT max(seq) FROM model_versions").fetchone()[0]
    assert screens == ["SC-0001"] and newest == 1
    assert conn.execute("SELECT count(*) FROM hypotheses").fetchone()[0] == 0
    assert conn.execute("SELECT count(*) FROM main.hypotheses").fetchone()[0] == 2
    conn.close()
    later = db.connect(empty_store.data_dir, empty_store.env, lambda c: as_of.shadow(c, ts(2)))
    # Retired now, but no lineage says so by version 2: active then.
    (status,) = later.execute("SELECT status FROM model_screens WHERE key = 'SC-0002'").fetchone()
    later.close()
    assert status == "active"
    with db.connect(empty_store.data_dir, empty_store.env) as now:
        assert [v.seq for v in as_of.versions(now, P)] == [3, 2, 1]
        assert as_of.find(now, P, "3") is None  # the latest version is Now
        assert as_of.find(now, P, "2").built_at == ts(2)


def test_a_model_page_as_of_a_past_version(empty_store: Store) -> None:
    seed_versions(empty_store)
    c = client(empty_store)
    now = c.get(f"/rules?portal={P}").text
    assert 'id="header-as-of"' in now and "Version 2 · " in now and 'id="as-of"' not in now
    past = c.get(f"/rules?portal={P}&as_of=1").text
    assert "As of version 1" in text(past) and "Back to now" in past
    assert "H-0003" not in past and "/static/js/as-of.js" in past
    rule_now = text(c.get(f"/rules/H-0003?portal={P}").text)
    rule_then = c.get(f"/rules/H-0003?portal={P}&as_of=2").text
    assert "Wrong threshold." in rule_now and "Wrong threshold." not in text(rule_then)
    assert "/rules/H-0003/reword?as_of=2" in rule_then  # forms stay in the past, and are refused
    refused = c.post(
        f"/rules/H-0003/reword?portal={P}&as_of=2", content="key=H-0003&wording=x", headers=FORM
    )
    assert refused.status_code == 409
    screens = c.get(f"/screens?portal={P}&as_of=1").text
    assert "SC-0001" in screens and "SC-0002" not in screens
    for page in ("/map", "/processes", "/screens/SC-0001"):
        r = c.get(f"{page}?portal={P}&as_of=1")
        assert r.status_code == 200 and 'id="as-of"' in r.text, page


def test_a_screen_offers_only_the_versions_it_is_in(empty_store: Store) -> None:
    """Spec 042 F-09: SC-0002 is first built in version 2, so its page offers no version 1 (a
    screen As of a version before it is a 404)."""
    seed_versions(empty_store)
    c = client(empty_store)
    page = c.get(f"/screens/SC-0002?portal={P}").text
    assert "as_of=2" in page and "as_of=1" not in page
    assert "as_of=1" in c.get(f"/screens/SC-0001?portal={P}").text
    assert c.get(f"/screens/SC-0002?portal={P}&as_of=1").status_code == 404
    # The same for a rule created with version 2.
    rule = c.get(f"/rules/H-0003?portal={P}").text
    assert "as_of=2" in rule and "as_of=1" not in rule


def test_pages_outside_the_model_ignore_as_of(empty_store: Store) -> None:
    seed_versions(empty_store)
    c = client(empty_store)
    review = c.get(f"/review?portal={P}&as_of=1").text
    assert 'id="as-of"' not in review and 'id="header-as-of"' not in review
