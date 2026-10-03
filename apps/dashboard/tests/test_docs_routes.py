"""Docs tab pages and fragments (spec 004 T055, contracts/http-routes-docs.md)."""

from __future__ import annotations

import re

import pytest
from fastapi.testclient import TestClient

from .conftest import Store, add_record, add_session, insert, make_client

P = "reference-insurer"


def text(html: str) -> str:
    """Visible text at rest: glossary tooltips (hidden tip + [?] mark) are left out."""
    html = re.sub(r'<a class="gl-mark"[^>]*>.*?</a><span class="gl-tip"[^>]*>.*?</span>', "", html)
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", html))


@pytest.fixture
def reviewer_client(ba_fixture: Store):
    with make_client(ba_fixture, reviewer="Test Reviewer") as c:
        yield c


ALL_PAGES = [
    "/docs",
    f"/docs/{P}",
    *(
        f"/docs/{P}?section={s}"
        for s in (
            "capabilities",
            "screens",
            "processes",
            "requirements",
            "rules",
            "data",
            "glossary",
            "nfr",
            "assumptions",
            "questions",
            "followups",
            "traceability",
        )
    ),
    f"/docs/{P}/sessions/sess-2",
    *(
        f"/docs/{P}/{k}"
        for k in (
            "CAP-001",
            "SCR-001",
            "SCR-002",
            "PROC-001",
            "PROC-002",
            "UC-001",
            "REQ-001",
            "NFR-001",
            "BR-001",
            "GL-001",
            "DI-001",
            "ASM-001",
            "OQ-001",
            "FUP-001",
        )
    ),
    f"/docs/{P}/REQ-001?rev=1",
    "/fragments/docs/portals",
    f"/fragments/docs/{P}/index",
    f"/fragments/docs/{P}/section/requirements",
    f"/fragments/docs/{P}/section/overview",
    f"/fragments/docs/{P}/sessions/sess-1",
    f"/fragments/docs/{P}/REQ-001/header",
    f"/fragments/docs/{P}/REQ-001/body",
    f"/fragments/docs/{P}/REQ-001/reviews",
    "/fragments/runs/run-map/docs",
    "/fragments/runs/run-trace/process",
    "/runs/run-map?tab=docs",
    "/runs/run-trace?tab=process",
]


@pytest.mark.parametrize("url", ALL_PAGES)
def test_every_page_and_fragment_renders(ba_client: TestClient, url: str) -> None:
    r = ba_client.get(url)
    assert r.status_code == 200, url
    assert r.headers["cache-control"] == "no-store"


def test_fragments_are_live_regions(ba_client: TestClient) -> None:
    for url, region in (
        ("/docs", "region-docs-portals"),
        (f"/docs/{P}", "region-docs-index"),
        (f"/docs/{P}", "region-docs-section"),
        (f"/docs/{P}/REQ-001", "region-doc-header"),
        (f"/docs/{P}/REQ-001", "region-doc-body"),
        (f"/docs/{P}/REQ-001", "region-reviews"),
        (f"/docs/{P}/sessions/sess-1", "region-docs-session"),
        ("/runs/run-map?tab=docs", "region-docs"),
    ):
        html = ba_client.get(url).text
        assert f'id="{region}"' in html, (url, region)
    html = ba_client.get(f"/docs/{P}/REQ-001").text
    assert 'hx-trigger="store-changed' in html


def test_nav_has_docs_tab(ba_client: TestClient) -> None:
    html = ba_client.get("/docs").text
    assert re.search(r'<a href="/docs" aria-current="page">Docs</a>', html)
    assert '<a href="/docs">Docs</a>' in ba_client.get("/").text


# --- /docs and the portal index ---------------------------------------------------------------


def test_portal_picker_shows_counts_and_statuses(ba_client: TestClient) -> None:
    t = text(ba_client.get("/docs").text)
    assert P in t and "Records 14" in t.replace("  ", " ")
    assert "[DRFT]" in t and "[ OK ]" in t and "[RJCT]" in t and "[WDRN]" in t
    assert "2 analysis sessions" in t


def test_empty_state_when_no_records(empty_client: TestClient) -> None:
    r = empty_client.get("/docs")
    assert r.status_code == 200 and "No documentation written yet" in r.text
    assert empty_client.get("/docs/reference-insurer").status_code == 404


