"""The Processes workspace pages (spec 022 M5, screens 04–06): the list with suggestions and
screens in no process, the model editor with the reviewer's draft, the conflict notice, Compare
with the generated change spec, the Markdown export, and the signed forwarder."""

from __future__ import annotations

import json

import httpx2
from fastapi.testclient import TestClient

from pathfinder_dashboard.app import create_app
from pathfinder_dashboard.settings import Settings

from .conftest import Store, insert, ts
from .test_chat import ORIGIN, Service, text

P = "liveinsurer"


def step(sid: str, title: str, route: str, state: str | None, frm: list[str] | None = None) -> dict:
    return {
        "id": sid,
        "title": title,
        "route": route,
        "state_id": state,
        "screen_id": None,
        "observed": state is not None,
        "from": frm or [],
        "annotations": [],
    }


A1 = [
    step("s1", "Home", "/", "st-home"),
    step("s2", "Car", "/car", "st-car"),
    step("s3", "Driver", "/driver", "st-driver"),
]
B1 = [{**s, "from": [s["id"]]} for s in A1]
DRAFT = [
    B1[0],
    step("m1", "One form", "/quote", None, ["s2", "s3"]),
    step("n1", "Offer", "/offer", None),
]


def seed(store: Store, *, draft_base: int = 1, b_rev: int = 1) -> Store:
    conn = store.connect()
    insert(conn, "runs", id="run-p1", portal_id=P, started_at=ts(1))
    for sid, title, route in (
        ("st-home", "Home", "/"),
        ("st-car", "Car", "/car"),
        ("st-driver", "Driver", "/driver"),
        ("st-faq", "FAQ", "/faq"),
    ):
        insert(
            conn,
            "states",
            id=sid,
            portal_id=P,
            title=title,
            route_template=route,
            fingerprint=f"fp-{sid}",
            cluster_id=f"c-{sid}",
            first_seen_run="run-p1",
        )
    insert(
        conn,
        "ba_processes",
        id="pr-1",
        portal_id=P,
        key="PRC-001",
        name="Quote",
        persona="guest",
        stage="to_be_design",
        rev=1,
        source="new",
        scope_id=None,
        suggestion_id=None,
        created_at=ts(2),
        updated_at=ts(2),
    )
    insert(
        conn,
        "ba_process_revisions",
        process_id="pr-1",
        rev=1,
        base_rev=None,
        change="create",
        author="BA",
        name="Quote",
        stage="to_be_design",
        created_at=ts(2),
    )
    insert(
        conn,
        "process_models",
        id="v-a",
        process_id="pr-1",
        label="A",
        kind="as_is",
        rev=1,
        branched_from_model_id=None,
        branched_from_rev=None,
        created_at=ts(2),
    )
    insert(
        conn,
        "process_model_revisions",
        model_id="v-a",
        rev=1,
        base_rev=None,
        change="create",
        author="BA",
        steps=json.dumps(A1),
        note=None,
        run_id=None,
        restored_from=None,
        created_at=ts(2),
    )
    insert(
        conn,
        "process_models",
        id="v-b",
        process_id="pr-1",
        label="B",
        kind="to_be",
        rev=b_rev,
        branched_from_model_id="v-a",
        branched_from_rev=1,
        created_at=ts(3),
    )
    for rev in range(1, b_rev + 1):
        insert(
            conn,
            "process_model_revisions",
            model_id="v-b",
            rev=rev,
            base_rev=None if rev == 1 else rev - 1,
            change="branch" if rev == 1 else "save",
            author="Bob" if rev > 1 else "Anna",
            steps=json.dumps(B1),
            note=None,
            run_id=None,
            restored_from=None,
            created_at=ts(3 + rev),
        )
    insert(
        conn,
        "process_drafts",
        model_id="v-b",
        author="Anna",
        base_rev=draft_base,
        steps=json.dumps(DRAFT),
        updated_at=ts(9),
    )
    insert(
        conn,
        "process_live",
        id="lv-1",
        process_id="pr-1",
        environment="sandbox",
        model_id="v-a",
        model_rev=1,
        author="Anna",
        reason=None,
        created_at=ts(5),
    )
    insert(
        conn,
        "grouping_suggestions",
        id="sg-1",
        portal_id=P,
        name="Help pages",
        persona="guest",
        steps=json.dumps([step("s1", "FAQ", "/faq", "st-faq")]),
        why='menu link "FAQ"',
        screens_key="st-faq",
        status="open",
        conversation_id=None,
        process_id=None,
        decided_by=None,
        decided_at=None,
        created_at=ts(6),
    )
    conn.commit()
    conn.close()
    return store


