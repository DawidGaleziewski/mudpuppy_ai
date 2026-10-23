"""Screens of the portal model (spec 039 T100): the seed the Screens API tests share."""

from __future__ import annotations

from .conftest import Store, ts
from .test_changes import P, seed_process_and_releases
from .test_review_queue import seed_queue


def seed_screens(store: Store) -> Store:
    """The queue's model (SC-0001 with two variants) plus a retired SC-0002, and two actions."""
    seed_queue(store)
    seed_process_and_releases(store)
    conn = store.connect()
    conn.execute(
        "INSERT INTO model_screens (id, key, portal_id, route_key, title, status,"
        " first_model_version, created_at) VALUES ('M2', 'SC-0002', ?, '/promo', 'Promocja',"
        " 'retired', 'mv1', ?)",
        (P, ts(1)),
    )
    for aid, el, status in (("a1", "button|dalej||", "active"), ("a2", "link|promo||", "untested")):
        conn.execute(
            "INSERT INTO action_classes (id, screen_id, element_key, kind, status,"
            " status_model_version) VALUES (?, 'M1', ?, 'click', ?, 'mv2')",
            (aid, el, status),
        )
    conn.commit()
    conn.close()
    return store
