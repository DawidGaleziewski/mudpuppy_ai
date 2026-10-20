"""Processes, as-is first (spec 027): pictures on the screen picker, A as documentation per step,
the sign-off and "changed since documented", archive and restore, and "Open in Processes" from a
BA process record. Seeds on the Processes pages' store (test_processes_pages.seed)."""

from __future__ import annotations

import json

import httpx2

from .conftest import Store, add_record, add_session, insert, ts
from .test_chat import ORIGIN, Service, text
from .test_processes_pages import A1, P, client, seed


def _as_documented(store: Store, *, signed_rev: int, head_rev: int) -> None:
    """Move PRC-001 to as_is_documented, signed for A r`signed_rev`, with A at r`head_rev`."""
    conn = store.connect()
    conn.execute("UPDATE ba_processes SET stage = 'as_is_documented', rev = 2 WHERE id = 'pr-1'")
    insert(
        conn,
        "ba_process_revisions",
        process_id="pr-1",
        rev=2,
        base_rev=1,
        change="stage",
        author="Anna",
        name="Quote",
        stage="as_is_documented",
        as_is_rev=signed_rev,
        created_at=ts(10),
    )
    for rev in range(2, head_rev + 1):
        insert(
            conn,
            "process_model_revisions",
            variant_id="v-a",
            rev=rev,
            base_rev=rev - 1,
            change="observe",
            author="scan:run-p1",
            steps=json.dumps(A1),
            note=None,
            run_id="run-p1",
            restored_from=None,
            created_at=ts(10 + rev),
        )
    conn.execute("UPDATE process_models SET rev = ? WHERE id = 'v-a'", (head_rev,))
    conn.commit()
    conn.close()


def _record(store: Store) -> None:
    """A requirement citing the car screen, a draft open question citing the driver screen."""
    conn = store.connect()
    add_session(conn, "sess-1", portal=P)
    for key, title, state, status in (
        ("REQ-001", "Car needs a plate", "st-car", "confirmed"),
        ("OQ-001", "Is the driver optional?", "st-driver", "draft"),
    ):
        evidence = [("state", state, "run-p1", None)]
        add_record(conn, key, title, [{"status": status, "evidence": evidence}], portal=P)
    conn.commit()
    conn.close()


def test_the_picker_shows_pictures_and_steps_in_tick_order(empty_store: Store) -> None:
    with client(seed(empty_store)) as c:
        body = c.get(f"/processes?portal={P}").text
    assert "data-picture" in body and 'data-shot="" data-wire=""' in body
    assert "No picture" in body
    assert 'href="/states/st-faq' in body  # without JavaScript the thumbnail opens the screen
    assert 'id="picture-dialog"' in body and 'data-picture-view="wire"' in body
    assert "data-picked" in body and "Steps of the new process" in text(body)
    assert "/static/js/pictures.js" in body


def test_a_reads_as_documentation_per_step(empty_store: Store) -> None:
    store = seed(empty_store)
    _record(store)
    with client(store) as c:
        body = c.get(f"/processes/PRC-001?portal={P}&variant=A&step=s2").text
    flat = text(body)
    assert "As-is documentation" in flat
    assert "Still open on these screens: 1 open question · 0 records to confirm" in flat
    assert 'href="/docs/liveinsurer/REQ-001' in body and 'href="/docs/liveinsurer/OQ-001' in body
    assert "Step 2 of A" in flat and "Requirements · 1" in flat and "Car needs a plate" in flat
    assert "Nothing documented on this screen yet" in flat  # the home screen
    assert "Mark as-is documented" not in flat  # stage to_be_design: no sign-off offered
    assert 'id="stage-select"' in body


