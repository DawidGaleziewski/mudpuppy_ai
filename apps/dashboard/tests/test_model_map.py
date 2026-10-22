"""Screens ▸ Map of the portal model (spec 039 T100, designer screen v2-08): views Now and Since
previous release, link states on their layers, the menu bundled, a process overlay, the model
inspector; One scan's path draws the recorded map."""

from __future__ import annotations

import json
import sqlite3

from pathfinder_dashboard import queries_model_map
from pathfinder_dashboard.queries_model_map import ModelFilters

from .conftest import Store
from .test_chat import text
from .test_map import P, client, model, seed
from .test_model_screens import seed_screens


def mapped(store: Store, portal: str = P, **f: object) -> queries_model_map.ModelMap:
    conn = store.connect()
    conn.row_factory = sqlite3.Row  # as the app's read-only connection
    try:
        return queries_model_map.model_map(conn, portal, ModelFilters(**f))  # type: ignore[arg-type]
    finally:
        conn.close()


def edges(m: queries_model_map.ModelMap) -> list[str]:
    return sorted(e.state for e in m.edges)


def menu_link(store: Store, status: str) -> None:
    """A link on every page: /a's menu entry back home."""
    conn = store.connect()
    conn.execute(
        "INSERT INTO action_classes (id, screen_id, element_key, kind, is_global, status,"
        " status_model_version) VALUES ('ac9', 'M2', 'link|menu home|nav|', 'click', 1, ?, 'mv1')",
        (status,),
    )
    conn.execute(
        "INSERT INTO model_transitions (id, from_screen_id, action_class_id, to_screen_id, result,"
        " internal, support, first_seen_transition_id, last_seen_transition_id, status,"
        " status_model_version) VALUES ('t9', 'M2', 'ac9', 'M1', 'ok', 0, 1, 'e4', 'e4', ?, 'mv1')",
        (status,),
    )
    conn.commit()
    conn.close()


def test_now_draws_the_models_screens_and_links_in_their_state(empty_store: Store) -> None:
    seed(empty_store)
    model(empty_store)
    m = mapped(empty_store)
    assert m.screens == 4 and {n.key for n in m.nodes} == {f"SC-000{i}" for i in range(1, 5)}
    assert edges(m) == ["", "", "unseen"]  # the link back home was not seen since
    assert edges(mapped(empty_store, layers=frozenset())) == ["", ""]  # its layer off
    home = next(n for n in m.nodes if n.key == "SC-0001")
    assert home.depth == 0 and home.actions == 0  # both its actions are links: drawn, not counted


def test_links_on_every_page_are_bundled_unless_their_state_changed(empty_store: Store) -> None:
    seed(empty_store)
    model(empty_store)
    menu_link(empty_store, "active")
    m = mapped(empty_store)
    assert m.bundled == 1 and m.bundled_drawn == [] and edges(m) == ["", "", "unseen"]
    conn = empty_store.connect()
    conn.execute(
        "INSERT INTO action_classes (id, screen_id, element_key, kind, status,"
        " status_model_version) VALUES ('ac8', 'M2', 'button|f||', 'click', 'active', 'mv1')"
    )
    conn.commit()
    conn.close()
    a = next(n for n in mapped(empty_store).nodes if n.key == "SC-0002")
    assert a.actions == 1  # the filter stays inside; the menu and the link home are not counted


def test_a_menu_link_not_seen_since_is_drawn_out_of_the_bundle(empty_store: Store) -> None:
    seed(empty_store)
    model(empty_store)
    menu_link(empty_store, "not_seen_since")
    m = mapped(empty_store)
    assert m.bundled == 0 and m.bundled_drawn == ["Model /"]


def test_since_previous_release_chips_changed_screens_and_dims_the_rest(
    empty_store: Store,
) -> None:
    seed_screens(empty_store)
    m = mapped(empty_store, view="since")
    changed = {n.key: n for n in m.nodes}
    assert m.since is not None and m.changed > 0
    assert changed["SC-0001"].chips and not changed["SC-0001"].dim


def test_a_process_overlay_numbers_its_steps_and_fades_the_rest(empty_store: Store) -> None:
    seed_screens(empty_store)
    every = mapped(empty_store)
    assert every.processes and every.overlay is None
    key = every.processes[0][0]
    m = mapped(empty_store, process=key)
    roles = {n.key: n.role for n in m.nodes}
    assert m.overlay and m.overlay[0] == key and roles["SC-0001"] == "Step 1"


