"""Scans ▸ Map (spec 033 US1, US2): the map of a small portal, its filters, the inspector and the
Probe mark that returns to the map. The chat service is mocked (the dashboard never writes)."""

from __future__ import annotations

import json
import re
import sqlite3
import time

import httpx2
import pytest
from fastapi.testclient import TestClient

from pathfinder_dashboard import queries_map, queries_map_node
from pathfinder_dashboard.app import create_app
from pathfinder_dashboard.settings import Settings

from .conftest import Store, insert, ts
from .test_chat import ORIGIN, text

P = "liveinsurer"
# screen → (route, title, states [(id, kind, form step)])
SCREENS = {
    "sc-home": ("/", "Home", [("st-home", "main", None)]),
    "sc-a": ("/a", "Products", [("st-a", "main", None)]),
    "sc-ab": ("/a/b", "One product", [("st-ab", "main", None)]),
    "sc-form": ("/form", "Apply", [("st-f1", "main", "fs-1"), ("st-f1v", "validation", "fs-1")]),
    "sc-direct": ("/direct", "Opened by address", [("st-d", "main", None)]),
}


class Chat:
    def __init__(self) -> None:
        self.calls: list[tuple[str, str]] = []

    def __call__(self, request: httpx2.Request) -> httpx2.Response:
        self.calls.append((request.method, request.url.path))
        return httpx2.Response(201, json={"id": "m-1", "created": True})


def client(store: Store, chat: Chat | None = None) -> TestClient:
    settings = Settings(data_dir=store.data_dir, default_env=store.env, reviewer="Owner")
    return TestClient(create_app(settings, chat_transport=httpx2.MockTransport(chat or Chat())))


def _action(name: str) -> str:
    return json.dumps({"role": "link", "accessible_name": name, "href": f"/{name}"})


def seed(store: Store) -> None:
    """Two scans: r1 (guest) walked / → /a → /a/b and failed one item on /a; r2 (client) went
    / → /form, opened /direct by address and left two items queued on /form."""
    conn = store.connect()
    insert(conn, "runs", id="r1", status="completed", started_at=ts(0))
    insert(conn, "runs", id="r2", persona_id="client", started_at=ts(10))
    conn.execute(
        "INSERT INTO form_steps (id, portal_id, route_template, step_index, form_name,"
        " controls_json, label, first_seen_run, created_at)"
        " VALUES ('fs-1', ?, '/form', 1, NULL, '[]', 'Your details', 'r2', ?)",
        (P, ts(10)),
    )
    for n, (sid, (route, title, states)) in enumerate(SCREENS.items()):
        conn.execute(
            "INSERT INTO screens (id, portal_id, route_template, cluster_id, title,"
            " first_seen_run, created_at) VALUES (?, ?, ?, ?, ?, 'r1', ?)",
            (sid, P, route, f"cl-{sid}", title, ts(n)),
        )
        for rev, (st, kind, fs) in enumerate(states, start=1):
            insert(
                conn, "states", id=st, fingerprint=f"fp-{st}", route_template=route, title=title,
                cluster_id=f"cl-{sid}", first_seen_run="r1", screen_id=sid, screen_rev=rev,
                state_kind=kind, form_step_id=fs, created_at=ts(n),
            )  # fmt: skip
    for run, st, minute in (
        ("r1", "st-home", 0), ("r1", "st-a", 1), ("r1", "st-ab", 2),
        ("r2", "st-home", 10), ("r2", "st-f1", 11), ("r2", "st-f1v", 12), ("r2", "st-d", 13),
    ):  # fmt: skip
        insert(conn, "state_observations", run_id=run, state_id=st, observed_at=ts(minute))
    for eid, run, a, b, minute in (
        ("e1", "r1", "st-home", "st-a", 1),
        ("e2", "r1", "st-a", "st-ab", 2),
        ("e3", "r2", "st-home", "st-f1", 11),
        ("e4", "r2", "st-a", "st-home", 12),
    ):
        insert(conn, "edges", id=eid, run_id=run, from_state=a, to_state=b, created_at=ts(minute))
    for fid, run, st, name, status in (
        ("f1", "r2", "st-f1", "Help", "pending"),
        ("f2", "r2", "st-f1", "Terms", "pending"),
        ("f3", "r1", "st-a", "Gone", "unreachable"),
    ):
        insert(
            conn, "frontier", id=fid, run_id=run, state_id=st, action_json=_action(name),
            status=status, reason=None if status == "pending" else "element gone",
        )  # fmt: skip
    conn.commit()
    conn.close()