def client(
    store: Store, service: Service | None = None, reviewer: str | None = "Anna"
) -> TestClient:
    settings = Settings(
        data_dir=store.data_dir, default_env=store.env, ui_salvage="all", reviewer=reviewer
    )
    return TestClient(
        create_app(settings, chat_transport=httpx2.MockTransport(service or Service()))
    )


def test_list_shows_processes_suggestions_and_loose_screens(empty_store: Store) -> None:
    with client(seed(empty_store)) as c:
        body = c.get(f"/processes?portal={P}").text
    flat = text(body)
    assert "Your processes · 1" in flat and "Quote" in flat and "To-be in design" in flat
    assert "A r1" in flat and "B r1" in flat and "Draft open" in flat
    assert 'data-process="/chat/portals/liveinsurer/suggestions/sg-1/accept"' in body
    assert 'data-process="/chat/portals/liveinsurer/suggestions/sg-1/dismiss"' in body
    assert "Why: menu link" in flat
    assert "In no process · 1 screens" in flat and 'value="st-faq"' in body


def test_a_suggestion_can_be_split_or_merged_with_another(empty_store: Store) -> None:
    """Spec 039 T079 (v2-09): Split before a step, Merge with another open suggestion."""
    seed(empty_store)
    conn = empty_store.connect()
    insert(
        conn, "grouping_suggestions", id="sg-2", portal_id=P, name="Quote again", persona="guest",
        steps=json.dumps([step("s1", "Home", "/", "st-home"), step("s2", "FAQ", "/faq", "st-x")]),
        why="form continues", screens_key="st-home,st-x", status="open", conversation_id=None,
        process_id=None, decided_by=None, decided_at=None, created_at=ts(6),
    )  # fmt: skip
    conn.commit()
    conn.close()
    service = Service()
    service.routes[("POST", "/portals/liveinsurer/suggestions/sg-2/split")] = httpx2.Response(
        201, json=[]
    )
    with client(empty_store, service) as c:
        body = c.get(f"/processes?portal={P}").text
        split = c.post(
            "/chat/portals/liveinsurer/suggestions/sg-2/split", json={"at": "2"}, headers=ORIGIN
        )
    assert 'data-process="/chat/portals/liveinsurer/suggestions/sg-2/split"' in body
    assert 'data-from="#split-sg-2"' in body and '<option value="2">step 2 · /faq</option>' in body
    assert 'data-process="/chat/portals/liveinsurer/suggestions/sg-1/merge"' in body
    assert '<option value="sg-2">Quote again</option>' in body
    assert body.count('id="split-') == 1  # a one-screen suggestion cannot be split
    assert split.status_code == 201
    sent = [r for r in service.requests if r.url.path.endswith("/split")]
    assert json.loads(sent[0].content) == {"at": "2", "author": "Anna"}


def test_process_links_name_their_portal(empty_store: Store) -> None:
    """Owner 2026-10-15 (spec 029): a process key is per portal, so its links say which portal;
    a second tab on another portal still opens the right process."""
    with client(seed(empty_store)) as c:
        body = c.get(f"/processes?portal={P}").text
        c.cookies.set("pf_portal", "other")
        opened = c.get(f"/processes/PRC-001?portal={P}")
    assert f'href="/processes/PRC-001?portal={P}"' in body
    assert opened.status_code == 200


def test_editor_shows_the_reviewers_draft_against_the_as_is(empty_store: Store) -> None:
    with client(seed(empty_store)) as c:
        body = c.get(f"/processes/PRC-001?portal={P}&model=B&step=m1").text
    flat = text(body)
    assert "Save as B r2" in flat and "only you see this draft" in flat
    assert "One form" in flat and "merges 2 steps" in flat and "Designed, not observed" in flat
    assert "Merged" in flat and "Added" in flat and "Unchanged" in flat
    assert "Removed from A" not in flat  # s2 and s3 are merged, nothing is dropped
    assert "Built from" in flat and "Car" in flat and "Driver" in flat
    assert (
        'data-step-op="annotate"' in body
        and 'data-draft="/chat/portals/liveinsurer/processes/pr-1/models/B/draft"' in body
    )
    assert json.loads(body.split('id="process-steps">')[1].split("</script>")[0]) == DRAFT
    assert body.count("sy-btn--primary") == 1


