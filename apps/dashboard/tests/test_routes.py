"""Pages and fragments (contracts/http-routes.md), against fixture stores."""

import re
from pathlib import Path

from fastapi.testclient import TestClient

from .conftest import BIG_RUN, CAPTCHA_1, CAPTCHA_2, Store, insert, make_client, make_store


def text(html: str) -> str:
    """Visible text, tags stripped and whitespace collapsed (for assertions on content).
    Glossary tooltips (hidden tip + [?] mark) are left out, as a reader sees the page at rest."""
    html = re.sub(r'<a class="gl-mark"[^>]*>.*?</a><span class="gl-tip"[^>]*>.*?</span>', "", html)
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", html))


# --- shell ------------------------------------------------------------------------------------


def test_shell_binds_live_stream_and_assets(client: TestClient) -> None:
    html = client.get("/").text
    assert 'hx-sse:connect="/events"' in html
    for asset in ("htmx.min.js", "hx-sse.min.js", "live.js", "tokens.css", "salvage.css", "mp.css"):
        assert re.search(rf'(?:src|href)="/static/[^"]*{re.escape(asset)}"', html), asset
    assert "MUD PUPPY" in text(html)  # the wordmark
    assert 'href="#main"' in html  # skip link


def test_static_assets_served_with_cache(client: TestClient) -> None:
    for path in (
        "/static/vendor/htmx.min.js",
        "/static/vendor/hx-sse.min.js",
        "/static/js/live.js",
        "/static/css/mp.css",
        "/static/salvage/css/tokens.css",
        "/static/salvage/css/salvage.css",
        "/static/salvage/fonts/Archivo-Variable.woff2",
    ):
        r = client.get(path)
        assert r.status_code == 200, path
        assert "max-age" in r.headers["cache-control"]


def test_console_assets_are_gone(client: TestClient) -> None:
    for path in (
        "/static/css/app.css",
        "/static/fonts/jetbrains-mono-latin-400-normal.woff2",
        "/static/brand/favicon.ico",
    ):
        assert client.get(path).status_code == 404, path


def test_html_is_never_cached(client: TestClient) -> None:
    assert client.get("/").headers["cache-control"] == "no-store"
    assert client.get("/fragments/runs").headers["cache-control"] == "no-store"


def test_healthz(client: TestClient, tmp_path: Path) -> None:
    body = client.get("/healthz").json()
    assert body["ok"] is True and body["store"]["environment"] == "test"
    empty = tmp_path / "nodata"
    (empty / "db").mkdir(parents=True)
    with make_client(Store(empty, "production", empty / "db" / "production.sqlite")) as c:
        r = c.get("/healthz")
    assert r.status_code == 503 and r.json()["ok"] is False


# --- US1 --------------------------------------------------------------------------------------


def test_overview_shows_portal_and_runs(client: TestClient) -> None:
    html = client.get("/").text
    t = text(html)
    assert "liveinsurer" in t
    assert re.search(r"Scans 9\b", t)
    assert html.count('data-status="stopped">Interrupted') >= 7
    assert html.count('data-status="failed">Stopped') >= 2
    assert CAPTCHA_1 in html and CAPTCHA_2 in html
    assert "Stopped" in t  # status carried by text, not colour alone
    assert f'href="/runs/{BIG_RUN}"' in html


def test_overview_summary_counts(client: TestClient) -> None:
    t = text(client.get("/fragments/summary").text)
    assert "Actions 570 allowed" in t
    assert "30 skipped by safety" in t
    assert "6 forms · 9 network call shapes" in t
    assert "7 Interrupted" in t and "2 Stopped" in t


def test_runs_fragment_filters_by_status(client: TestClient) -> None:
    r = client.get("/fragments/runs?status=stopped_warning")
    assert r.status_code == 200
    assert r.text.count('data-status="failed">Stopped') == 2  # two rows
    assert 'data-status="stopped">Interrupted' not in r.text
    assert 'id="region-runs"' in r.text
    assert 'hx-trigger="store-changed from:body"' in r.text
    assert 'hx-get="/fragments/runs?status=stopped_warning"' in r.text
    assert "HX-Push-Url" not in r.headers  # live refreshes never push


