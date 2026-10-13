"""Salvage Yard foundation (spec 022 M1): the template naming, the one status mapping, the shell,
and the guard against Console-era styling (FE-V01, FE-V02, FE-V07, FE-V08, FE-N01, FE-N03)."""

from __future__ import annotations

import re
import subprocess
from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from pathfinder_dashboard import nav, queries_docs, status_map
from pathfinder_dashboard.models import DECISION_KINDS, FRONTIER_STATUSES, RUN_STATUSES
from pathfinder_dashboard.web.deps import salvage_template

from .conftest import Store, make_client
from .paths import REPO_ROOT

PKG = REPO_ROOT / "apps/dashboard/src/pathfinder_dashboard"
# The app's own copy of the design package's guard (the skill is not exported to export-fork).
GUARD = REPO_ROOT / "apps/dashboard/scripts/find-old-styles.sh"


@pytest.fixture
def salvage(liveinsurer_store: Store) -> Iterator[TestClient]:
    with make_client(liveinsurer_store) as c:
        yield c


# --- template names (no flag any more: every page is Salvage) ------------------------------------


@pytest.mark.parametrize(
    ("template", "expected"),
    [
        ("overview.html", "salvage/overview.html"),
        ("salvage/overview.html", "salvage/overview.html"),
        ("partials/runs_table.html", "salvage/partials/runs_table.html"),
    ],
)
def test_salvage_template_prefix(template: str, expected: str) -> None:
    assert salvage_template(template) == expected


def test_default_page_is_salvage_not_console(client: TestClient) -> None:
    html = client.get("/").text
    assert "salvage.css" in html and "/static/css/app.css" not in html


# --- status map ---------------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("vocabulary", "values"),
    [
        ("run", RUN_STATUSES),
        ("frontier", FRONTIER_STATUSES),
        ("decision", DECISION_KINDS),
        ("doc", queries_docs.DOC_STATUSES),
    ],
)
def test_every_stored_status_has_a_mapping(vocabulary: str, values: tuple[str, ...]) -> None:
    for v in values:
        assert v in status_map.VOCABULARIES[vocabulary], (vocabulary, v)


def test_shapes_are_the_design_enum_and_every_status_has_a_word() -> None:
    for table in status_map.VOCABULARIES.values():
        for s in table.values():
            assert s.shape is None or s.shape in status_map.SHAPES
            assert s.word


def test_console_labels_map_as_the_design_package_says() -> None:
    # docs/design/salvage-yard/migration/status-map.csv
    assert status_map.status_of("run", "completed").shape == "ok"
    assert status_map.status_of("run", "running").shape == "running"
    assert status_map.status_of("run", "interrupted") == ("stopped", "Interrupted")
    assert status_map.status_of("frontier", "skipped_unsafe").shape == "skipped"
    assert status_map.status_of("doc", "draft").shape == "draft"
    assert status_map.status_of("amendment", "superseded") == ("needs", "Re-anchor")
    assert status_map.status_of("confidence", "inferred").shape == "inferred"


def test_unknown_value_keeps_its_text_without_a_shape() -> None:
    assert status_map.status_of("run", "some_new_state") == (None, "some new state")
    assert status_map.status_of("outcome", None) == ("running", "Running")


# --- shell --------------------------------------------------------------------------------------


def test_salvage_page_loads_only_salvage_styles(salvage: TestClient) -> None:
    html = salvage.get("/").text
    css = re.findall(r'<link rel="stylesheet" href="([^"]+)"', html)
    assert css == [
        "/static/salvage/css/tokens.css",
        "/static/salvage/css/fonts.css",
        "/static/salvage/css/salvage.css",
        "/static/css/mp.css",
    ]
    assert "jetbrains" not in html.lower() and "fonts.googleapis" not in html
    assert '<body class="sy-ground"' in html
    assert 'hx-sse:connect="/events"' in html


def test_header_order_and_nav_sections(salvage: TestClient) -> None:
    html = salvage.get("/").text
    header = html[html.index('<header class="sy-header">') : html.index("</header>")]
    order = [
        "sy-wordmark",
        "mp-portal-menu",
        "sy-search",
        "assistant-status",
        "ask-assistant",
        "sy-btn--icon",
    ]
    positions = [header.index(k) for k in order]
    assert positions == sorted(positions)
    navs = re.findall(r'class="sy-nav__item[^"]*"[^>]*>([A-Za-z]+)', html)
    assert navs == [s.label for s in nav.SECTIONS]
    assert re.search(r'class="sy-nav__item" href="/"[^>]*aria-current="page"', html)