def test_sign_off_and_changed_since_documented(empty_store: Store) -> None:
    store = seed(empty_store)
    conn = store.connect()
    conn.execute("UPDATE ba_processes SET stage = 'scoped' WHERE id = 'pr-1'")
    conn.commit()
    conn.close()
    with client(store) as c:
        scoped = c.get(f"/processes/PRC-001?portal={P}").text
    assert "Mark as-is documented" in text(scoped)
    assert '"stage": "as_is_documented", "base_rev": 1' in scoped
    assert scoped.count("sy-btn--primary") == 1
    assert "A · As-is r1" in text(scoped)  # US2.3: the page leads with A while scoped

    _as_documented(store, signed_rev=1, head_rev=3)
    with client(store) as c:
        changed = text(c.get(f"/processes/PRC-001?portal={P}&variant=A").text)
    assert "Signed off as documented by Anna" in changed and "covering A r1" in changed
    assert "As-is changed since documented" in changed and "A r1 → r3" in changed
    assert "Sign off A r3" in changed


def test_archive_hides_a_process_and_restore_brings_it_back(empty_store: Store) -> None:
    store = seed(empty_store)
    with client(store) as c:
        page = c.get(f"/processes/PRC-001?portal={P}").text
    assert 'data-process="/chat/portals/liveinsurer/processes/pr-1/archive"' in page
    conn = store.connect()
    conn.execute("UPDATE ba_processes SET archived_at = ? WHERE id = 'pr-1'", (ts(20),))
    conn.commit()
    conn.close()
    with client(store) as c:
        listed = text(c.get(f"/processes?portal={P}").text)
        archived = c.get(f"/processes?portal={P}&show=archived").text
        page = c.get(f"/processes/PRC-001?portal={P}").text
    assert "Your processes · 0" in listed and "Archived · 1" in listed
    assert "In no process · 4 screens" in listed  # its screens are loose again
    assert "Archived processes · 1" in text(archived) and "Quote" in text(archived)
    assert 'data-process="/chat/portals/liveinsurer/processes/pr-1/unarchive"' in archived
    assert "Archived" in text(page) and "/unarchive" in page and '/archive"' not in page


def test_a_process_record_opens_in_processes(empty_store: Store) -> None:
    store = seed(empty_store)
    conn = store.connect()
    add_session(conn, "sess-1", portal=P)
    add_record(conn, "PROC-001", "Get a quote", [{}], portal=P, content={"persona": "guest"})
    conn.commit()
    conn.close()
    with client(store) as c:
        before = c.get(f"/docs/{P}/PROC-001").text
    assert 'data-process="/chat/portals/liveinsurer/processes/from-record"' in before
    assert '"record_key": "PROC-001"' in before and "Open in Processes" in text(before)
    conn = store.connect()
    conn.execute("UPDATE ba_processes SET record_key = 'PROC-001' WHERE id = 'pr-1'")
    conn.commit()
    conn.close()
    with client(store) as c:
        after = c.get(f"/docs/{P}/PROC-001").text
        process = text(c.get(f"/processes/PRC-001?portal={P}").text)
    assert "In Processes as PRC-001" in text(after) and "Open in Processes" not in text(after)
    assert "documented as PROC-001" in process


def test_the_forwarder_reaches_the_spec_027_routes(empty_store: Store) -> None:
    service = Service()
    for path in (
        "/portals/liveinsurer/processes/pr-1/archive",
        "/portals/liveinsurer/processes/pr-1/unarchive",
        "/portals/liveinsurer/processes/pr-1/variants/A/edit",
        "/portals/liveinsurer/processes/from-record",
    ):
        service.routes[("POST", path)] = httpx2.Response(200, json={})
    with client(seed(empty_store), service) as c:
        codes = [
            c.post(f"/chat{path}", json={"base_rev": 1}, headers=ORIGIN).status_code
            for path in (
                "/portals/liveinsurer/processes/pr-1/archive",
                "/portals/liveinsurer/processes/pr-1/unarchive",
                "/portals/liveinsurer/processes/pr-1/variants/A/edit",
                "/portals/liveinsurer/processes/from-record",
            )
        ]
    assert codes == [200, 200, 200, 200]
    assert all(json.loads(r.content)["author"] == "Anna" for r in service.requests)