def test_empty_form_values_mean_any(client: TestClient) -> None:
    """A filter form submits `portal=` for "any"; it must not filter on the empty string."""
    r = client.get("/fragments/runs?push=1&portal=&status=stopped_warning")
    assert r.text.count('data-status="failed">Stopped') == 2
    assert r.headers["HX-Push-Url"] == "/?status=stopped_warning"
    all_runs = client.get("/fragments/runs?portal=&status=&cursor=")
    assert "Scans 9" in text(all_runs.text)
    actions = client.get(f"/fragments/runs/{BIG_RUN}/actions?safety_class=&allowed=&cursor=")
    assert "1–25 of 600" in text(actions.text)
    decisions = client.get(f"/fragments/runs/{BIG_RUN}/decisions?kind=&rule=")
    assert "No decisions" not in decisions.text


def test_filter_request_pushes_page_url(client: TestClient) -> None:
    r = client.get("/fragments/runs?status=interrupted&push=1")
    assert r.headers["HX-Push-Url"] == "/?status=interrupted"


def test_runs_pagination(liveinsurer_store: Store) -> None:
    with make_client(liveinsurer_store, page_size=4) as c:
        first = c.get("/").text
        assert "1–4 of 9" in first
        nxt = re.search(r'href="(/\?cursor=[^"]+)"', first)
        assert nxt, "next link"
        second = c.get(nxt.group(1).replace("&amp;", "&")).text
        assert "5–8 of 9" in second
        assert re.search(r'<a class="sy-btn[^"]*" href="[^"]*"[^>]*>First</a>', second)


def test_empty_store_shows_empty_state(empty_client: TestClient) -> None:
    t = text(empty_client.get("/").text)
    assert "No scans recorded yet" in t
    assert "crawler" in t


def test_filtered_empty_state(client: TestClient) -> None:
    t = text(client.get("/fragments/runs?status=completed").text)
    assert "No scans match these filters" in t


def test_missing_store_shows_error_state(tmp_path: Path) -> None:
    data = tmp_path / "data"
    (data / "db").mkdir(parents=True)
    with make_client(Store(data, "production", data / "db" / "production.sqlite")) as c:
        r = c.get("/")
        frag = c.get("/fragments/runs")
    assert r.status_code == 200
    assert "No store “production”" in r.text and "production.sqlite" in r.text
    assert ">Retry</a>" in r.text
    assert "No store “production”" in frag.text
    assert not (data / "db" / "production.sqlite").exists()


def test_untrusted_strings_are_escaped(liveinsurer_store: Store) -> None:
    w = liveinsurer_store.connect()
    insert(
        w,
        "runs",
        id="run-xss",
        warning=None,
        persona_id="<script>alert(1)</script>",
        started_at="2026-09-26T00:00:00.000Z",
    )
    w.commit()
    with make_client(liveinsurer_store) as c:
        html = c.get("/").text
    assert "<script>alert(1)</script>" not in html
    assert "&lt;script&gt;alert(1)&lt;/script&gt;" in html


def test_environment_switch(liveinsurer_store: Store) -> None:
    make_store(liveinsurer_store.data_dir, "scratch")
    with make_client(liveinsurer_store) as c:
        html = c.get("/").text
        # The header's store menu (R-71): with no portal chosen it lists every store.
        assert 'href="/?store=main%3Ascratch"' in html
        scratch = c.get("/?store=main:scratch")
        # the older `?env=` links keep working (spec 019)
        assert "No scans recorded yet" in text(c.get("/?env=scratch").text)
    assert "No scans recorded yet" in text(scratch.text)
    assert 'hx-sse:connect="/events?store=main%3Ascratch"' in scratch.text
    assert "/fragments/runs?store=main%3Ascratch" in scratch.text


# --- US2 --------------------------------------------------------------------------------------