def mark(store: Store) -> None:
    conn = store.connect()
    conn.execute(
        "INSERT INTO marks (id, portal_id, kind, target_kind, target_id, created_by, created_at)"
        " VALUES ('m-1', ?, 'probe', 'form_step', 'fs-1', 'Owner', ?)",
        (P, ts(20)),
    )
    conn.commit()
    conn.close()


def view(store: Store, **f: object) -> queries_map.MapView:
    conn = store.connect()
    conn.row_factory = sqlite3.Row  # as the app's read-only connection
    try:
        return queries_map.map_view(conn, P, queries_map.MapFilters(**f))  # type: ignore[arg-type]
    finally:
        conn.close()


def nodes(v: queries_map.MapView) -> dict[str, queries_map.MapNode]:
    return {n.id: n for n in v.nodes}


def test_every_screen_is_a_node_layered_from_the_start(empty_store: Store) -> None:
    seed(empty_store)
    v = view(empty_store)
    n = nodes(v)
    assert v.screens == 5 and v.transitions == 4  # four distinct screen pairs (one back home)
    assert [n[s].depth for s in ("sc-home", "sc-a", "sc-form", "sc-ab")] == [0, 1, 1, 2]
    assert n["sc-direct"].depth == 3  # opened by address: the last row
    assert len(n["sc-form"].states) == 2  # a deck: the step and its validation state


def test_the_drawing_is_the_discovery_tree_and_links_only_on_their_layer(
    empty_store: Store,
) -> None:
    seed(empty_store)
    kinds = [e.kind for e in view(empty_store).edges]
    assert kinds.count("tree") == 3 and "link" not in kinds  # / → /a, /a → /a/b, / → /form
    every = view(empty_store, layers=frozenset({"links"})).edges
    assert [e.kind for e in every].count("link") == 1  # /a → / back home


def test_items_left_on_a_page_are_counted_and_a_failed_one_marks_its_page(
    empty_store: Store,
) -> None:
    seed(empty_store)
    v = view(empty_store)
    n = nodes(v)
    assert n["sc-form"].queued == 2 and v.queued == 2
    assert n["sc-a"].failed == 1 and n["sc-a"].status == "failed"


def test_one_scan_greys_out_what_it_did_not_see(empty_store: Store) -> None:
    seed(empty_store)
    n = nodes(view(empty_store, scan="r1"))
    assert n["sc-a"].status == "failed" and n["sc-form"].status == "unobserved"
    assert n["sc-form"].queued == 0  # the queue of the other scan is not this scan's
    by_persona = nodes(view(empty_store, persona="client"))
    assert by_persona["sc-ab"].status == "unobserved" and by_persona["sc-form"].status == "observed"
    unknown = nodes(view(empty_store, scan="nope"))
    assert unknown["sc-ab"].status == "observed"  # an unknown scan is ignored


