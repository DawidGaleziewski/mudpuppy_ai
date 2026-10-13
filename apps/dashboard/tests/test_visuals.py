"""Screenshots, wireframes and highlights (spec 008, contracts/dashboard-routes.md)."""

from __future__ import annotations

import json
import re
import sqlite3
from pathlib import Path

import pytest

from pathfinder_dashboard.visuals import Layout, highlights, load_layout

from .conftest import PORTAL, T0, Store, add_record, insert, make_client

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32  # content is never decoded by the dashboard
SHOT = "1" * 64 + ".png"
LAYOUT = "2" * 64 + ".json"
SVG = "3" * 64 + ".svg"
EXCALIDRAW = "4" * 64 + ".excalidraw"
SNAPSHOT = "5" * 64 + ".yaml"

LAYOUT_DOC = {
    "version": 1,
    "viewport": {"width": 1000, "height": 800},
    "page": {"width": 1000, "height": 2000},
    "cut": False,
    "elements": [
        {
            "key": 'heading "Kalkulator OC/AC"',
            "role": "heading",
            "name": "Kalkulator OC/AC",
            "box": {"x": 100, "y": 50, "width": 500, "height": 40},
        },
        {
            "key": 'spinbutton "Pojemność silnika"',
            "role": "spinbutton",
            "name": "Pojemność silnika",
            "box": {"x": 100, "y": 200, "width": 250, "height": 30},
        },
        {"key": 'button "Ukryty"', "role": "button", "name": "Ukryty", "box": None},
    ],
}


def write_evidence(data_dir: Path) -> None:
    ev = data_dir / "evidence"
    ev.mkdir(parents=True, exist_ok=True)
    (ev / SHOT).write_bytes(PNG)
    (ev / LAYOUT).write_text(json.dumps(LAYOUT_DOC))
    (ev / SVG).write_text('<svg xmlns="http://www.w3.org/2000/svg"><title>w</title></svg>')
    (ev / EXCALIDRAW).write_text('{"type":"excalidraw","version":2,"elements":[]}')
    (ev / SNAPSHOT).write_text('- heading "Kalkulator OC/AC" [level=1]\n')


@pytest.fixture
def visual_store(empty_store: Store) -> Store:
    write_evidence(empty_store.data_dir)
    conn = empty_store.connect()
    insert(conn, "runs", id="run-1", portal_id=PORTAL, environment="sandbox", status="completed")
    insert(
        conn,
        "states",
        id="st-shot",
        portal_id=PORTAL,
        fingerprint="f1",
        title="Kalkulator OC/AC",
        route_template="/kalkulator",
        first_seen_run="run-1",
        screenshot_ref=SHOT,
        layout_ref=LAYOUT,
    )
    insert(
        conn,
        "states",
        id="st-plain",
        portal_id=PORTAL,
        fingerprint="f2",
        title="Kontakt",
        route_template="/kontakt",
        first_seen_run="run-1",
    )
    for sid in ("st-shot", "st-plain"):
        insert(conn, "state_observations", run_id="run-1", state_id=sid)
        conn.execute(
            "INSERT INTO state_wireframes VALUES (?, '1', ?, ?, ?)", (sid, SVG, EXCALIDRAW, T0)
        )
    conn.execute(
        "INSERT INTO analysis_sessions (id, portal_id, status, passes_json, summary, gaps_json,"
        " started_at, ended_at) VALUES ('sess-1', ?, 'completed', '[]', 's', '[]', ?, ?)",
        (PORTAL, T0, T0),
    )
    add_record(
        conn,
        "DI-001",
        "Pojemność silnika",
        [{"evidence": [("state", "st-shot", "run-1", "the calculator")]}],
    )
    conn.execute(
        "INSERT INTO doc_evidence_links (id, revision_id, target_kind, target_id, run_id, note,"
        " region) VALUES ('ev-region-1', 'DI-001-r1', 'screen_region', 'st-shot', 'run-1',"
        " 'the field', 'spinbutton \"Pojemność silnika\"')"
    )
    conn.execute(
        "INSERT INTO doc_evidence_links (id, revision_id, target_kind, target_id, run_id, note,"
        " region) VALUES ('ev-region-2', 'DI-001-r1', 'screen_region', 'st-shot', 'run-1',"
        " NULL, 'button \"Ukryty\"')"
    )
    add_record(
        conn, "SCR-001", "Kontakt", [{"evidence": [("state", "st-plain", "run-1", "the page")]}]
    )
    conn.commit()
    conn.close()
    return empty_store