def test_a_rule_labels_the_link_it_decides(empty_store: Store) -> None:
    """Spec 039 F-52: the rule's condition on the edge ("age ≥ 18"), and in the list."""
    seed(empty_store)
    model(empty_store)
    claim = {
        "decisionPoint": {"screen": "SC-0001", "action": "link|form|main|"},
        "rules": [
            {"when": {"derived.input.data_urodzenia.age_years": ">= 18"}, "then": "SC-0003 ok"},
            {"when": {"derived.input.data_urodzenia.age_years": "< 18"}, "then": "SC-0002 ok"},
        ],
    }
    conn = empty_store.connect()
    conn.execute(
        "INSERT INTO hypotheses (id, key, portal_id, kind, claim, claim_json, claim_hash, origin,"
        " rule, derived, confidence, model_version_id, created_at) VALUES ('h8', 'H-0008', ?,"
        " 'decision_rule', 'Adults go on.', ?, ?, 'rule', 'R7', 0, 'needs_confirmation', 'mv1',"
        " '2026-09-25T20:00:00.000Z')",
        (P, json.dumps(claim), "8" * 64),
    )
    conn.commit()
    conn.close()
    m = mapped(empty_store)
    assert sorted(e.label for e in m.edges if e.label) == ["age < 18", "age ≥ 18"]
    with client(empty_store) as c:
        page = c.get(f"/map?portal={P}").text
    assert 'class="sy-edge-label"' in page and ">age ≥ 18</text>" in page
    assert "if age ≥ 18" in page  # the list says it too


def test_the_overlay_shows_the_trigger_and_how_journeys_ended(empty_store: Store) -> None:
    """Spec 039 F-52: the overlaid process's trigger and outcomes chipped on their screens."""
    seed_screens(empty_store)
    conn = empty_store.connect()
    conn.execute("PRAGMA foreign_keys = OFF")  # no journey row: only the instance matters here
    conn.execute(
        "INSERT INTO process_instances (id, process_id, journey_id, trigger_kind,"
        " trigger_observation_id, outcome, outcome_screen_id, model_version_id)"
        " VALUES ('pi1', 'p1', 'j1', 'deep_link', 'o0', 'completed', 'M1', 'mv2')"
    )
    conn.commit()
    conn.close()
    key = mapped(empty_store).processes[0][0]
    (home,) = [n for n in mapped(empty_store, process=key).nodes if n.key == "SC-0001"]
    assert ("Trigger · deep link", "") in home.chips and ("Ends completed · 1", "") in home.chips


def test_the_map_page_is_the_models_with_views_and_an_inspector(empty_store: Store) -> None:
    seed(empty_store)
    model(empty_store)
    menu_link(empty_store, "active")
    with client(empty_store) as c:
        page = c.get(f"/map?portal={P}").text
        listed = c.get(f"/map?portal={P}&show=list").text
        since = c.get(f"/map?portal={P}&view=now&view=since").text  # the last view wins
        path = c.get(f"/map?portal={P}&view=path&layers=&layers=unseen").text
        frag = c.get(f"/fragments/map/screen/SC-0002?portal={P}")
        missing = c.get(f"/fragments/map/screen/SC-0404?portal={P}")
        selected = c.get(f"/map?portal={P}&node=SC-0001").text
    flat = text(page)
    assert page.count('<button class="sy-node') == 4 and "sy-edge--unseen" in page
    assert "Menu on every page · 1 link · bundled" in flat
    assert (
        'aria-current="page">Map</a>' in page
        and 'name="view" value="now" aria-pressed="true"' in page
    )
    assert '<button class="sy-node' not in listed and "Screens and links" in listed
    assert 'value="since" aria-pressed="true"' in since
    assert path.count('<button class="sy-node') == 5 and "Screens by depth" in path  # recorded
    assert 'value="path" aria-pressed="true"' in path and 'value="states" checked' in path
    assert frag.status_code == 200 and "Menu · 1 link" in text(frag.text)
    assert missing.status_code == 404
    assert "Actions checked" in selected and 'aria-pressed="true"' in selected
