"""Spec 024 P2 views: unexplained differences in Review (US3.3), what explains each difference and
two variants side by side on the screen page's Access tab (US3.1, US3.4). Same shared fixture as
`test_access.py`: BR-001 explains Export, BR-004 Invoices, OQ-001 Admin's reach; the Account
screen's `menu` is the one unexplained difference."""

from __future__ import annotations

import re
from pathlib import Path

import pytest

from .conftest import Store, insert
from .test_access import load_fixture
from .test_access_pages import client, squash

MENU = "sc-account|menu"


@pytest.fixture
def personas_dir(tmp_path: Path) -> Path:
    """basic has attributes, b2b and premium have no persona file here."""
    d = tmp_path / "personas" / "access-shop"
    d.mkdir(parents=True)
    (d / "basic.yaml").write_text("attributes: { tariff: basic }\n")
    return tmp_path / "personas"


def test_review_lists_only_the_unexplained_difference(
    empty_store: Store, personas_dir: Path
) -> None:
    load_fixture(empty_store)
    c = client(empty_store, personas_dir)
    r = c.get("/review?show=differences")
    assert r.status_code == 200
    text = squash(r.text)
    assert "Unexplained differences 1" in text
    assert "Account /account menu" in text
    assert 'menuitem "Invoices"' not in text  # BR-004 explains it
    # The nav's Review marker counts it, beside 5 draft records to confirm (BR-003 is withdrawn).
    assert re.search(r"Review\s*<span[^>]*>\s*6\s*<", r.text)


def test_selected_difference_names_who_sees_it_and_links_side_by_side(
    empty_store: Store, personas_dir: Path
) -> None:
    load_fixture(empty_store)
    r = client(empty_store, personas_dir).get(f"/review?show=differences&select=differences:{MENU}")
    assert r.status_code == 200
    pane = squash(r.text.split('aria-labelledby="sel-h"', 1)[1])
    assert "Seen by b2b no attributes Not seen by basic tariff: basic premium" in pane
    assert "/states/st-acc-2?side=access&amp;left=b2b&amp;right=basic" in r.text


def test_reach_difference_has_no_compare_link(empty_store: Store, personas_dir: Path) -> None:
    load_fixture(empty_store)
    conn = empty_store.connect()
    conn.execute("UPDATE doc_records SET withdrawn = 1 WHERE key = 'OQ-001'")
    conn.commit()
    conn.close()
    r = client(empty_store, personas_dir).get(
        "/review?show=differences&select=differences:sc-admin|"
    )
    pane = squash(r.text.split('aria-labelledby="sel-h"', 1)[1])
    assert "Reached by b2b" in pane
    assert "Not reached by basic tariff: basic premium" in pane
    assert "side by side" not in pane


def test_access_tab_shows_what_explains_each_difference(
    empty_store: Store, personas_dir: Path
) -> None:
    load_fixture(empty_store)
    r = client(empty_store, personas_dir).get("/states/st-acc-2?side=access")
    rows = dict(
        re.findall(r"mp-break\">([^<]*)</span><span[^>]*data-explained>(.*?)</span></span>", r.text)
    )
    assert squash(rows["menuitem &#34;Invoices&#34;"]).strip() == "BR-004"
    assert squash(rows["menu"]).strip() == "Unexplained"
    assert "/docs/access-shop/BR-004" in r.text
    admin = squash(client(empty_store, personas_dir).get("/states/st-admin-1?side=access").text)
    assert "Not reached by basic, premium OQ-001" in admin


def test_side_by_side_defaults_to_a_seer_and_a_non_seer(
    empty_store: Store, personas_dir: Path
) -> None:
    load_fixture(empty_store)
    text = squash(client(empty_store, personas_dir).get("/states/st-acc-1?side=access").text)
    assert (
        'Only b2b menu menuitem "Invoices"' in text or 'Only b2b menuitem "Invoices" menu' in text
    )
    assert "Only basic none" in text
    assert "The same 1 element" in text


def test_side_by_side_takes_the_asked_personas_and_ignores_unknown_ones(
    empty_store: Store, personas_dir: Path
) -> None:
    load_fixture(empty_store)
    c = client(empty_store, personas_dir)
    text = squash(c.get("/states/st-home-1?side=access&left=premium&right=basic").text)
    assert 'Only premium button "Export"' in text
    assert "The same 2 elements" in text
    fallback = squash(c.get("/states/st-home-1?side=access&left=nobody&right=basic").text)
    assert 'Only b2b button "Export"' in fallback  # first seer, first non-seer
    frag = c.get("/fragments/states/st-home-1/access?left=premium&right=basic")
    assert frag.status_code == 200
    assert "left=premium" in frag.text and "Only premium" in squash(frag.text)


def test_side_by_side_pairs_renamed_text_and_escapes(
    empty_store: Store, personas_dir: Path
) -> None:
    load_fixture(empty_store)
    conn = empty_store.connect()
    common = {
        "action_json": "{}",
        "safety_class": "read",
        "allowed": 1,
        "role": "link",
        "created_at": "2026-10-14T09:00:00.000Z",
    }
    for id_, run, state, name in (
        ("x-l", "run-b2b", "st-acc-2", "<b>Cart (1)</b>"),
        ("x-r", "run-basic", "st-acc-1", "<b>Cart (0)</b>"),
    ):
        insert(conn, "actions", id=id_, run_id=run, state_id=state, accessible_name=name, **common)
    conn.commit()
    conn.close()
    r = client(empty_store, personas_dir).get("/states/st-acc-1?side=access&left=b2b&right=basic")
    assert "<b>Cart" not in r.text
    assert 'Text differs link "<b>Cart (1)</b>" → link "<b>Cart (0)</b>"' in squash(r.text)


def test_one_persona_cannot_be_compared(empty_store: Store, personas_dir: Path) -> None:
    load_fixture(empty_store)
    text = squash(client(empty_store, personas_dir).get("/states/st-admin-1?side=access").text)
    assert "Side by side needs two personas that reached this screen." in text