# --- /evidence/{ref} ---------------------------------------------------------------------------


def test_evidence_route_serves_images_with_immutable_cache(visual_store: Store) -> None:
    with make_client(visual_store) as c:
        r = c.get(f"/evidence/{SHOT}")
        assert r.status_code == 200
        assert r.headers["content-type"] == "image/png"
        assert r.content == PNG
        assert "immutable" in r.headers["cache-control"]
        svg = c.get(f"/evidence/{SVG}")
        assert svg.headers["content-type"].startswith("image/svg+xml")
        assert svg.headers["content-security-policy"].startswith("default-src 'none'")


def test_evidence_route_downloads_with_a_safe_file_name(visual_store: Store) -> None:
    with make_client(visual_store) as c:
        r = c.get(f"/evidence/{EXCALIDRAW}", params={"download": 'Kalkulator "OC/AC"'})
        assert r.status_code == 200
        assert r.headers["content-type"].startswith("application/json")
        assert r.headers["content-disposition"] == (
            'attachment; filename="Kalkulator-OC-AC.excalidraw"'
        )


@pytest.mark.parametrize(
    "ref",
    [
        SNAPSHOT,  # snapshots are never served
        LAYOUT,  # nor layouts
        "..%2F..%2Fdb%2Ftest.sqlite",
        "6" * 64 + ".png",  # well-formed but missing
        "abc.png",
    ],
)
def test_evidence_route_refuses_everything_else(visual_store: Store, ref: str) -> None:
    with make_client(visual_store) as c:
        assert c.get(f"/evidence/{ref}").status_code == 404


# --- /states/{id} -----------------------------------------------------------------------------


def test_state_page_shows_screenshot_wireframe_tab_and_citing_records(visual_store: Store) -> None:
    with make_client(visual_store) as c:
        html = c.get("/states/st-shot").text
    assert f'src="/evidence/{SHOT}"' in html
    assert 'href="/states/st-shot?view=wireframe"' in html
    assert ">Show elements</a>" in html
    assert "sy-mark--overlay" not in html  # outlines only on request
    # the citing records sit on the "Cited by" tab of the side panel
    assert 'href="/states/st-shot?side=cited"' in html
    with make_client(visual_store) as c:
        cited = c.get("/states/st-shot", params={"side": "cited"}).text
    assert "/docs/reference-insurer/DI-001" in cited
    assert "spinbutton &#34;Pojemność silnika&#34;" in cited or 'spinbutton "Pojemność' in cited


def test_state_page_outlines_every_boxed_element_on_request(visual_store: Store) -> None:
    with make_client(visual_store) as c:
        html = c.get("/states/st-shot", params={"elements": 1}).text
    boxes = re.findall(r'<mark class="sy-mark sy-mark--overlay" style="([^"]+)"', html)
    assert len(boxes) == 2  # the hidden button has no box
    assert "left: 10.0%; top: 2.5%; width: 50.0%; height: 2.0%;" in boxes[0]
    assert "2 of 3" in html


def test_state_page_falls_back_to_the_wireframe_without_a_screenshot(visual_store: Store) -> None:
    with make_client(visual_store) as c:
        html = c.get("/states/st-plain").text
    assert f'src="/evidence/{SVG}"' in html
    assert "No screenshot recorded; wireframe shown." in html
    assert f"/evidence/{EXCALIDRAW}?download=Kontakt" in html
    assert "?view=wireframe" in html and 'aria-current="page"' in html


