"""The React console's Business rules (R-96, spec 065): the same groups, table, tests and history
as the htmx pages, statuses mapped, the rule in the export, and Reword through the chat service
(mocked), signed with the reviewer."""

from __future__ import annotations

import json

import httpx2

from .conftest import Store, add_record, add_session
from .test_changes import P, client, seed, seed_rule_and_rename
from .test_chat import ORIGIN, Service
from .test_processes_pages import client as chat_client
from .test_rules import seed_table_rule
from .test_rules_export import MD, fake_export  # noqa: F401  (the fixture)

API = f"/api/portals/{P}/rules"


def test_the_list_groups_rules_by_what_needs_a_person(empty_store: Store) -> None:
    seed(empty_store)
    seed_rule_and_rename(empty_store)
    seed_table_rule(empty_store)
    body = client(empty_store).get(API).json()
    assert body["total"] == 2
    assert [g["status"]["word"] for g in body["groups"]] == ["Broken", "Tested"]
    broken = body["groups"][0]["rules"][0]
    assert broken["shown_key"] == "H-0003" and broken["status"]["shape"] == "failed"
    assert (broken["passed"], broken["failed"], broken["screen_key"]) == (1, 1, "SC-0001")
    assert {"value": "tested", "label": "Tested 1"} in body["statuses"]
    assert body["export"]["zip"] == f"/rules/export.zip?portal={P}"
    only = client(empty_store).get(f"{API}?status=tested").json()
    assert only["status"] == "tested" and [g["status"]["word"] for g in only["groups"]] == [
        "Tested"
    ]


def test_a_rule_has_its_table_tests_and_history(empty_store: Store) -> None:
    seed(empty_store)
    seed_table_rule(empty_store)
    c = client(empty_store)
    r = c.get(f"{API}/H-0003").json()
    t = r["table"]
    assert t["hit_policy"] == "First match" and len(t["inputs"]) == 1
    assert t["rows"][0]["cells"] == [{"cond": "< 18", "any": False}]
    assert t["rows"][1]["screen"] == "SC-0003" and t["rows"][1]["is_screen"]
    assert t["rows"][1]["result"] is None
    assert [x["verdict"]["word"] for x in r["tests"]] == ["Pass", "Fail"]
    assert r["tests"][0]["inputs"][0].endswith("= 17")
    person = r["history"][0]
    assert person["actor"] == "Anna" and person["by_person"] and person["mark"] == "failed"
    assert not r["history"][1]["by_person"]
    assert r["files"][0]["value"] == f"/rules/export/H-0003.md?portal={P}"
    assert not r["changed"] and not r["uncited"]
    assert c.get(f"{API}/H-0404").status_code == 404


def test_a_documented_rule_goes_by_its_business_rule_key(empty_store: Store) -> None:
    seed(empty_store)
    seed_table_rule(empty_store)
    conn = empty_store.connect()
    add_session(conn, "sess-1", portal=P)
    add_record(
        conn,
        "BR-009",
        "Drivers under 18 cannot buy",
        [{"evidence": [("hypothesis", "h3", None, "the mined rule")]}],
        portal=P,
    )
    conn.commit()
    conn.close()
    c = client(empty_store)
    listed = c.get(API).json()["groups"][0]["rules"][0]
    assert listed["shown_key"] == "BR-009" and listed["key"] == "H-0003"
    by_br = c.get(f"{API}/BR-009").json()
    assert by_br["br_key"] == "BR-009" and by_br["doc_href"] == f"/docs/{P}/BR-009"


def test_the_export_gives_the_rules_markdown_or_why_not(
    empty_store: Store,
    fake_export: list[str],  # noqa: F811
) -> None:
    seed(empty_store)
    c = client(empty_store)
    assert c.get(f"{API}/BR-001/export").json() == {"markdown": MD, "error": None}
    assert c.get(f"{API}/H-0009/export").json() == {"markdown": None, "error": None}


def test_a_rule_is_reworded_through_the_chat_service(empty_store: Store) -> None:
    seed(empty_store)
    seed_table_rule(empty_store)
    service = Service()
    service.routes[("POST", f"/portals/{P}/model/reword")] = httpx2.Response(
        201, json={"reworded": "H-0003"}
    )
    with chat_client(empty_store, service) as c:
        assert c.get(f"{API}/H-0003").json()["writes"]
        ok = c.post(
            f"{API}/H-0003/reword",
            json={"wording": "Drivers under 18 are refused.", "reason": " "},
            headers=ORIGIN,
        )
        empty = c.post(f"{API}/H-0003/reword", json={"wording": " "}, headers=ORIGIN)
        foreign = c.post(f"{API}/H-0003/reword", json={"wording": "x"})
    assert ok.json()["ok"] and ok.json()["message"].startswith("Reworded")
    assert empty.status_code == 422 and foreign.status_code == 403
    (sent,) = [json.loads(q.content) for q in service.requests if q.url.path.endswith("/reword")]
    assert sent == {"key": "H-0003", "wording": "Drivers under 18 are refused.", "by": "Anna"}