def test_section_index_counts_and_overview(ba_client: TestClient) -> None:
    html = ba_client.get(f"/docs/{P}").text
    t = text(html)
    for label in ("Overview", "Capabilities", "Processes and use cases", "Traceability"):
        assert label in t
    assert re.search(r"Processes and use cases\s+3\b", t)
    assert 'aria-current="page">Overview' in html
    assert "Login pages" not in t  # gaps live on the session page
    assert "summary of sess-2" in t


def test_unknown_section_falls_back_to_overview(ba_client: TestClient) -> None:
    assert 'aria-current="page">Overview' in ba_client.get(f"/docs/{P}?section=nope").text
    assert ba_client.get(f"/fragments/docs/{P}/section/nope").status_code == 404


def test_unknown_portal_is_404_everywhere(ba_client: TestClient) -> None:
    for url in (
        "/docs/nope",
        "/fragments/docs/nope/index",
        "/fragments/docs/nope/section/requirements",
    ):
        r = ba_client.get(url)
        assert r.status_code == 404 and "No portal “nope”" in r.text


def test_section_list_filters_push_url_and_reload(ba_client: TestClient) -> None:
    url = f"/fragments/docs/{P}/section/processes?kind=use_case&push=1"
    r = ba_client.get(url)
    assert "UC-001" in r.text and "PROC-001" not in r.text
    assert r.headers["hx-push-url"] == f"/docs/{P}?section=processes&kind=use_case"
    page = ba_client.get(f"/docs/{P}?section=processes&kind=use_case").text
    assert "UC-001" in page and "PROC-002" not in page
    assert 'value="use_case" selected' in page


def test_status_confidence_and_flag_filters(ba_client: TestClient) -> None:
    rej = ba_client.get(f"/docs/{P}?section=rules&status=rejected").text
    assert "BR-001" in rej and "[RJCT]" in rej
    flagged = text(ba_client.get(f"/docs/{P}?section=processes&flag=not_observable").text)
    assert "PROC-001" in flagged and "PROC-002" not in flagged and "not observable" in flagged
    inferred = ba_client.get(f"/docs/{P}?section=requirements&confidence=inferred").text
    assert "REQ-001" in inferred and "inferred" in inferred


def test_filtered_empty_state_and_unknown_filter_values_ignored(ba_client: TestClient) -> None:
    t = text(ba_client.get(f"/docs/{P}?section=requirements&status=rejected").text)
    assert "No requirements match these filters" in t
    ignored = ba_client.get(f"/docs/{P}?section=requirements&status=bogus").text
    assert "REQ-001" in ignored


def test_section_empty_state(ba_fixture: Store) -> None:
    w = ba_fixture.connect()
    w.execute("DELETE FROM doc_evidence_links WHERE revision_id LIKE 'NFR-%'")
    w.execute("DELETE FROM doc_revisions WHERE record_id = 'rec-NFR-001'")
    w.execute("DELETE FROM doc_records WHERE key = 'NFR-001'")
    w.commit()
    with make_client(ba_fixture) as c:
        assert "No non-functional documented yet" in text(c.get(f"/docs/{P}?section=nfr").text)


def test_traceability_matrix_lists_evidence_and_links(ba_client: TestClient) -> None:
    t = text(ba_client.get(f"/docs/{P}?section=traceability").text)
    assert "REQ-001" in t and "BR-001" in t and "UC-001" in t
    assert "CAP-001" in t and "SCR-002" in t  # REQ-001's linked records


def test_diagrams_on_capability_and_screen_sections(ba_client: TestClient) -> None:
    cap = ba_client.get(f"/docs/{P}?section=capabilities").text
    assert '<pre class="mermaid">flowchart TB' in cap and "subgraph CAP_001" in cap
    scr = ba_client.get(f"/docs/{P}?section=screens").text
    assert "flowchart LR" in scr and "SCR_001 --&gt;|&#34;Oblicz" in scr
    assert "/static/js/diagrams.js" in scr and "/static/js/diagrams.js" not in (
        ba_client.get("/").text
    )


# --- record page ------------------------------------------------------------------------------


