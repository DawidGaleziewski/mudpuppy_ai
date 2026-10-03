"""Docs read queries (spec 004 T053) against the `ba_fixture` store."""

from __future__ import annotations

import sqlite3

import pytest

from pathfinder_dashboard import db
from pathfinder_dashboard import queries_docs as q

from .conftest import Store

PORTAL = "reference-insurer"


@pytest.fixture
def conn(ba_fixture: Store) -> sqlite3.Connection:
    return db.connect(ba_fixture.data_dir, ba_fixture.env)


def keys(page) -> list[str]:
    return [r.record.key for r in page.items]


def test_portal_list_counts_by_status(conn: sqlite3.Connection) -> None:
    (p,) = q.doc_portals(conn)
    assert p.portal_id == PORTAL
    assert p.records == 14
    assert p.by_status["withdrawn"] == 1 and p.by_status["rejected"] == 1
    assert p.by_status["confirmed"] == 1  # CAP-001; REQ-001 is confirmed only at rev 1
    assert p.by_status["draft"] == 11
    assert p.sessions == 2 and p.last_session_at == "2026-09-25T20:00:00.000Z"
    assert p.open_followups == 0  # the only follow-up is blocked


def test_no_docs_tables_or_records_gives_empty_list(empty_store: Store) -> None:
    c = db.connect(empty_store.data_dir, empty_store.env)
    assert q.doc_portals(c) == []
    assert not q.portal_known(c, PORTAL)


def test_section_counts_and_listing_order(conn: sqlite3.Connection) -> None:
    counts = q.section_counts(conn, PORTAL)
    assert counts["processes"] == 3 and counts["requirements"] == 1
    assert counts["overview"] == 14 and counts["traceability"] == 4  # REQ, BR, NFR, UC
    page = q.list_records(conn, PORTAL, q.SECTION_KINDS["processes"])
    assert keys(page) == ["PROC-001", "PROC-002", "UC-001"]  # (kind, seq)


def test_filters_status_confidence_flag_kind(conn: sqlite3.Connection) -> None:
    kinds = q.SECTION_KINDS["traceability"]
    assert keys(q.list_records(conn, PORTAL, kinds, status="rejected")) == ["BR-001"]
    assert keys(q.list_records(conn, PORTAL, kinds, confidence="inferred")) == ["REQ-001"]
    assert keys(q.list_records(conn, PORTAL, kinds, kind="use_case")) == ["UC-001"]
    all_kinds = tuple(q.DOC_KINDS)
    assert keys(q.list_records(conn, PORTAL, all_kinds, flag="not_observable")) == [
        "ASM-001",
        "PROC-001",
    ]
    flagged = keys(q.list_records(conn, PORTAL, all_kinds, flag="open_question"))
    # PROC-001 relates to OQ-001 both ways; REQ-001 and OQ-001 cite a crawler open_question
    assert flagged == ["OQ-001", "PROC-001", "REQ-001"]
    assert q.list_records(conn, PORTAL, kinds, status="withdrawn").total == 0
    assert keys(q.list_records(conn, PORTAL, ("glossary_term",), status="withdrawn")) == ["GL-001"]


def test_keyset_pagination(conn: sqlite3.Connection) -> None:
    kinds = tuple(q.DOC_KINDS)
    first = q.list_records(conn, PORTAL, kinds, limit=5)
    assert first.total == 14 and len(first.items) == 5 and first.next_cursor
    seen = keys(first)
    cursor = first.next_cursor
    while cursor:
        page = q.list_records(conn, PORTAL, kinds, cursor=cursor, limit=5)
        seen += keys(page)
        cursor = page.next_cursor
    assert len(seen) == 14 and len(set(seen)) == 14


