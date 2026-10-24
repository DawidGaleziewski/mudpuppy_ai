"""As of (spec 040 FR-001, designer 12-v2-ux.md § 2): the model's API as a past model version had
it; other addresses ignore `as_of`."""

from __future__ import annotations

from mudpuppy_dashboard import as_of, db

from .conftest import Store, ts
from .test_changes import P, seed
from .test_rules import client, seed_table_rule


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


def test_the_model_api_as_of_a_past_version(empty_store: Store) -> None:
    seed_versions(empty_store)
    c = client(empty_store)
    api = f"/api/portals/{P}"
    assert [v["seq"] for v in c.get(f"{api}/model-versions").json()["versions"]] == [3, 2, 1]
    assert "H-0003" in c.get(f"{api}/rules").text
    assert "H-0003" not in c.get(f"{api}/rules", params={"as_of": "1"}).text
    rule_now = c.get(f"{api}/rules/H-0003").json()
    rule_then = c.get(f"{api}/rules/H-0003", params={"as_of": "2"}).json()
    assert "Wrong threshold." in str(rule_now["history"])
    assert "Wrong threshold." not in str(rule_then["history"])
    screens = c.get(f"{api}/screens", params={"as_of": "1"}).json()
    assert [s["key"] for s in screens["screens"]] == ["SC-0001"]
    for page in ("map", "processes", "screens/SC-0001"):
        assert c.get(f"{api}/{page}", params={"as_of": "1"}).status_code == 200, page
    # SC-0002 is first built in version 2 (spec 042 F-09): As of version 1 it is not there.
    assert c.get(f"{api}/screens/SC-0002", params={"as_of": "1"}).status_code == 404


def test_one_screen_offers_only_the_versions_it_is_in(empty_store: Store) -> None:
    """Spec 042 F-09, restored in spec 074: SC-0002 is first built in version 2, so its As of
    menu offers 3 and 2; an unknown key or no key gives every version."""
    seed_versions(empty_store)
    c = client(empty_store)
    versions = f"/api/portals/{P}/model-versions"

    def seqs(**q: str) -> list[int]:
        return [v["seq"] for v in c.get(versions, params=q).json()["versions"]]

    assert seqs(kind="screen", key="SC-0002") == [3, 2]
    assert seqs(kind="screen", key="SC-9999") == [3, 2, 1]
    assert seqs() == [3, 2, 1]
    assert c.get(versions, params={"kind": "page", "key": "x"}).status_code == 422


def test_addresses_outside_the_model_ignore_as_of(empty_store: Store) -> None:
    seed_versions(empty_store)
    c = client(empty_store)
    now = c.get(f"/api/portals/{P}/review").json()
    then = c.get(f"/api/portals/{P}/review", params={"as_of": "1"}).json()
    assert then["total"] == now["total"]
    assert as_of.follows(f"/api/portals/{P}/review") is None
    assert as_of.follows(f"/api/portals/{P}/rules/H-0003") == P