def model(store: Store) -> None:
    """A portal model (spec 039) over the seed: /a and /a/b are one screen, the link back home is
    not seen since."""
    conn = store.connect()
    conn.execute(
        "INSERT INTO model_versions (id, portal_id, seq, built_at, algorithm, threshold,"
        " stats_json) VALUES ('mv1', ?, 1, ?, 'minhash-avglink-v1', 0.9, '{}')",
        (P, ts(30)),
    )
    screens = {
        "M1": ("/", ["st-home"]),
        "M2": ("/a", ["st-a", "st-ab"]),
        "M3": ("/form", ["st-f1", "st-f1v"]),
        "M4": ("/direct", ["st-d"]),
    }
    for n, (sid, (route, members)) in enumerate(screens.items(), start=1):
        conn.execute(
            "INSERT INTO model_screens (id, key, portal_id, route_key, title, status,"
            " first_model_version, created_at) VALUES (?, ?, ?, ?, ?, 'active', 'mv1', ?)",
            (sid, f"SC-{n:04d}", P, route, f"Model {route}", ts(30)),
        )
        for o, st in enumerate(members, start=1):
            conn.execute(
                "INSERT INTO screen_members (screen_id, state_id, ordinal, assigned_by,"
                " from_model_version) VALUES (?, ?, ?, 'clustering', 'mv1')",
                (sid, st, o),
            )
    for cid, sid, key in (("ac1", "M1", "link|a|main|"), ("ac2", "M2", "link|home|main|"),
                          ("ac3", "M1", "link|form|main|")):  # fmt: skip
        conn.execute(
            "INSERT INTO action_classes (id, screen_id, element_key, kind, status,"
            " status_model_version) VALUES (?, ?, ?, 'click', 'active', 'mv1')",
            (cid, sid, key),
        )
    for tid, a, ac, b, status, edge in (
        ("t1", "M1", "ac1", "M2", "active", "e1"),
        ("t2", "M2", "ac2", "M1", "not_seen_since", "e4"),
        ("t3", "M1", "ac3", "M3", "active", "e3"),
    ):
        conn.execute(
            "INSERT INTO model_transitions (id, from_screen_id, action_class_id, to_screen_id,"
            " result, internal, support, first_seen_edge_id, last_seen_edge_id, status,"
            " status_model_version) VALUES (?, ?, ?, ?, 'ok', 0, 1, ?, ?, ?, 'mv1')",
            (tid, a, ac, b, edge, edge, status),
        )
    conn.commit()
    conn.close()


def test_with_a_portal_model_the_map_shows_the_portal_as_it_is_now(empty_store: Store) -> None:
    seed(empty_store)
    model(empty_store)
    v = view(empty_store)
    n = nodes(v)
    assert v.screens == 4  # /a and /a/b are one screen of the model
    assert len(n["M2"].states) == 2 and n["M2"].title == "Model /a"
    assert n["M2"].failed == 1  # the frontier item on /a hangs off the model screen
    every = view(empty_store, layers=frozenset({"links"})).edges
    assert [(e.kind, e.shown) for e in every if e.kind == "link"] == [("link", False)]
    assert nodes(view(empty_store, scan="r1"))["sc-ab"].states  # one scan: its own graph


def test_a_marked_form_step_is_a_marked_node(empty_store: Store) -> None:
    seed(empty_store)
    mark(empty_store)
    assert nodes(view(empty_store))["sc-form"].marked


def test_a_merged_screen_is_drawn_in_its_targets_deck(empty_store: Store) -> None:
    """Owner answer Q3 (spec 033 FR-021): a confirmed `same` verdict merged /a/b into /a."""
    seed(empty_store)
    conn = empty_store.connect()
    conn.execute("UPDATE screens SET merged_into = 'sc-a' WHERE id = 'sc-ab'")
    conn.commit()
    conn.row_factory = sqlite3.Row
    try:
        detail = queries_map_node.node_detail(conn, P, "sc-a")
    finally:
        conn.close()
    n = nodes(view(empty_store))
    assert "sc-ab" not in n and [s.id for s in n["sc-a"].states] == ["st-a", "st-ab"]
    assert detail and {s.id for s in detail.states} == {"st-a", "st-ab"}
    assert "/a/b" not in {m.to_route for m in detail.moves}  # a move inside the merge is no move


def test_node_detail_has_states_scans_moves_and_items(empty_store: Store) -> None:
    seed(empty_store)
    conn = empty_store.connect()
    conn.row_factory = sqlite3.Row
    try:
        home = queries_map_node.node_detail(conn, P, "sc-home")
        form = queries_map_node.node_detail(conn, P, "sc-form")
        other = queries_map_node.node_detail(conn, "elsewhere", "sc-home")
    finally:
        conn.close()
    assert home and {m.to_route for m in home.moves} == {"/a", "/form"}
    assert {s.run_id for s in home.scans} == {"r1", "r2"}
    assert form and form.mark_state == "st-f1" and not form.marked
    assert [i.label for i in form.items] == ["Help", "Terms"]
    assert other is None