def test_record_header_shows_every_fact(ba_client: TestClient) -> None:
    html = ba_client.get(f"/docs/{P}/REQ-001").text
    t = text(html)
    assert "REQ-001" in t and "Premium form requires the model" in t
    assert "[DRFT]" in t and "inferred" in t
    assert "2 of 2" in t and "confirmed at rev 1" in t
    assert f'href="/docs/{P}/sessions/sess-2"' in html


def test_requirement_content_rendered_with_gherkin(ba_client: TestClient) -> None:
    html = ba_client.get(f"/docs/{P}/REQ-001").text
    assert "The system shall require the field" in html
    assert "Given the calculator is open" in html and "Then the form reports an error" in html
    assert "Acceptance criteria" in html


def test_content_per_kind(ba_client: TestClient) -> None:
    uc = text(ba_client.get(f"/docs/{P}/UC-001").text)
    assert "Enter the model" in uc and "alternate flow 1" in uc and "Picks another model" in uc
    br = ba_client.get(f"/docs/{P}/BR-001").text
    assert "Decision table" in br and "if format" in br and "NN-NNN" in br
    gl = ba_client.get(f"/docs/{P}/GL-001").text
    assert 'lang="pl">Składka' in gl
    assert "Postal code" in ba_client.get(f"/docs/{P}/DI-001").text
    assert "All content is Polish" in ba_client.get(f"/docs/{P}/NFR-001").text
    assert "Reach the premium" in ba_client.get(f"/docs/{P}/FUP-001").text
    assert "What is behind the login?" in ba_client.get(f"/docs/{P}/OQ-001").text
    assert "Customers can renew online" in ba_client.get(f"/docs/{P}/ASM-001").text
    assert "Guests can calculate" in ba_client.get(f"/docs/{P}/CAP-001").text
    assert "Vehicle data" in ba_client.get(f"/docs/{P}/SCR-002").text


def test_badges_are_text_not_colour_alone(ba_client: TestClient) -> None:
    br = text(ba_client.get(f"/docs/{P}/BR-001").text)
    assert "[RJCT] rejected" in br and "Not evidenced: only a hint was seen" in br
    gl = text(ba_client.get(f"/docs/{P}/GL-001").text)
    assert "[WDRN] withdrawn" in gl
    proc = text(ba_client.get(f"/docs/{P}/PROC-001").text)
    assert "not observable" in proc
    fup = text(ba_client.get(f"/docs/{P}/FUP-001").text)
    assert "[BLKD] blocked" in fup and "mutating on production" in fup


def test_evidence_links_open_the_run_page_at_the_target(ba_client: TestClient) -> None:
    html = ba_client.get(f"/docs/{P}/REQ-001").text
    # SC-003: requirement page -> run page is one link, anchored on the target row
    assert 'href="/runs/run-map?tab=forms#form-vehicle"' in html
    assert 'href="/runs/run-map?tab=actions#act-calc"' in html
    assert 'href="/runs/run-map?tab=network#net-quote"' in html
    assert 'href="/runs/run-map?tab=decisions#dec-1"' in html
    assert 'href="/runs/run-trace?tab=process#step-2"' in html
    assert f'href="/docs/{P}/SCR-002"' in html  # doc_record target
    assert "field Model marked required" in html
    t = text(html)
    assert "map · 2026-09-25 19:10:00Z" in t and "trace · 2026-09-25 19:20:00Z" in t
    # the anchors exist on the run page
    assert 'id="form-vehicle"' in ba_client.get("/runs/run-map?tab=forms").text
    assert 'id="act-calc"' in ba_client.get("/runs/run-map?tab=actions").text
    assert 'id="step-2"' in ba_client.get("/runs/run-trace?tab=process").text
    assert 'id="dec-1"' in ba_client.get("/runs/run-map?tab=decisions").text
    assert 'id="net-quote"' in ba_client.get("/runs/run-map?tab=network").text
    assert 'id="st-calc"' in ba_client.get("/runs/run-map?tab=states").text


def test_broken_evidence_link_is_flagged_in_text(ba_client: TestClient) -> None:
    t = text(ba_client.get(f"/docs/{P}/REQ-001").text)
    assert "broken link" in t and "st-deleted" in t and "target removed by a portal delete" in t
    assert "[ ?? ]" in t


