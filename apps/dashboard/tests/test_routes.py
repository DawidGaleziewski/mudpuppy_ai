"""Pages and fragments (contracts/http-routes.md), against fixture stores."""

import re
from pathlib import Path

from fastapi.testclient import TestClient

from .conftest import BIG_RUN, CAPTCHA_1, CAPTCHA_2, Store, insert, make_client, make_store


def text(html: str) -> str:
    """Visible text, tags stripped and whitespace collapsed (for assertions on content)."""
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", html))


# --- shell ------------------------------------------------------------------------------------


def test_shell_binds_live_stream_and_assets(client: TestClient) -> None:
    html = client.get("/").text
    assert 'hx-sse:connect="/events"' in html
    for asset in ("htmx.min.js", "hx-sse.min.js", "live.js", "tokens.css", "app.css"):
        assert re.search(rf'(?:src|href)="/static/[^"]*{re.escape(asset)}"', html), asset
    assert "pathfinder://console" in html
    assert 'href="#main"' in html  # skip link


def test_static_assets_served_with_cache(client: TestClient) -> None:
    for path in (
        "/static/vendor/htmx.min.js",
        "/static/vendor/hx-sse.min.js",
        "/static/js/live.js",
        "/static/css/app.css",
        "/static/fonts/jetbrains-mono-latin-400-normal.woff2",
    ):
        r = client.get(path)
        assert r.status_code == 200, path
        assert "max-age" in r.headers["cache-control"]


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
    assert re.search(r"Runs 9\b", t)
    assert html.count("[INT.]") >= 7
    assert html.count("[STOP]") >= 2
    assert CAPTCHA_1 in html and CAPTCHA_2 in html
    assert "stopped warning" in t  # status carried by text, not colour alone
    assert f'href="/runs/{BIG_RUN}"' in html


def test_overview_summary_counts(client: TestClient) -> None:
    t = text(client.get("/fragments/summary").text)
    assert "Actions allowed 570" in t
    assert "30 skipped by safety" in t
    assert "6 forms · 9 network call shapes" in t
    assert "7 interrupted" in t and "2 stopped warning" in t


def test_runs_fragment_filters_by_status(client: TestClient) -> None:
    r = client.get("/fragments/runs?status=stopped_warning")
    assert r.status_code == 200
    assert r.text.count("[STOP]") == 2 + 0  # two rows; the filter select has no labels
    assert "[INT.]" not in r.text
    assert 'id="region-runs"' in r.text
    assert 'hx-trigger="store-changed from:body"' in r.text
    assert 'hx-get="/fragments/runs?status=stopped_warning"' in r.text
    assert "HX-Push-Url" not in r.headers  # live refreshes never push


def test_empty_form_values_mean_any(client: TestClient) -> None:
    """A filter form submits `portal=` for "any"; it must not filter on the empty string."""
    r = client.get("/fragments/runs?push=1&portal=&status=stopped_warning")
    assert r.text.count("[STOP]") == 2
    assert r.headers["HX-Push-Url"] == "/?status=stopped_warning"
    all_runs = client.get("/fragments/runs?portal=&status=&cursor=")
    assert 'Runs <span class="muted mono-num">9</span>' in all_runs.text
    actions = client.get(f"/fragments/runs/{BIG_RUN}/actions?safety_class=&allowed=&cursor=")
    assert "1–50 of 600" in text(actions.text)
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
        assert "[first]" in second


def test_empty_store_shows_empty_state(empty_client: TestClient) -> None:
    t = text(empty_client.get("/").text)
    assert "No runs recorded yet" in t
    assert "crawler" in t


def test_filtered_empty_state(client: TestClient) -> None:
    t = text(client.get("/fragments/runs?status=completed").text)
    assert "No runs match these filters" in t


def test_missing_store_shows_error_state(tmp_path: Path) -> None:
    data = tmp_path / "data"
    (data / "db").mkdir(parents=True)
    with make_client(Store(data, "production", data / "db" / "production.sqlite")) as c:
        r = c.get("/")
        frag = c.get("/fragments/runs")
    assert r.status_code == 200
    assert "No crawl store" in r.text and "production.sqlite" in r.text
    assert "[retry]" in r.text
    assert "No crawl store" in frag.text
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
        assert '<option value="scratch"' in html
        scratch = c.get("/?env=scratch")
    assert "No runs recorded yet" in text(scratch.text)
    assert 'hx-sse:connect="/events?env=scratch"' in scratch.text
    assert "/fragments/runs?env=scratch" in scratch.text


# --- US2 --------------------------------------------------------------------------------------