def test_the_map_page_without_a_portal_asks_for_one(empty_store: Store) -> None:
    with client(empty_store) as c:
        page = c.get("/map").text
    assert "No portal chosen" in page


def test_the_map_page_draws_nodes_tabs_filters_and_a_list(empty_store: Store) -> None:
    seed(empty_store)
    mark(empty_store)
    with client(empty_store) as c:
        page = c.get(f"/map?portal={P}").text
        listed = c.get(f"/map?portal={P}&view=list").text
        junk = c.get(f"/map?portal={P}&layers=bogus&scan=nope&open=x&view=odd")
    assert page.count('<button class="sy-node') == 5 and 'aria-current="page">Map</a>' in page
    assert "5 screens · 4 transitions · 2 queued" in text(page)
    assert "+2 queued" in page and "1 failed" in page
    assert '<span class="sy-tag sy-tag--intent sy-tag--sm">Probe</span>' in page
    assert '<button class="sy-node' not in listed and "Screens by depth" in listed
    assert junk.status_code == 200


def test_the_inspector_fragment_and_its_probe_mark_form(empty_store: Store) -> None:
    seed(empty_store)
    with client(empty_store) as c:
        c.get(f"/map?portal={P}")
        frag = c.get(
            "/fragments/map/node/sc-form", headers={"HX-Current-URL": "http://t/map?scan=r2"}
        )
        missing = c.get("/fragments/map/node/nope")
    assert frag.status_code == 200 and "Mark for probing" in frag.text
    assert 'name="back" value="/map?scan=r2&amp;node=sc-form"' in frag.text
    assert missing.status_code == 404


def test_a_probe_mark_from_the_map_returns_to_the_map(empty_store: Store) -> None:
    seed(empty_store)
    chat = Chat()
    with client(empty_store, chat) as c:
        r = c.post(
            f"/states/st-f1/probe-mark?portal={P}",
            data={"action": "mark", "back": "/map?scan=r2&node=sc-form"},
            headers=ORIGIN,
            follow_redirects=False,
        )
        elsewhere = c.post(
            f"/states/st-f1/probe-mark?portal={P}",
            data={"action": "mark", "back": "https://evil.example/map"},
            headers=ORIGIN,
            follow_redirects=False,
        )
    assert r.status_code == 303 and r.headers["location"].startswith("/map?scan=r2&node=sc-form&")
    assert re.search(r"probe_note=Marked", r.headers["location"])
    assert elsewhere.headers["location"].startswith("/states/st-f1")
    assert chat.calls[0] == ("POST", f"/portals/{P}/marks")


@pytest.mark.perf
def test_a_map_of_three_hundred_screens_opens_in_under_four_seconds(empty_store: Store) -> None:
    """SC-002: 300 screens, every one linking home and to four children, folded into families."""
    conn = empty_store.connect()
    insert(conn, "runs", id="r1", status="completed", started_at=ts(0))
    for i in range(300):
        sid = f"s{i}"
        conn.execute(
            "INSERT INTO screens (id, portal_id, route_template, cluster_id, title,"
            " first_seen_run, created_at) VALUES (?, ?, ?, ?, ?, 'r1', ?)",
            (sid, P, f"/f{i % 12}/p{i}", f"cl-{i}", f"Page {i}", ts(0)),
        )
        insert(
            conn, "states", id=f"st{i}", fingerprint=f"fp{i}", route_template=f"/f{i % 12}/p{i}",
            cluster_id=f"cl-{i}", first_seen_run="r1", screen_id=sid, screen_rev=1,
        )  # fmt: skip
        insert(conn, "state_observations", run_id="r1", state_id=f"st{i}")
    for i in range(1, 300):
        insert(conn, "edges", id=f"e{i}", run_id="r1", from_state=f"st{i // 4}", to_state=f"st{i}")
        insert(conn, "edges", id=f"h{i}", run_id="r1", from_state=f"st{i}", to_state="st0")
    conn.commit()
    conn.close()
    with client(empty_store) as c:
        t = time.perf_counter()
        r = c.get(f"/map?portal={P}")
        took = time.perf_counter() - t
    assert r.status_code == 200 and took < 4, took
    assert "300 screens" in text(r.text)