def test_relations_in_and_out(ba_client: TestClient) -> None:
    html = ba_client.get(f"/docs/{P}/REQ-001").text
    t = text(html)
    assert "this revision points to" in t and "points to this record" in t
    assert f'href="/docs/{P}/CAP-001"' in html and f'href="/docs/{P}/BR-001"' in html
    assert "refines" in t and "enforces" in t


def test_older_revision_via_rev_param(ba_client: TestClient) -> None:
    html = ba_client.get(f"/docs/{P}/REQ-001?rev=1").text
    t = text(html)
    assert "Showing revision 1 of 2" in t and "[view latest]" in t
    assert "[ OK ] confirmed" in t
    assert "form-vehicle" not in html  # rev 1 cites only the state
    assert "Added the form field evidence" in ba_client.get(f"/docs/{P}/REQ-001").text
    # an unknown revision falls back to the latest
    assert "of 2" in text(ba_client.get(f"/docs/{P}/REQ-001?rev=9").text)
    # fragments keep the revision, so a live refresh does not jump back to the latest
    hdr = ba_client.get(f"/fragments/docs/{P}/REQ-001/header?rev=1").text
    assert "Showing revision 1" in hdr and "rev=1" in hdr


def test_revision_history_lists_reviews_and_view_links(ba_client: TestClient) -> None:
    html = ba_client.get(f"/docs/{P}/REQ-001").text
    t = text(html)
    assert "Revision history 2" in t
    assert f'href="/docs/{P}/REQ-001?rev=1"' in html
    assert "[ OK ] confirm" in t and "Test Reviewer" in t


def test_process_record_has_a_process_map_diagram(ba_client: TestClient) -> None:
    html = ba_client.get(f"/docs/{P}/PROC-001").text
    assert '<pre class="mermaid">flowchart TD' in html
    assert "1. navigate: Open the calculator" in html and "boundary" in html
    assert "/static/js/diagrams.js" in html
    # a map-only process (never traced) has no diagram
    assert "mermaid" not in ba_client.get(f"/docs/{P}/PROC-002").text.replace("diagrams.js", "")


def test_unknown_record_is_404_page_and_fragment(ba_client: TestClient) -> None:
    for url in (f"/docs/{P}/REQ-404", f"/fragments/docs/{P}/REQ-404/header", "/docs/nope/REQ-001"):
        r = ba_client.get(url)
        assert r.status_code == 404 and "No record" in r.text, url
    assert ba_client.get(f"/fragments/docs/{P}/REQ-001/bogus").status_code == 404
    assert ba_client.get(f"/docs/{P}/sessions/nope").status_code == 404


def test_untrusted_strings_are_escaped(ba_fixture: Store) -> None:
    w = ba_fixture.connect()
    evil = '<script>alert("x")</script>'
    add_record(
        w,
        "REQ-002",
        evil,
        [{"evidence": [("state", "st-home", "run-map", evil)]}],
        content={"statement": evil, "priority": "must", "acceptance_criteria": []},
    )
    add_session(w, "sess-evil", runs=("run-map",), gaps=(evil,))
    w.commit()
    with make_client(ba_fixture) as c:
        for url in (
            f"/docs/{P}/REQ-002",
            f"/docs/{P}?section=requirements",
            f"/docs/{P}/sessions/sess-evil",
            "/runs/run-map?tab=docs",
        ):
            html = c.get(url).text
            assert "<script>alert" not in html, url
            assert "&lt;script&gt;" in html, url


def test_malformed_content_falls_back_to_json(ba_fixture: Store) -> None:
    w = ba_fixture.connect()
    w.execute("UPDATE doc_revisions SET content_json = '[1, 2]' WHERE id = 'CAP-001-r1'")
    w.execute(
        'UPDATE doc_revisions SET content_json = \'{"kind":"mystery","title":"t"}\''
        " WHERE id = 'SCR-001-r1'"
    )
    w.commit()
    with make_client(ba_fixture) as c:
        assert "unrecognised shape" in c.get(f"/docs/{P}/CAP-001").text
        assert "content (mystery)" in c.get(f"/docs/{P}/SCR-001").text


# --- session page -----------------------------------------------------------------------------