def test_run_detail_header_and_tabs(client: TestClient) -> None:
    html = client.get(f"/runs/{BIG_RUN}").text
    t = text(html)
    assert f"Run {BIG_RUN}" in t
    assert "[INT.]" in html
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
    assert "config snapshot" in t
    assert "&#34;liveinsurer&#34;" in html or "&quot;liveinsurer&quot;" in html  # JSON escaped in <pre>


def test_run_detail_stopped_run_shows_warning(client: TestClient) -> None:
    html = client.get("/runs/run-005").text
    assert "[STOP]" in html and CAPTCHA_1 in html
    assert "No states observed in this run" in text(html)


def test_states_show_confidence_and_evidence(client: TestClient) -> None:
    html = client.get(f"/fragments/runs/{BIG_RUN}/states").text
    assert "Kup ubezpieczenia" in html
    assert 'class="conf conf-observed">observed' in html
    assert "a" * 64 + ".json" in html


def test_actions_section(client: TestClient) -> None:
    html = client.get(f"/runs/{BIG_RUN}?tab=actions").text
    t = text(html)
    assert "Actions extracted 600" in t
    assert "1–50 of 600" in t
    skipped = client.get(f"/fragments/runs/{BIG_RUN}/actions?allowed=0").text
    assert text(skipped).count("skipped") >= 30
    assert "[ OK ]" not in skipped.split("<tbody>")[1]
    assert "above ceiling read" in skipped


def test_frontier_section_counts_and_filter(client: TestClient) -> None:
    t = text(client.get(f"/runs/{BIG_RUN}?tab=frontier").text)
    for fragment in (
        "[PEND] pending 549",
        "[DONE] done 2",
        "[FAIL] unreachable 10",
        "[SKIP] robots disallowed 6",
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
    entries = skips.text.split("<caption>Entries</caption>")[1]
    assert "[RFSE]" not in entries and "[MRGE]" not in entries
    assert "1–39 of 39" not in text(skips.text)  # fits one page: no pager
    by_rule = client.get(
        f"/fragments/runs/{BIG_RUN}/decisions", params={"rule": "robots:Disallow: *cHash*"}
    ).text.split("<caption>Entries</caption>")[1]
    assert by_rule.count("<tr") == 1 + 6  # header row + 6 entries
    pushed = client.get(f"/fragments/runs/{BIG_RUN}/decisions?kind=skip&push=1")
    assert pushed.headers["HX-Push-Url"] == f"/runs/{BIG_RUN}?tab=decisions&kind=skip"


def test_decisions_filter_survives_reload(client: TestClient) -> None:
    html = client.get(f"/runs/{BIG_RUN}?tab=decisions&kind=refuse").text
    assert '<option value="refuse" selected>' in html
    entries = html.split("<caption>Entries</caption>")[1]
    assert "[SKIP]" not in entries


def test_forms_network_robots_sections(client: TestClient) -> None:
    forms = text(client.get(f"/fragments/runs/{BIG_RUN}/forms").text)
    assert "Forms 6" in forms and "q search" in forms
    net = client.get(f"/fragments/runs/{BIG_RUN}/network").text
    assert "GET /api/:param" in net and "on state load" in net
    robots = client.get("/fragments/runs/run-001/robots").text
    assert "www.liveinsurer.example" in robots and "HTTP 200" in robots


def test_frontier_pagination_uses_cursor(client: TestClient) -> None:
    html = client.get(f"/fragments/runs/{BIG_RUN}/frontier").text
    nxt = re.search(r'hx-get="([^"]*cursor=[^"]+)"', html)
    assert nxt
    second = client.get(nxt.group(1).replace("&amp;", "&"))
    assert "51–100 of 600" in text(second.text)
    assert second.headers["HX-Push-Url"].startswith(f"/runs/{BIG_RUN}?tab=frontier&cursor=")


def test_unknown_run_is_not_found(client: TestClient) -> None:
    r = client.get("/runs/nope")
    assert r.status_code == 404
    assert "No run with id" in r.text and "[back to overview]" in r.text
    assert client.get("/fragments/runs/nope/states").status_code == 404
    assert client.get(f"/fragments/runs/{BIG_RUN}/bogus").status_code == 404


def test_unknown_tab_falls_back_to_states(client: TestClient) -> None:
    html = client.get(f"/runs/{BIG_RUN}?tab=bogus").text
    assert 'id="region-states"' in html


def test_only_running_runs_carry_the_live_dot(liveinsurer_store: Store) -> None:
    w = liveinsurer_store.connect()
    insert(w, "runs", id="run-live", status="running", started_at="2026-09-26T00:00:00.000Z")
    w.commit()
    with make_client(liveinsurer_store) as c:
        runs = c.get("/fragments/runs").text
        header = c.get("/fragments/runs/run-live/header").text
    assert runs.count('class="live-dot"') == 1
    assert "[RUN.]" in runs and 'class="live-dot"' in header
