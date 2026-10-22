"""The similarity classifier (spec 039 FR-050, T090): trained on labelled pairs, compared with
the single threshold on held-out pairs."""

from mudpuppy_miner.classify import classify

NAMES = ["minhash", "structure", "elements"]


def pair(i: int, minhash: float, structure: float, elements: float, same: bool) -> dict:
    return {"id": f"p{i:03d}", "features": [minhash, structure, elements], "same": same}


def test_beats_the_threshold_when_minhash_alone_misleads() -> None:
    # Distinct screens that look alike (MinHash 0.95) but have another structure, and copies of one
    # screen whose text differs (MinHash 0.7) but whose structure is the same.
    pairs = []
    for i in range(40):
        pairs.append(pair(i, 0.95, 0.0, 0.4, same=False))
        pairs.append(pair(100 + i, 0.70, 1.0, 0.9, same=True))
    out = classify({"names": NAMES, "pairs": pairs, "tau": 0.9, "similarity_index": 0})
    assert out["ok"] is True
    assert out["names"] == NAMES
    assert len(out["weights"]) == 3
    assert out["labels"] == 80 and out["held_out"] == 16
    assert out["f1"] == 1.0
    assert out["tau_f1"] == 0.0
    assert out["better"] is True


def test_is_not_better_when_the_threshold_already_separates() -> None:
    pairs = []
    for i in range(20):
        pairs.append(pair(i, 0.5, 0.0, 0.2, same=False))
        pairs.append(pair(100 + i, 0.97, 1.0, 0.9, same=True))
    out = classify({"names": NAMES, "pairs": pairs, "tau": 0.9, "similarity_index": 0})
    assert out["f1"] == out["tau_f1"] == 1.0
    assert out["better"] is False


def test_needs_both_kinds_of_label() -> None:
    pairs = [pair(i, 0.9, 1.0, 1.0, same=True) for i in range(10)]
    out = classify({"names": NAMES, "pairs": pairs, "tau": 0.9, "similarity_index": 0})
    assert out == {"ok": False, "error": "needs labels of both kinds (same and distinct)"}