def test_session_page(ba_client: TestClient) -> None:
    html = ba_client.get(f"/docs/{P}/sessions/sess-2").text
    t = text(html)
    assert "summary of sess-2" in t and "[ OK ] completed" in t
    assert 'href="/runs/run-map"' in html and 'href="/runs/run-trace"' in html
    assert "processes" in t and "synthesis" in t
    assert "REQ-001" in t and "revise" in t and "PROC-001" in t
    s1 = text(ba_client.get(f"/docs/{P}/sessions/sess-1").text)
    assert "Login pages not observable" in s1 and "Gaps 1" in s1


def test_session_without_runs_passes_or_records_shows_empty_states(ba_fixture: Store) -> None:
    w = ba_fixture.connect()
    add_session(w, "sess-empty", portal=P, status="running", passes=(), started=90)
    w.commit()
    with make_client(ba_fixture) as c:
        t = text(c.get(f"/docs/{P}/sessions/sess-empty").text)
    assert "No input runs recorded" in t and "No pass completed yet" in t
    assert "This session has written no record" in t and "No gaps reported" in t
    assert "[RUN.]" in t


# --- run page: docs and process tabs ----------------------------------------------------------


def test_run_docs_tab_lists_citing_records(ba_client: TestClient) -> None:
    html = ba_client.get("/runs/run-map?tab=docs").text
    t = text(html)
    assert "Documentation citing this run 13" in t
    assert "REQ-001" in t and "[DRFT] draft" in t and "field Model marked required" in t
    assert f'href="/docs/{P}/REQ-001"' in html
    assert 'href="/runs/run-map?tab=forms#form-vehicle"' in html
    trace = text(ba_client.get("/runs/run-trace?tab=docs").text)
    assert "PROC-001" in trace and "REQ-001" in trace and "CAP-001" not in trace


def test_run_docs_tab_empty_state(ba_client: TestClient, ba_fixture: Store) -> None:
    w = ba_fixture.connect()
    insert(w, "runs", id="run-lonely", portal_id=P, status="completed")
    w.commit()
    t = text(ba_client.get("/runs/run-lonely?tab=docs").text)
    assert "No documentation cites this run" in t


def test_run_tabs_show_counts_and_process_only_for_trace_runs(ba_client: TestClient) -> None:
    trace = text(ba_client.get("/runs/run-trace").text)
    assert re.search(r"Process 3\b", trace) and re.search(r"Docs 2\b", trace)
    map_ = text(ba_client.get("/runs/run-map").text)
    assert re.search(r"Docs 13\b", map_) and "Process" not in map_


def test_run_process_tab(ba_client: TestClient) -> None:
    html = ba_client.get("/runs/run-trace?tab=process").text
    t = text(html)
    assert "Buy a car policy" in t and "Reach the purchase confirmation" in t
    assert "[BNDY] boundary reached" in t and "Premium shown: 1 234 PLN" in t
    assert "Enter the car model" in t and "Octavia" in t and "outcome 2" in t
    assert "not observable" in t and "mutating on production" in t
    assert 'href="/runs/run-trace?tab=actions#act-buy"' in html
    assert "flowchart TD" in html and "/static/js/diagrams.js" in html


def test_run_process_tab_empty_state_for_a_map_run(ba_client: TestClient) -> None:
    t = text(ba_client.get("/runs/run-map?tab=process").text)
    assert "No process recorded for this run" in t


def test_store_without_process_tables_still_renders(ba_fixture: Store) -> None:
    w = ba_fixture.connect()
    w.execute("DROP TABLE process_steps")
    w.execute("DROP TABLE processes")
    w.commit()
    with make_client(ba_fixture) as c:
        assert c.get("/runs/run-trace?tab=process").status_code == 200
        assert "No process recorded for this run" in text(c.get("/runs/run-trace?tab=process").text)
        html = c.get(f"/docs/{P}/PROC-001").text
        assert "unresolved" in html and "broken link" not in html
        assert "mermaid" not in html.replace("diagrams.js", "")


# --- review panel (rendering and guards; the integration with docs:review is T067) -------------


def test_review_panel_disabled_with_hint_when_no_reviewer(ba_client: TestClient) -> None:
    html = ba_client.get(f"/docs/{P}/REQ-001").text
    assert "PATHFINDER_REVIEWER" in html and "no reviewer is configured" in html
    panel = html[html.index('id="region-reviews"') :]
    assert panel.count("disabled") >= 5  # three buttons, two textareas (comment too)