def test_run_detail_header_and_tabs(client: TestClient) -> None:
    html = client.get(f"/runs/{BIG_RUN}").text
    t = text(html)
    assert f"Scan {BIG_RUN}" in t
    assert 'data-status="stopped">Interrupted' in html
    for label, count in [
        ("States", 1),
        ("Actions", 600),
        ("Frontier", 600),
        ("Forms", 6),
        ("Network", 9),
        ("Decisions", 54),
    ]:
        assert f"{label} {count}" in t, label
    assert 'aria-current="page">States' in html
    assert "Config snapshot" in t
    assert "&#34;liveinsurer&#34;" in html or "&quot;liveinsurer&quot;" in html  # JSON escaped in <pre>


def test_run_detail_stopped_run_shows_warning(client: TestClient) -> None:
    html = client.get("/runs/run-005").text
    assert 'data-status="failed">Stopped' in html and CAPTCHA_1 in html
    assert "No screens observed in this scan" in text(html)


def test_states_show_confidence_and_evidence(client: TestClient) -> None:
    html = client.get(f"/fragments/runs/{BIG_RUN}/states").text
    assert "Kup ubezpieczenia" in html
    assert 'data-status="ok">Observed' in html
    assert "a" * 64 + ".json" in html


def test_actions_section(client: TestClient) -> None:
    html = client.get(f"/runs/{BIG_RUN}?tab=actions").text
    t = text(html)
    assert "Actions extracted 600" in t
    assert "1–25 of 600" in t
    skipped = client.get(f"/fragments/runs/{BIG_RUN}/actions?allowed=0").text
    assert skipped.split("<tbody>")[1].count('data-status="skipped">Skipped') == 25
    assert 'data-status="ok">Allowed' not in skipped.split("<tbody>")[1]
    assert "above ceiling read" in skipped


def test_frontier_section_counts_and_filter(client: TestClient) -> None:
    t = text(client.get(f"/runs/{BIG_RUN}?tab=frontier").text)
    for fragment in (
        "549 Queued",
        "2 Done",
        "10 Unreachable",
        "6 Skipped · robots",
    ):
        assert fragment in t, fragment
    only = client.get(f"/fragments/runs/{BIG_RUN}/frontier?status=unreachable")
    body = only.text.split("<tbody>")[1]
    assert body.count("<tr") == 10
    assert "unreachable reason" in body


def test_decisions_grouped_and_filtered(client: TestClient) -> None:
    html = client.get(f"/runs/{BIG_RUN}?tab=decisions").text
    t = text(html)
    assert "ceiling:read 30" in t
    assert "click_failed 10" in t
    assert "robots:Disallow: *cHash* 6" in t
    skips = client.get(f"/fragments/runs/{BIG_RUN}/decisions?kind=skip")
    entries = skips.text.split("Decision log entries</caption>")[1]
    assert ">Refused<" not in entries and ">merge<" not in entries
    assert "1–39 of 39" not in text(skips.text)  # fits one page: no pager
    by_rule = client.get(
        f"/fragments/runs/{BIG_RUN}/decisions", params={"rule": "robots:Disallow: *cHash*"}
    ).text.split("Decision log entries</caption>")[1]
    assert by_rule.count("<tr") == 1 + 6  # header row + 6 entries
    pushed = client.get(f"/fragments/runs/{BIG_RUN}/decisions?kind=skip&push=1")
    assert pushed.headers["HX-Push-Url"] == f"/runs/{BIG_RUN}?tab=decisions&kind=skip"


def test_decisions_filter_survives_reload(client: TestClient) -> None:
    html = client.get(f"/runs/{BIG_RUN}?tab=decisions&kind=refuse").text
    assert '<option value="refuse" selected>' in html
    entries = html.split("Decision log entries</caption>")[1]
    assert ">Skipped<" not in entries


def test_forms_network_robots_sections(client: TestClient) -> None:
    forms = text(client.get(f"/fragments/runs/{BIG_RUN}/forms").text)
    assert "Forms 6" in forms and "q search" in forms
    net = client.get(f"/fragments/runs/{BIG_RUN}/network").text
    assert "GET /api/:param" in text(net) and "on screen load" in text(net)
    robots = client.get("/fragments/runs/run-001/robots").text
    assert "www.liveinsurer.example" in robots and "HTTP 200" in robots


