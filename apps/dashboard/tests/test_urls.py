"""Spec 019 (R-37/R-38): the dashboard's parameter inventory equals the TypeScript one, and the
state page shows where a screen was reached from."""

from __future__ import annotations

import json
from dataclasses import asdict

from mudpuppy_dashboard import queries_urls

from .conftest import Store, insert, make_client
from .paths import REPO_ROOT

FIXTURE = json.loads(
    (REPO_ROOT / "apps/crawler/tests/fixtures/params/param-inventory.json").read_text("utf-8")
)


def as_contract(s: queries_urls.StateUrls) -> dict[str, object]:
    """The TS field names (`in` is a Python keyword, so the model says `where`)."""
    d = asdict(s)
    for e in d["entry_urls"]:
        del e["last_hops"]  # display only
    for p in d["params"]:
        p["in"] = p.pop("where")
    d["params"] = [
        {k: p[k] for k in ("name", "in", "visits", "values", "distinct", "set_by")}
        for p in d["params"]
    ]
    return d


def test_inventory_equals_the_shared_fixture() -> None:
    got = [as_contract(s) for s in queries_urls.inventory(FIXTURE["visits"])]
    assert got == FIXTURE["expected"]


def test_parse_url_params_keeps_order_repeats_and_valueless() -> None:
    got = queries_urls.parse_url_params("http://x/a;v=1/b.do;jsessionid=Z?a=1&a=2&flag#/p?t=x+y")
    assert [(p.name, p.value, p.where) for p in got] == [
        ("v", "1", "path"),
        ("jsessionid", "Z", "path"),
        ("a", "1", "query"),
        ("a", "2", "query"),
        ("flag", None, "query"),
        ("t", "x y", "fragment_query"),
    ]


def test_state_page_shows_entry_urls_hops_and_parameters(liveinsurer_store: Store) -> None:
    conn = liveinsurer_store.connect()
    state = conn.execute("SELECT id, first_seen_run FROM states LIMIT 1").fetchone()
    insert(
        conn,
        "observations",
        id="visit-1",
        run_id=state[1],
        state_id=state[0],
        transition_id=None,
        via="navigate",
        url="https://liveinsurer.test/oc?wariant=pelny&sid=AB12",
        hops_json=json.dumps(
            [
                {"url": "https://liveinsurer.test/stare/oc.php", "kind": "start"},
                {
                    "url": "https://liveinsurer.test/oc?wariant=pelny&sid=AB12",
                    "kind": "http",
                    "status": 301,
                },
            ]
        ),
        created_at="2026-09-25T19:00:00.000Z",
    )
    conn.commit()
    conn.close()
    with make_client(liveinsurer_store) as c:
        html = c.get(f"/states/{state[0]}").text
    assert "Reached under" in html
    assert "https://liveinsurer.test/oc?wariant=pelny&amp;sid=AB12" in html
    assert "http 301" in html
    assert ">wariant</td>" in html and "pelny" in html
