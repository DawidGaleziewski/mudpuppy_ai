"""Similarity classifier over fingerprint components (spec 039 FR-050, plan M6, T090).

Input: labelled state pairs, each with its component features (``features`` in the order of
``names``) and ``same`` (a person's label: one screen or two), plus ``tau`` and the index of the
MinHash similarity feature. A logistic regression (random_state 0) is trained on a deterministic
split: every fifth pair, by pair id, is held out. The output compares, on the held-out pairs, the
F1 of detecting distinct pairs by the classifier (P(same) < 0.5) with the single threshold
(MinHash similarity < tau), and gives the weights trained on all pairs so the reconciler can
score pairs without Python. Nothing here writes the store.
"""

from __future__ import annotations

from typing import Any

HOLD_OUT_EVERY = 5


def _f1_distinct(predicted_distinct: list[bool], distinct: list[bool]) -> float:
    tp = sum(p and d for p, d in zip(predicted_distinct, distinct, strict=True))
    fp = sum(p and not d for p, d in zip(predicted_distinct, distinct, strict=True))
    fn = sum(d and not p for p, d in zip(predicted_distinct, distinct, strict=True))
    if tp == 0:
        return 0.0
    precision = tp / (tp + fp)
    recall = tp / (tp + fn)
    return round(2 * precision * recall / (precision + recall), 4)


def _fit(rows: list[list[float]], labels: list[int]) -> Any:
    from sklearn.linear_model import LogisticRegression

    model = LogisticRegression(random_state=0, max_iter=1000)
    model.fit(rows, labels)
    return model


def classify(data: dict[str, Any]) -> dict[str, Any]:
    names: list[str] = data["names"]
    pairs = sorted(data["pairs"], key=lambda p: p["id"])
    tau = float(data["tau"])
    sim_at = int(data["similarity_index"])
    labels = [1 if p["same"] else 0 for p in pairs]
    if len(set(labels)) < 2:
        return {"ok": False, "error": "needs labels of both kinds (same and distinct)"}
    held = [i for i in range(len(pairs)) if i % HOLD_OUT_EVERY == HOLD_OUT_EVERY - 1]
    train = [i for i in range(len(pairs)) if i not in set(held)]
    if len({labels[i] for i in train}) < 2 or not held:
        return {"ok": False, "error": "too few labels to hold some out"}
    rows = [[float(x) for x in p["features"]] for p in pairs]
    model = _fit([rows[i] for i in train], [labels[i] for i in train])
    distinct = [labels[i] == 0 for i in held]
    by_model = [bool(model.predict_proba([rows[i]])[0][1] < 0.5) for i in held]
    by_tau = [rows[i][sim_at] < tau for i in held]
    full = _fit(rows, labels)
    f1, tau_f1 = _f1_distinct(by_model, distinct), _f1_distinct(by_tau, distinct)
    return {
        "ok": True,
        "names": names,
        "weights": [round(float(w), 6) for w in full.coef_[0]],
        "intercept": round(float(full.intercept_[0]), 6),
        "labels": len(pairs),
        "held_out": len(held),
        "f1": f1,
        "tau_f1": tau_f1,
        "better": f1 > tau_f1,
    }