def test_frontier_pagination_uses_cursor(client: TestClient) -> None:
    html = client.get(f"/fragments/runs/{BIG_RUN}/frontier").text
    nxt = re.search(r'hx-get="([^"]*cursor=[^"]+)"', html)
    assert nxt
    second = client.get(nxt.group(1).replace("&amp;", "&"))
    assert "26–50 of 600" in text(second.text)
    assert second.headers["HX-Push-Url"].startswith(f"/runs/{BIG_RUN}?tab=frontier&cursor=")


def test_unknown_run_is_not_found(client: TestClient) -> None:
    r = client.get("/runs/nope")
    assert r.status_code == 404
    assert "No scan with id" in r.text and "Back to Home" in r.text
    assert client.get("/fragments/runs/nope/states").status_code == 404
    assert client.get(f"/fragments/runs/{BIG_RUN}/bogus").status_code == 404


def test_unknown_tab_falls_back_to_states(client: TestClient) -> None:
    html = client.get(f"/runs/{BIG_RUN}?tab=bogus").text
    assert 'id="region-states"' in html


# --- US1 (R-17): trace tab and activity -------------------------------------------------------


def seed_trace(w: object) -> None:
    """One traced call on `BIG_RUN` (with a phase and a nested event) plus a run-less call."""
    insert(w, "trace_boots", id="boot-1", started_at="2026-09-25T19:44:00.000Z")
    insert(
        w,
        "trace_spans",
        id="span-call-1",
        boot_id="boot-1",
        seq=1,
        run_id=BIG_RUN,
        name="pf_extract",
        status="ok",
        rationale="need to see the page contents",
        attrs_json='{"input": {"role": "link"}}',
        payload_ref="d" * 64 + ".json",
        pw_trace_path="traces/liveinsurer/span-call-1.zip",
    )
    insert(
        w,
        "trace_spans",
        id="span-call-2",
        boot_id="boot-1",
        seq=2,
        run_id=BIG_RUN,
        name="pf_click",
        status="error",
        summary="click failed",
    )
    insert(
        w,
        "trace_spans",
        id="span-phase-1",
        boot_id="boot-1",
        seq=3,
        run_id=BIG_RUN,
        parent_id="span-call-1",
        kind="phase",
        name="goto",
        status="ok",
        duration_ms=5,
    )
    insert(
        w,
        "trace_spans",
        id="span-event-1",
        boot_id="boot-1",
        seq=4,
        run_id=BIG_RUN,
        parent_id="span-phase-1",
        kind="event",
        name="request",
        status="ok",
        duration_ms=None,
        summary="GET /api",
    )
    insert(
        w,
        "trace_spans",
        id="span-runless-1",
        boot_id="boot-1",
        seq=5,
        run_id=None,
        name="pf_status",
        status="ok",
        summary="<script>alert(1)</script>",
    )


def test_trace_tab_renders_calls_with_rationale_status_and_count(liveinsurer_store: Store) -> None:
    w = liveinsurer_store.connect()
    seed_trace(w)
    w.commit()
    with make_client(liveinsurer_store) as c:
        html = c.get(f"/runs/{BIG_RUN}?tab=trace").text
    t = text(html)
    assert "Trace 2" in t  # tab bar count = call spans for this run
    assert "pf_extract" in t and "pf_click" in t
    assert "Agent-stated: need to see the page contents" in t
    # ok / error call statuses
    assert 'data-status="ok">OK' in html or 'data-status="ok">Ok' in html
    assert 'data-status="failed">' in html
    assert 'id="region-trace"' in html