def test_one_h1_and_at_most_one_primary(salvage: TestClient) -> None:
    html = salvage.get("/").text
    assert html.count("<h1") == 1
    assert html.count("sy-btn--primary") <= 1
    assert html.count("sy-plate--intent") <= 1


def test_runs_show_status_shapes_and_run_tags(salvage: TestClient) -> None:
    html = salvage.get("/").text
    assert 'class="sy-status" data-status=' in html
    assert '<a class="sy-tag sy-tag--sm" href="/runs/run-009">run-009</a>' in html
    assert "[ OK ]" not in html and "[INT.]" not in html


def test_settings_section_needs_a_portal() -> None:
    assert nav.href_of("settings", None) is None
    assert nav.href_of("settings", "liveinsurer") == "/portals/liveinsurer/settings"
    assert nav.current_section("run") == "scans"


def test_assistant_status_fragment_says_down_without_the_chat_service(salvage: TestClient) -> None:
    html = salvage.get("/fragments/assistant-status").text
    assert 'data-status="failed">Assistant down' in html


# --- every migrated page (Track 1) ---------------------------------------------------------------

LIVEINSURER_PAGES = [
    "/",
    "/activity",
    "/glossary",
    "/glossary/wiki",
    "/runs/run-009",
    *(
        f"/runs/run-009?tab={t}"
        for t in ("actions", "frontier", "forms", "network", "robots", "decisions", "trace", "docs")
    ),
    "/states/state-home",
    "/states/state-home?view=wireframe",
    "/runs/nope",
    "/states/nope",
]


def _salvage_page(html: str) -> None:
    assert '<body class="sy-ground"' in html
    assert "/static/css/app.css" not in html
    # Markup only: the glossary's own text still explains the Console codes until M6 (T041).
    assert "btn-bracket" not in html and 'class="st ' not in html
    assert html.count("sy-btn--primary") <= 1
    assert html.count("sy-plate--intent") <= 1


@pytest.mark.parametrize("path", LIVEINSURER_PAGES)
def test_migrated_pages_render_in_salvage(salvage: TestClient, path: str) -> None:
    r = salvage.get(path)
    assert r.status_code in (200, 404), r.text[:400]
    _salvage_page(r.text)
    assert r.text.count("<h1") == 1


def test_docs_pages_render_in_salvage(ba_fixture: Store) -> None:
    from .test_docs_routes import ALL_PAGES

    with make_client(ba_fixture) as c:
        for path in ALL_PAGES:
            r = c.get(path)
            assert r.status_code == 200, (path, r.text[:400])
            if not path.startswith("/fragments/"):
                _salvage_page(r.text)


# --- new pages: Screens list and search (always Salvage) ----------------------------------------


def test_screens_list_shows_recorded_screens(client: TestClient) -> None:
    html = client.get("/screens").text
    _salvage_page(html)
    assert "Kup ubezpieczenia" in html and 'href="/states/state-home"' in html
    assert re.search(r'class="sy-nav__item" href="/screens"[^>]*aria-current="page"', html)


def test_search_finds_screens_scans_and_escapes_wildcards(client: TestClient) -> None:
    html = client.get("/search", params={"q": "kup"}).text
    _salvage_page(html)
    assert 'href="/states/state-home"' in html
    assert 'href="/runs/run-009"' in client.get("/search", params={"q": "run-00"}).text
    assert "Nothing found" in client.get("/search", params={"q": "%"}).text
    assert "Type in the search field" in client.get("/search").text


# --- style guard (FE-V02) -----------------------------------------------------------------------


def _guard(*paths: Path) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["bash", str(GUARD), *map(str, paths)],
        capture_output=True,
        text=True,
        env={"SY_DS_PATH": str(PKG / "static/salvage"), "PATH": "/usr/bin:/bin"},
        check=False,
    )


def test_salvage_templates_and_app_css_have_no_console_styling() -> None:
    r = _guard(PKG / "templates/salvage", PKG / "static/css/mp.css", PKG / "static/js/shell.js")
    assert r.returncode == 0, r.stdout