def test_record_detail_revisions_links_relations_reviews(conn: sqlite3.Connection) -> None:
    d = q.record_detail(conn, PORTAL, "REQ-001")
    assert d is not None
    assert d.status == "draft" and d.shown.rev_no == 2 and d.is_latest
    assert d.record.confirmed_rev == 1
    assert [h.revision.rev_no for h in d.history] == [2, 1]
    assert [r.action for r in d.history[1].reviews] == ["confirm"]
    assert {(r.type, r.key) for r in d.relations_out} == {
        ("refines", "CAP-001"),
        ("appears_on", "SCR-002"),
    }
    assert {(r.type, r.key) for r in d.relations_in} == {("enforces", "BR-001")}
    assert d.session_started_at == "2026-09-25T20:00:00.000Z"
    old = q.record_detail(conn, PORTAL, "REQ-001", rev=1)
    assert old is not None and old.shown.rev_no == 1 and not old.is_latest
    assert old.status == "confirmed" and len(old.evidence) == 1
    assert q.record_detail(conn, PORTAL, "REQ-001", rev=9).shown.rev_no == 2  # unknown rev: latest
    assert q.record_detail(conn, PORTAL, "REQ-404") is None
    assert q.record_detail(conn, "other-portal", "REQ-001") is None


def test_withdrawn_rejected_and_followup_states(conn: sqlite3.Connection) -> None:
    assert q.record_detail(conn, PORTAL, "GL-001").status == "withdrawn"
    br = q.record_detail(conn, PORTAL, "BR-001")
    assert br.status == "rejected"
    assert br.history[0].reviews[0].text == "Not evidenced: only a hint was seen"
    fup = q.record_detail(conn, PORTAL, "FUP-001")
    assert fup.followup is not None and fup.followup.status == "blocked"


def test_resolved_evidence_carries_run_mode_date_and_flags_broken(conn: sqlite3.Connection) -> None:
    d = q.record_detail(conn, PORTAL, "REQ-001")
    by_kind = {(e.link.target_kind, e.link.target_id): e for e in d.evidence}
    form = by_kind[("form", "form-vehicle")]
    assert form.resolved and not form.broken and form.run_mode == "map"
    assert form.run_started_at == "2026-09-25T19:10:00.000Z" and form.tab == "forms"
    assert by_kind[("action", "act-calc")].label == 'button "Oblicz składkę"'
    assert by_kind[("network_call", "net-quote")].tab == "network"
    assert by_kind[("decision", "dec-1")].tab == "decisions"
    step = by_kind[("process_step", "step-2")]
    assert (
        step.label == "step 2: Enter the car model"
        and step.run_mode == "trace"
        and step.tab == "process"
    )
    doc = by_kind[("doc_record", "rec-SCR-002")]
    assert doc.doc_key == "SCR-002" and doc.link.run_id is None and doc.tab is None
    broken = by_kind[("state", "st-deleted")]
    assert broken.broken and not broken.resolved and broken.link.note


def test_process_evidence_resolves_to_the_process(conn: sqlite3.Connection) -> None:
    d = q.record_detail(conn, PORTAL, "PROC-001")
    kinds = {e.link.target_kind: e for e in d.evidence}
    assert kinds["process"].resolved and kinds["process"].label == "Buy a car policy"


def test_run_to_citing_records(conn: sqlite3.Connection) -> None:
    assert q.run_citing_count(conn, "run-trace") == 2  # REQ-001 (step) and PROC-001
    page = q.run_citing_records(conn, "run-trace")
    assert sorted(keys_of(page)) == ["PROC-001", "REQ-001"]
    req = next(c for c in page.items if c.row.record.key == "REQ-001")
    assert [(c.target_kind, c.target_id) for c in req.cites] == [("process_step", "step-2")]
    assert q.run_citing_count(conn, "run-map") == 13  # every record but PROC-001
    assert q.run_citing_records(conn, "no-such-run").total == 0


def keys_of(page) -> list[str]:
    return [c.row.record.key for c in page.items]