def test_trace_fragment_filters_by_tool_and_status(liveinsurer_store: Store) -> None:
    w = liveinsurer_store.connect()
    seed_trace(w)
    w.commit()

    def calls_list(html: str) -> str:
        return html.split('<ul class="sy-rows">')[1]

    with make_client(liveinsurer_store) as c:
        only_click = c.get(f"/fragments/runs/{BIG_RUN}/trace?tool=pf_click&push=1")
        rows = calls_list(only_click.text)
        assert "pf_click" in rows and "pf_extract" not in rows
        assert only_click.headers["HX-Push-Url"] == f"/runs/{BIG_RUN}?tab=trace&tool=pf_click"
        only_errors = c.get(f"/fragments/runs/{BIG_RUN}/trace?status=error&status=refused")
        rows = calls_list(only_errors.text)
        assert "pf_click" in rows and "pf_extract" not in rows


def test_trace_expand_loads_phases_and_events(liveinsurer_store: Store) -> None:
    w = liveinsurer_store.connect()
    seed_trace(w)
    w.commit()
    with make_client(liveinsurer_store) as c:
        html = c.get(f"/runs/{BIG_RUN}?tab=trace").text
        assert 'hx-get="/fragments/spans/span-call-1/children"' in html
        children = c.get("/fragments/spans/span-call-1/children").text
    t = text(children)
    assert "goto" in t and "request" in t and "GET /api" in t
    assert "mp-phase-bar__seg" in children


def test_trace_children_not_found_shows_empty_state(liveinsurer_store: Store) -> None:
    with make_client(liveinsurer_store) as c:
        r = c.get("/fragments/spans/nope/children")
    assert "No phase or event detail recorded" in r.text


def test_trace_empty_state_when_run_never_reached_the_server(client: TestClient) -> None:
    html = client.get(f"/runs/{BIG_RUN}?tab=trace").text
    assert "No trace recorded for this scan" in text(html)
    assert "predates tracing" in text(html)
    filtered = client.get(f"/fragments/runs/{BIG_RUN}/trace?status=error").text
    assert "No calls match these filters" in text(filtered)