def test_a_draft_on_an_old_base_shows_someone_saved_first(empty_store: Store) -> None:
    with client(seed(empty_store, draft_base=1, b_rev=2)) as c:
        body = c.get(f"/processes/PRC-001?portal={P}&model=B").text
    flat = text(body)
    assert (
        "Someone saved first" in flat
        and "B r2 was saved while your draft was based on B r1" in flat
    )
    assert 'data-process="/chat/portals/liveinsurer/processes/pr-1/models/B/rebase"' in body
    assert "Save as" not in flat


def test_the_as_is_is_edited_by_screen_and_drawing_needs_a_reviewer(empty_store: Store) -> None:
    """Spec 027: A is changed by screens (reorder, remove, add; one A revision each), never by
    the to-be draft operations; without a reviewer nothing can be changed. On `to_be_design`
    the page leads with the to-be (US2.3)."""
    store = seed(empty_store)
    with client(store) as c:
        a = c.get(f"/processes/PRC-001?portal={P}&model=A").text
        lead = c.get(f"/processes/PRC-001?portal={P}").text
    with client(store, reviewer=None) as c:
        b = c.get(f"/processes/PRC-001?portal={P}&model=B").text
        a_unsigned = c.get(f"/processes/PRC-001?portal={P}&model=A").text
        missing = c.get(f"/processes/PRC-999?portal={P}")
    assert "data-step-op" not in a and 'data-a-op="remove"' in a and 'data-a-op="add"' in a
    assert 'data-edit="/chat/portals/liveinsurer/processes/pr-1/models/A/edit"' in a
    assert "Live in sandbox:" in text(a)
    assert "B · To-be r1" in text(lead)
    assert "Drawing is off" in text(b) and "data-step-op" not in b
    assert "data-a-op" not in a_unsigned
    assert missing.status_code == 404


def test_compare_diffs_the_draft_and_generates_the_change_spec(empty_store: Store) -> None:
    with client(seed(empty_store)) as c:
        body = c.get(f"/processes/PRC-001/compare?portal={P}&left=A&right=B").text
        md = c.get(f"/processes/PRC-001/spec.md?portal={P}&left=A&right=B")
    flat = text(body)
    assert "your draft" in flat and "Merged" in flat and "2 steps into 1" in flat
    assert "Merge Car (/car), Driver (/driver) into One form (/quote)" in body
    assert "Add Offer (/offer)" in body
    assert 'data-process-form="spec"' in body and "Save spec as r1" in flat
    assert md.status_code == 200 and "attachment" in md.headers["content-disposition"]
    assert "## Delta" in md.text and "- Add Offer (/offer)" in md.text


def test_the_forwarder_signs_and_only_reaches_process_routes(empty_store: Store) -> None:
    service = Service()
    route = ("POST", "/portals/liveinsurer/processes/pr-1/models/B/save")
    service.routes[route] = httpx2.Response(201, json={"model": {"rev": 2}})
    with client(seed(empty_store), service) as c:
        ok = c.post(
            "/chat/portals/liveinsurer/processes/pr-1/models/B/save",
            json={"base_rev": 1},
            headers=ORIGIN,
        )
        odd = c.post("/chat/portals/liveinsurer/conversations/x", json={}, headers=ORIGIN)
        foreign = c.post("/chat/portals/liveinsurer/processes/pr-1/models/B/save", json={})
    assert ok.status_code == 201
    sent = [r for r in service.requests if r.url.path.endswith("/save")]
    assert json.loads(sent[0].content) == {"base_rev": 1, "author": "Anna"}
    assert odd.status_code == 404 and foreign.status_code == 403
    with client(empty_store, service, reviewer=None) as c:
        unsigned = c.post("/chat/portals/liveinsurer/processes", json={}, headers=ORIGIN)
    assert unsigned.status_code == 422