def test_state_page_wireframe_tab(visual_store: Store) -> None:
    with make_client(visual_store) as c:
        html = c.get("/states/st-shot", params={"view": "wireframe"}).text
    assert f'src="/evidence/{SVG}"' in html
    assert ">Download Excalidraw</a>" in html


def test_unknown_state_is_404(visual_store: Store) -> None:
    with make_client(visual_store) as c:
        r = c.get("/states/nope")
    assert r.status_code == 404
    assert "No screen with id" in r.text


def test_run_states_table_links_states_and_shows_thumbnails(visual_store: Store) -> None:
    with make_client(visual_store) as c:
        html = c.get("/runs/run-1").text
    assert f'class="sy-thumb" src="/evidence/{SHOT}"' in html
    assert 'href="/states/st-shot"' in html
    assert 'href="/states/st-plain?view=wireframe"' in html


# --- record page Screens panel -----------------------------------------------------------------


def test_record_screens_panel_outlines_only_this_revisions_regions(visual_store: Store) -> None:
    with make_client(visual_store) as c:
        html = c.get(f"/docs/{PORTAL}/DI-001").text
    panel = html[
        html.index('<details class="sy-disclosure" open><summary><h2 class="sy-h3">Screens') :
    ]
    assert f'src="/evidence/{SHOT}"' in panel
    boxes = re.findall(r'<mark class="sy-mark sy-mark--overlay" style="([^"]+)"', panel)
    assert boxes == ["left: 10.0%; top: 10.0%; width: 25.0%; height: 1.5%;"]
    assert "Not on the screenshot" in panel  # the hidden button's legend entry
    assert "the field" in panel
    # the evidence table names the region and links the state page
    assert 'href="/states/st-shot"' in html


def test_record_screens_panel_uses_the_wireframe_without_a_screenshot(visual_store: Store) -> None:
    with make_client(visual_store) as c:
        html = c.get(f"/docs/{PORTAL}/SCR-001").text
    panel = html[
        html.index('<details class="sy-disclosure" open><summary><h2 class="sy-h3">Screens') :
    ]
    assert f'src="/evidence/{SVG}"' in panel
    assert 'data-status="unobserved">Wireframe' in panel


# --- layout loading ----------------------------------------------------------------------------


def test_load_layout_returns_none_for_missing_or_invalid_files(tmp_path: Path) -> None:
    (tmp_path / "evidence").mkdir()
    bad = "7" * 64 + ".json"
    (tmp_path / "evidence" / bad).write_text("{not json")
    assert load_layout(tmp_path, None) is None
    assert load_layout(tmp_path, "8" * 64 + ".json") is None
    assert load_layout(tmp_path, bad) is None
    assert load_layout(tmp_path, "../x.json") is None


def test_highlights_number_regions_and_mark_missing_boxes() -> None:
    layout = Layout.model_validate(LAYOUT_DOC)
    hl = highlights(layout, [('button "Ukryty"', None), ('heading "Kalkulator OC/AC"', "n")])
    assert [(h.n, h.visible) for h in hl] == [(1, False), (2, True)]
    assert (hl[1].left, hl[1].top, hl[1].width, hl[1].height) == (10.0, 2.5, 50.0, 2.0)
    assert [h.visible for h in highlights(None, [("x", None)])] == [False]


def test_pre_0006_store_still_renders_state_pages(visual_store: Store) -> None:
    """A store without state_wireframes (older migration) must not break the state page."""
    conn: sqlite3.Connection = visual_store.connect()
    conn.execute("PRAGMA foreign_keys = OFF")
    conn.execute("DROP TABLE state_wireframes")
    conn.commit()
    conn.close()
    with make_client(visual_store) as c:
        assert c.get("/states/st-plain").status_code == 200