def seed_trace_with_events_and_agent(w: object) -> None:
    """A gate refusal, a robots check, a fingerprint decision, a stabilization timeout, an
    obstacle and a linked `decision_log` row inside one call; an agent transcript covering it
    (matched turn + tokens + preceding text) plus one call that never got an agent turn and one
    agent tool_use that never reached the server (T028/T034/T040/T041)."""
    insert(w, "trace_boots", id="boot-e", started_at="2026-09-25T19:50:00.000Z")
    insert(
        w,
        "decision_log",
        id="dec-1",
        run_id=BIG_RUN,
        kind="refuse",
        rule="ceiling:mutating",
        reason="mutating action refused on production",
        created_at="2026-09-25T19:50:00.000Z",
    )
    insert(
        w,
        "trace_spans",
        id="e-call-1",
        boot_id="boot-e",
        seq=1,
        run_id=BIG_RUN,
        name="pf_click",
        status="refused",
        duration_ms=80,
        tool_use_id="tu-e1",
    )
    insert(
        w,
        "trace_spans",
        id="e-gate",
        boot_id="boot-e",
        seq=2,
        run_id=BIG_RUN,
        parent_id="e-call-1",
        kind="event",
        name="gate_decision",
        status="ok",
        duration_ms=None,
        attrs_json=(
            '{"input_kind": "act", "action": {"role": "button", "accessible_name": "Buy"},'
            ' "safety_class": "mutating", "allowed": false, "rule": "ceiling:mutating",'
            ' "reason": "mutating action refused on production"}'
        ),
    )
    insert(
        w,
        "trace_spans",
        id="e-decision",
        boot_id="boot-e",
        seq=3,
        run_id=BIG_RUN,
        parent_id="e-call-1",
        kind="event",
        name="decision",
        status="ok",
        duration_ms=None,
        decision_id="dec-1",
        attrs_json='{"decision_id": "dec-1", "kind": "refuse", "rule": "ceiling:mutating"}',
    )
    insert(
        w,
        "trace_spans",
        id="e-robots",
        boot_id="boot-e",
        seq=4,
        run_id=BIG_RUN,
        parent_id="e-call-1",
        kind="event",
        name="robots_check",
        status="ok",
        duration_ms=None,
        attrs_json=(
            '{"url": {"origin": "https://www.liveinsurer.example", "route": "/admin/pixel.gif",'
            ' "query_keys": []}, "rule": "Disallow: /admin/", "action": "blocked"}'
        ),
    )
    insert(
        w,
        "trace_spans",
        id="e-fp",
        boot_id="boot-e",
        seq=5,
        run_id=BIG_RUN,
        parent_id="e-call-1",
        kind="event",
        name="fingerprint_assign",
        status="ok",
        duration_ms=None,
        attrs_json=(
            '{"route_template": "/oferta", "level1": "l1", "decision": "matched",'
            ' "cluster_id": "cluster-1", "matched": true, "similarity": 0.987, "threshold": 0.9}'
        ),
    )
    insert(
        w,
        "trace_spans",
        id="e-stall",
        boot_id="boot-e",
        seq=6,
        run_id=BIG_RUN,
        parent_id="e-call-1",
        kind="event",
        name="stabilization_timeout",
        status="ok",
        duration_ms=None,
        attrs_json=(
            '{"timeout_ms": 5000, "in_flight": [{"url": {"origin": null, "route": "/api/poll",'
            ' "query_keys": []}, "resource_type": "fetch", "age_ms": 4200}],'
            ' "since_mutation_ms": 3000, "running_animations": 1}'
        ),
    )
    insert(
        w,
        "trace_spans",
        id="e-obstacle",
        boot_id="boot-e",
        seq=7,
        run_id=BIG_RUN,
        parent_id="e-call-1",
        kind="event",
        name="obstacle",
        status="ok",
        duration_ms=None,
        attrs_json='{"obstacle_id": "cookie-banner", "selector": "#cookie-accept", "via": "sweep"}',
    )
    insert(
        w,
        "trace_spans",
        id="e-call-2",
        boot_id="boot-e",
        seq=8,
        run_id=BIG_RUN,
        name="pf_extract",
        status="ok",
        duration_ms=20,
        tool_use_id="tu-e2",
    )
    insert(
        w,
        "trace_spans",
        id="e-call-3",
        boot_id="boot-e",
        seq=9,
        run_id=BIG_RUN,
        name="pf_status",
        status="ok",
        duration_ms=5,
        tool_use_id=None,  # no agent context at all, e.g. issued outside a subagent call
    )
    insert(
        w,
        "agent_turns",
        id="e-turn-1",
        message_uuid="eu1",
        block_index=0,
        api_message_id="emsg-1",
        run_id=BIG_RUN,
        kind="text",
        text="Trying to buy the policy to see what happens",
        created_at="2026-09-25T19:50:00.000Z",
    )
    insert(
        w,
        "agent_turns",
        id="e-turn-2",
        message_uuid="eu1",
        block_index=1,
        api_message_id="emsg-1",
        run_id=BIG_RUN,
        kind="tool_use",
        tool_use_id="tu-e1",
        tool_name="mcp__pathfinder__act",
        input_tokens=200,
        output_tokens=40,
        matched=1,
        created_at="2026-09-25T19:50:00.000Z",
    )
    insert(
        w,
        "agent_turns",
        id="e-turn-3",
        message_uuid="eu2",
        block_index=0,
        api_message_id="emsg-2",
        run_id=BIG_RUN,
        kind="tool_use",
        tool_use_id="tu-never",
        tool_name="mcp__pathfinder__navigate",
        matched=0,
        created_at="2026-09-25T19:51:00.000Z",
    )


def test_trace_event_detail_renders_gate_robots_fingerprint_and_linked_decision(
    liveinsurer_store: Store,
) -> None:
    w = liveinsurer_store.connect()
    seed_trace_with_events_and_agent(w)
    w.commit()
    with make_client(liveinsurer_store) as c:
        children = c.get("/fragments/spans/e-call-1/children").text
    t = text(children)
    assert "ceiling:mutating" in t and "mutating" in t
    assert "/admin/pixel.gif" in t and "Disallow: /admin/" in t
    assert "/oferta" in t and "matched" in t
    assert "3000 ms" in t or "3,000 ms" in t  # since_mutation_ms
    assert "cookie-accept" in t and "sweep" in t
    assert "tab=decisions&amp;rule=ceiling%3Amutating" in children


