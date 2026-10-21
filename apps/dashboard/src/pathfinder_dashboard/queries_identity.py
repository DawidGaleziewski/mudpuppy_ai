"""How the portal model decides that two pages are the same screen (spec 039 T115, T090; owner
answers 5 and 14): the threshold τ in force and who accepted it, the pair labels it is calibrated
on, and the latest similarity classifier with its held-out F1 against τ. Read-only; accepting goes
through the chat service, which computes the calibration (Settings ▸ Screen identity)."""

from __future__ import annotations

import sqlite3
from dataclasses import dataclass


@dataclass(frozen=True)
class Tau:
    value: float
    labels: int
    f1: float | None
    accepted_by: str
    accepted_at: str


@dataclass(frozen=True)
class Classifier:
    f1: float
    tau_f1: float
    better: bool
    labels: int
    trained_at: str
    accepted_by: str | None
    accepted_at: str | None


@dataclass(frozen=True)
class Identity:
    profile: str | None
    tau: Tau | None  # None: the built-in default is in force
    same_labels: int
    distinct_labels: int
    classifier: Classifier | None


def screen_identity(conn: sqlite3.Connection, portal: str) -> Identity:
    """The portal's latest fingerprint profile (that of its newest model version) and its τ, labels
    and classifier. A store before spec 039 answers with nothing in force."""
    try:
        version = conn.execute(
            "SELECT fingerprint_profile FROM model_versions WHERE portal_id = ?"
            " ORDER BY seq DESC LIMIT 1",
            (portal,),
        ).fetchone()
        profile = version[0] if version else None
        tau = conn.execute(
            "SELECT tau, labels, f1, accepted_by, accepted_at FROM tau_acceptances"
            " WHERE portal_id = ? AND profile = ? ORDER BY accepted_at DESC, id DESC LIMIT 1",
            (portal, profile),
        ).fetchone()
        labels = dict(
            conn.execute(
                "SELECT CASE WHEN label = 'distinct' THEN 'distinct' ELSE 'same' END, count(*)"
                " FROM state_pair_labels WHERE portal_id = ? GROUP BY 1",
                (portal,),
            ).fetchall()
        )
        trained = conn.execute(
            "SELECT f1, tau_f1, better, labels, trained_at, accepted_by, accepted_at"
            " FROM similarity_classifiers WHERE portal_id = ? AND profile = ?"
            " ORDER BY trained_at DESC, id DESC LIMIT 1",
            (portal, profile),
        ).fetchone()
    except sqlite3.OperationalError:
        return Identity(None, None, 0, 0, None)
    return Identity(
        profile,
        Tau(*tau) if tau else None,
        labels.get("same", 0),
        labels.get("distinct", 0),
        Classifier(
            trained[0], trained[1], bool(trained[2]), trained[3], *trained[4:]
        ) if trained else None,
    )  # fmt: skip