def test_review_panel_enabled_for_a_draft(reviewer_client: TestClient) -> None:
    html = reviewer_client.get(f"/docs/{P}/REQ-001").text
    panel = html[html.index('id="region-reviews"') :]
    assert "no reviewer is configured" not in html
    assert "[confirm rev 2]" in panel and "[reject rev 2]" in panel and "[comment]" in panel
    assert 'hx-post="/docs/reference-insurer/REQ-001/reviews"' in panel
    assert "disabled" not in panel


def test_review_panel_for_a_decided_revision_allows_only_comments(
    reviewer_client: TestClient,
) -> None:
    html = reviewer_client.get(f"/docs/{P}/BR-001").text
    panel = html[html.index('id="region-reviews"') :]
    assert "Only a draft can be confirmed or rejected" in text(panel)
    assert re.search(r"<button[^>]*disabled[^>]*>\[confirm rev 1\]", panel)
    assert not re.search(r"<button[^>]*disabled[^>]*>\[comment\]", panel)
    assert "[RJCT] reject" in text(panel) and "Not evidenced: only a hint was seen" in text(panel)


def origin() -> dict[str, str]:
    return {"Origin": "http://testserver"}


FORM = {"rev_no": "2", "action": "confirm"}


def test_post_without_reviewer_is_403_with_inline_hint(ba_client: TestClient) -> None:
    r = ba_client.post(f"/docs/{P}/REQ-001/reviews", data=FORM, headers=origin())
    assert r.status_code == 403
    assert "Review actions are disabled" in text(r.text) and 'id="region-reviews"' in r.text


def test_post_from_a_foreign_origin_is_403(reviewer_client: TestClient) -> None:
    for headers in ({"Origin": "http://evil.example"}, {"Referer": "http://evil.example/x"}, {}):
        r = reviewer_client.post(f"/docs/{P}/REQ-001/reviews", data=FORM, headers=headers)
        assert r.status_code == 403, headers
        assert "Cross-origin" in r.text


def test_post_with_same_origin_referer_passes_the_guard(reviewer_client: TestClient) -> None:
    r = reviewer_client.post(
        f"/docs/{P}/REQ-001/reviews",
        data={"rev_no": "2", "action": "reject", "text": ""},
        headers={"Referer": "http://testserver/docs/reference-insurer/REQ-001"},
    )
    assert r.status_code == 422


def test_reject_and_comment_without_text_are_refused_inline(reviewer_client: TestClient) -> None:
    for action in ("reject", "comment"):
        r = reviewer_client.post(
            f"/docs/{P}/REQ-001/reviews",
            data={"rev_no": "2", "action": action, "text": "  "},
            headers=origin(),
        )
        assert r.status_code == 422, action
        t = text(r.text)
        assert "[RFSE]" in t and "needs a text" in t
        assert 'id="region-reviews"' in r.text
        # header travels out of band so the status badge can change without a reload
        assert 'id="region-doc-header"' in r.text and 'hx-swap-oob="true"' in r.text


def test_unknown_action_or_record_on_post(reviewer_client: TestClient) -> None:
    r = reviewer_client.post(
        f"/docs/{P}/REQ-001/reviews", data={"rev_no": "x", "action": "burn"}, headers=origin()
    )
    assert r.status_code == 422
    r = reviewer_client.post(f"/docs/{P}/REQ-404/reviews", data=FORM, headers=origin())
    assert r.status_code == 404


def test_post_never_opens_the_store_writable_and_refusals_leave_it_unchanged(
    ba_fixture: Store,
) -> None:
    import hashlib

    ba_fixture.connect().execute("PRAGMA wal_checkpoint(TRUNCATE)").close()
    before = hashlib.sha256(ba_fixture.path.read_bytes()).hexdigest()
    with make_client(ba_fixture, reviewer="Test Reviewer") as c:
        c.post(
            f"/docs/{P}/REQ-001/reviews",
            data={"rev_no": "2", "action": "reject", "text": ""},
            headers=origin(),
        )
        c.post(f"/docs/{P}/REQ-001/reviews", data=FORM, headers={"Origin": "http://evil"})
    assert hashlib.sha256(ba_fixture.path.read_bytes()).hexdigest() == before
