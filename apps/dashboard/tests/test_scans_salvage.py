"""Scans (spec 022 screen 10, T030): the live monitor of the running scan, the history with what
each scan changed, the Server activity tab and the nav marker.
Home's resume row is asserted in test_assistant_cards."""

from __future__ import annotations

import json
import re

import httpx2
from fastapi.testclient import TestClient

from pathfinder_dashboard.app import create_app
from pathfinder_dashboard.settings import Settings

from .conftest import Store, insert, ts
from .test_chat import Service, text
from .test_chat_forms import seed_amendment

PORTAL = "liveinsurer"
CONFIG = json.dumps({"portal": {"id": PORTAL, "scope": {"max_steps": 400}}})


def client(store: Store) -> TestClient:
    settings = Settings(data_dir=store.data_dir, default_env=store.env, ui_salvage="all")
    return TestClient(create_app(settings, chat_transport=httpx2.MockTransport(Service())))


def seed(store: Store) -> Store:
    """run-old completed (the baseline, 2 screens), run-mid interrupted (changed one screen and
    flagged one amendment), run-live running with 3 pages seen and 2 queued."""
    conn = store.connect()
    for rid, minute, status, steps in (
        ("run-old", 0, "completed", 320),
        ("run-mid", 10, "interrupted", 84),
        ("run-live", 20, "running", 171),
    ):
        insert(
            conn,
            "runs",
            id=rid,
            status=status,
            steps_used=steps,
            started_at=ts(minute),
            config_snapshot=CONFIG,
            elapsed_ms=60_000,
        )
    insert(conn, "runs", id="run-other", portal_id="wikipedia", started_at=ts(30))
    for sid, route, fp, run, rev in (
        ("st-home", "/", "fp-a", "run-old", 1),
        ("st-kontakt", "/kontakt", "fp-b", "run-old", 1),
        ("st-kontakt2", "/kontakt", "fp-c", "run-mid", 2),
    ):
        if rev == 1:
            insert(
                conn,
                "screens",
                id=f"sc-{sid}",
                portal_id=PORTAL,
                route_template=route,
                cluster_id=f"cl-{sid}",
                title=f"Title {route}",
                first_seen_run=run,
                created_at=ts(0),
            )
        insert(
            conn,
            "states",
            id=sid,
            fingerprint=fp,
            route_template=route,
            title=f"Title {route}",
            first_seen_run=run,
            screen_id="sc-st-kontakt" if rev == 2 else f"sc-{sid}",
            screen_rev=rev,
        )
    for i, sid in enumerate(("st-home", "st-kontakt", "st-kontakt2")):
        insert(conn, "state_observations", run_id="run-live", state_id=sid, observed_at=ts(21 + i))
    insert(conn, "state_observations", run_id="run-old", state_id="st-home", observed_at=ts(1))
    for n in range(2):
        insert(conn, "frontier", id=f"fr-{n}", run_id="run-live", state_id="st-home")
    insert(conn, "frontier", id="fr-done", run_id="run-live", state_id="st-home", status="done")
    conn.commit()
    conn.close()
    seed_amendment(
        store,
        1,
        target_id="st-home",  # a recorded state: the target is a foreign key since 0041
        status="needs_reanchor",
        superseded_by_run="run-mid",
        superseded_reason="element_removed",
        superseded_at=ts(11),
    )
    return store


def test_monitor_shows_steps_pages_queue_routes_and_stop(empty_store: Store) -> None:
    with client(seed(empty_store)) as c:
        body = c.get("/scans?portal=liveinsurer").text
    flat = text(body)
    assert body.count("<h1") == 1 and "Scans" in flat
    assert 'aria-valuenow="171"' in body and 'aria-valuemax="400"' in body
    assert "--value: 42.75%" in body
    assert "171 / 400 steps" in flat and "3 pages recorded" in flat and "2 still queued" in flat
    assert 'data-stop-run="/chat/runs/run-live/stop"' in body
    assert "Stop scan" in flat and "Resume with the assistant" not in flat
    # routes in the order seen: / then /kontakt twice (two revisions of one route)
    assert re.search(r'sy-route">/</span>.*sy-route">/kontakt</span>', body, re.S)
    assert 'id="region-scans"' in body and 'hx-get="/fragments/scans' in body
    assert 'hx-trigger="store-changed' in body
    assert body.count("sy-btn--primary") == 0 and body.count("sy-plate--intent") == 0


def test_history_lists_newest_first_with_what_changed(empty_store: Store) -> None:
    with client(seed(empty_store)) as c:
        body = c.get("/scans?portal=liveinsurer").text
    flat = text(body)
    assert "3 scans" in flat and "1 running" in flat and "1 interrupted" in flat
    table = body[body.index("All scans of liveinsurer") :]
    assert table.index("run-live") < table.index("run-mid") < table.index("run-old")
    assert 'href="/runs/run-mid"' in table and "sy-tag" in table
    assert "wikipedia" not in table and "run-other" not in body
    assert "first scan: baseline" in flat
    assert "1 changed" in flat and "1 to re-anchor" in flat
    assert "Changed to r2" in flat and 'href="/states/st-kontakt2"' in body
    assert 'href="/review?portal=liveinsurer&amp;show=reanchor"' in body or "show=reanchor" in body
    assert "no screen changes recorded" in flat  # the running scan changed nothing


def test_interrupted_newest_scan_offers_resume_through_home(empty_store: Store) -> None:
    store = seed(empty_store)
    conn = store.connect()
    conn.execute("UPDATE runs SET status = 'interrupted' WHERE id = 'run-live'")
    conn.commit()
    conn.close()
    with client(store) as c:
        body = c.get("/scans?portal=liveinsurer").text
    assert "data-stop-run" not in body
    assert re.search(r'href="/chat[^"]*">Resume with the assistant', body)
    assert (
        'data-status="stopped"' in body
        and 'data-status="running"' not in body.split("All scans")[0]
    )


def test_empty_states_and_escaping(empty_store: Store) -> None:
    with client(empty_store) as c:
        assert "No scans recorded yet" in text(c.get("/scans?portal=liveinsurer").text)
        assert "No portal chosen" in text(c.get("/scans?portal=").text)
    conn = empty_store.connect()
    insert(conn, "runs", id="run-x", persona_id="<b>guest</b>", started_at=ts(1))
    conn.commit()
    conn.close()
    with client(empty_store) as c:
        body = c.get("/scans?portal=liveinsurer").text
    assert "<b>guest</b>" not in body and "&lt;b&gt;guest&lt;/b&gt;" in body


def test_fragment_and_nav_and_activity_tab(empty_store: Store) -> None:
    with client(seed(empty_store)) as c:
        frag = c.get("/fragments/scans?portal=liveinsurer").text
        page = c.get("/scans?portal=liveinsurer").text
        activity = c.get("/activity?portal=liveinsurer").text
        run = c.get("/runs/run-live?portal=liveinsurer").text
    assert (
        frag.lstrip().startswith("<section") and "<html" not in frag and "171 / 400" in text(frag)
    )
    assert re.search(r'href="/scans[^"]*"[^>]*aria-current="page"[^>]*>\s*Scans', page)
    assert 'href="/activity' in page and "Server activity" in page
    assert "Server activity" in activity and re.search(r'href="/scans[^"]*"', activity)
    assert re.search(r'<a class="sy-tab" href="/activity[^"]*" aria-current="page"', activity)
    assert re.search(
        r'href="/scans[^"]*"[^>]*aria-current="page"', run
    )  # run detail still in Scans