def test_session_detail(conn: sqlite3.Connection) -> None:
    s = q.session_detail(conn, PORTAL, "sess-2")
    assert s is not None and [r.id for r in s.runs] == ["run-map", "run-trace"]
    written = {r.record.key for r in s.written}
    assert {"REQ-001", "PROC-001"} <= written and "CAP-001" not in written
    assert s.changes["rec-REQ-001"] == "revise"
    s1 = q.session_detail(conn, PORTAL, "sess-1")
    assert s1.session.gaps_json == ["Login pages not observable"]
    assert q.session_detail(conn, PORTAL, "nope") is None
    assert q.session_detail(conn, "other", "sess-1") is None


def test_process_for_run_and_diagram_input(conn: sqlite3.Connection) -> None:
    process, steps = q.process_for_run(conn, "run-trace")
    assert process.outcome == "boundary_reached" and [s.ord for s in steps] == [1, 2, 3]
    assert q.process_for_run(conn, "run-map") is None
    assert q.process_step_count(conn, "run-trace") == 3
    d = q.record_detail(conn, PORTAL, "PROC-001")
    data = q.process_diagram_input(conn, d)
    assert data["process"]["key"] == "PROC-001" and len(data["steps"]) == 3
    assert data["boundary"]["action"] == 'button "Kup polisę"'
    assert (
        q.process_diagram_input(conn, q.record_detail(conn, PORTAL, "PROC-002")) is None
    )  # map_only


def test_capability_and_screen_diagram_inputs(conn: sqlite3.Connection) -> None:
    cap = q.capability_diagram_input(conn, PORTAL)
    assert {k["key"] for k in cap["capabilities"][0]["contains"]} == {"SCR-002", "PROC-001"}
    nav = q.screen_diagram_input(conn, PORTAL)
    assert [s["key"] for s in nav["screens"]] == ["SCR-001", "SCR-002"]
    assert nav["transitions"] == [{"from": "SCR-001", "to": "SCR-002", "label": "Oblicz składkę"}]


def test_store_without_process_tables_still_works(ba_fixture: Store) -> None:
    w = ba_fixture.connect()
    w.execute("DROP TABLE process_steps")
    w.execute("DROP TABLE processes")
    w.commit()
    c = db.connect(ba_fixture.data_dir, ba_fixture.env)
    assert q.process_for_run(c, "run-trace") is None and q.process_step_count(c, "run-trace") == 0
    d = q.record_detail(c, PORTAL, "PROC-001")
    kinds = {e.link.target_kind: e for e in d.evidence}
    assert not kinds["process"].broken and not kinds["process"].resolved
    assert q.process_diagram_input(c, d) is None


def test_screen_diagram_leaves_out_global_navigation(ba_fixture: Store) -> None:
    """A target reached from more than half of the screens (a global menu) is only counted."""
    from .conftest import add_record, insert

    w = ba_fixture.connect()
    for n in range(3, 9):  # SCR-003..008, one state each, every one linking to SCR-001 (the hub)
        insert(
            w,
            "states",
            id=f"st-x{n}",
            portal_id=PORTAL,
            first_seen_run="run-map",
            fingerprint=f"fp-x{n}",
            cluster_id=f"cl-x{n}",
        )
        add_record(
            w,
            f"SCR-00{n}",
            f"Screen {n}",
            [{"evidence": [("state", f"st-x{n}", "run-map", None)]}],
            content={"purpose": "p", "route_templates": ["/"], "elements": [], "entry_points": []},
        )
        insert(
            w,
            "edges",
            id=f"edge-x{n}",
            run_id="run-map",
            from_state=f"st-x{n}",
            to_state="st-home",
            action_json='{"accessible_name": "Start"}',
        )
    insert(
        w,
        "edges",
        id="edge-x-calc",
        run_id="run-map",
        from_state="st-x3",
        to_state="st-calc",
        action_json='{"accessible_name": "Calculator"}',
    )
    w.commit()
    c = db.connect(ba_fixture.data_dir, ba_fixture.env)
    nav = q.screen_diagram_input(c, PORTAL)
    assert nav["omitted"] == 6  # the six links into the hub SCR-001
    pairs = {(t["from"], t["to"]) for t in nav["transitions"]}
    assert ("SCR-003", "SCR-002") in pairs and not any(t == "SCR-001" for _, t in pairs)