def test_trace_tab_shows_agent_context_and_never_reached_server(liveinsurer_store: Store) -> None:
    w = liveinsurer_store.connect()
    seed_trace_with_events_and_agent(w)
    w.commit()
    with make_client(liveinsurer_store) as c:
        html = c.get(f"/runs/{BIG_RUN}?tab=trace").text
    t = text(html)
    assert "Trying to buy the policy to see what happens" in t
    assert "200 in / 40 out" in t
    assert "Never reached the server" in t
    assert "mcp__pathfinder__navigate" in t


def test_trace_tab_not_imported_state(liveinsurer_store: Store) -> None:
    w = liveinsurer_store.connect()
    seed_trace(w)  # no agent_turns rows at all
    w.commit()
    with make_client(liveinsurer_store) as c:
        html = c.get(f"/runs/{BIG_RUN}?tab=trace").text
    assert "Not imported" in html
    assert "pnpm trace:import-agent" in html


def test_trace_problems_filter_shows_unmatched_and_refused_calls(liveinsurer_store: Store) -> None:
    w = liveinsurer_store.connect()
    seed_trace_with_events_and_agent(w)
    w.commit()
    with make_client(liveinsurer_store) as c:
        html = c.get(f"/fragments/runs/{BIG_RUN}/trace?problems=1").text
        rows = html.split('<ul class="sy-rows">')[1]
    t = text(rows)
    assert "pf_click" in t  # refused
    assert "pf_extract" in t  # ok, but its tool_use_id has no matching agent turn
    assert "pf_status" not in t  # ok, no tool_use_id at all


def test_trace_summary_fragment_and_page_panel(liveinsurer_store: Store) -> None:
    w = liveinsurer_store.connect()
    seed_trace_with_events_and_agent(w)
    w.commit()
    with make_client(liveinsurer_store) as c:
        frag = c.get(f"/fragments/runs/{BIG_RUN}/trace/summary").text
        page = c.get(f"/runs/{BIG_RUN}?tab=trace").text
    for html in (frag, page):
        t = text(html)
        assert "pf_click" in t and "pf_extract" in t
        assert "never reached the server" in t
        assert "unmatched to the agent" in t
        assert "Problems only" in t
    assert 'id="region-trace-summary"' in frag


def test_trace_summary_empty_state(client: TestClient) -> None:
    html = client.get(f"/fragments/runs/{BIG_RUN}/trace/summary").text
    assert "No trace recorded for this scan" in text(html)


def test_activity_page_and_fragment_show_run_less_calls(liveinsurer_store: Store) -> None:
    w = liveinsurer_store.connect()
    seed_trace(w)
    w.commit()
    with make_client(liveinsurer_store) as c:
        html = c.get("/activity").text
        assert "pf_status" in html
        assert "pf_extract" not in html  # that one belongs to a run
        assert "<script>alert(1)</script>" not in html
        assert "&lt;script&gt;alert(1)&lt;/script&gt;" in html
        frag = c.get("/fragments/activity").text
    assert 'id="region-activity"' in frag
    assert "pf_status" in frag


def test_activity_empty_state(client: TestClient) -> None:
    t = text(client.get("/activity").text)
    assert "No calls outside a scan" in t


def test_only_running_runs_carry_the_live_dot(liveinsurer_store: Store) -> None:
    w = liveinsurer_store.connect()
    insert(w, "runs", id="run-live", status="running", started_at="2026-09-26T00:00:00.000Z")
    w.commit()
    with make_client(liveinsurer_store) as c:
        runs = c.get("/fragments/runs").text
        header = c.get("/fragments/runs/run-live/header").text
    assert runs.count('data-status="running"') == 1
    assert 'data-status="running">Running' in runs and 'data-status="running"' in header
