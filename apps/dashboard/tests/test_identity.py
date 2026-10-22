"""Screen identity (spec 039 T115, owner answer 5): τ is the profile's default until a person
accepts a calibrated one for the latest model version's fingerprint profile."""

from __future__ import annotations

from mudpuppy_dashboard.queries_identity import screen_identity

from .conftest import Store, ts

P = "liveinsurer"


def test_tau_is_in_force_once_a_person_accepts_it_for_the_profile(empty_store: Store) -> None:
    conn = empty_store.connect()
    conn.execute(
        "INSERT INTO model_versions (id, portal_id, seq, built_at, algorithm, threshold,"
        " stats_json, fingerprint_profile) VALUES ('mv1', ?, 1, ?, 'minhash-avglink-v1', 0.9,"
        " '{}', 'rows-v2@0123abcd')",
        (P, ts(1)),
    )
    conn.commit()
    assert screen_identity(conn, P).tau is None
    conn.execute(
        "INSERT INTO tau_acceptances (id, portal_id, profile, tau, labels, f1, accepted_by,"
        " accepted_at) VALUES ('t0', ?, 'rows-v1', 0.8, 10, 0.9, 'Old', ?),"
        " ('t1', ?, 'rows-v2@0123abcd', 0.93, 60, 0.97, 'Owner', ?)",
        (P, ts(2), P, ts(3)),
    )
    conn.commit()
    i = screen_identity(conn, P)
    conn.close()
    assert i.profile == "rows-v2@0123abcd"
    assert i.tau is not None and (i.tau.value, i.tau.accepted_by) == (0.93, "Owner")
