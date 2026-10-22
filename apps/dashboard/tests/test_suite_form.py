"""The probe suite editor's form → trace (spec 032 US3, owner 2026-10-17): kept variants, edited
and dropped steps, an added step, a copied variant, and a fault only on a technical variant."""

from __future__ import annotations

from mudpuppy_dashboard.suite_form import edited_trace

TRACE = {
    "id": "quote",
    "name": "Get a quote",
    "goal": "G",
    "start_url": "/sc19/apply",
    "steps": [{"name": "Next", "kind": "click", "intent": "go on"}],
    "variants": [
        {
            "id": "happy-path",
            "expect": "proceed",
            "probe": "happy-path",
            "steps": [
                {"name": "Start date", "kind": "fill", "value": "15.01.2027", "intent": "enter it"},
                {"name": "Next", "kind": "click", "intent": "go on"},
            ],
        },
        {"id": "quote-500", "expect": "technical_error", "fault": "http_500"},
    ],
}


def form(**over: str) -> dict[str, list[str]]:
    base = {
        "variants": "2",
        "v0.id": "happy-path", "v0.keep": "1", "v0.expect": "proceed", "v0.steps": "2",
        "v0.s0.kind": "fill", "v0.s0.name": "Start date", "v0.s0.value": "16.01.2027",
        "v0.s1.kind": "click", "v0.s1.name": "Next",
        "v1.id": "quote-500", "v1.keep": "1", "v1.expect": "technical_error", "v1.steps": "1",
        "v1.s0.kind": "click", "v1.s0.name": "Next",
    }  # fmt: skip
    return {k: [v] for k, v in {**base, **over}.items()}


def test_edits_values_keeps_intents_and_adds_a_step() -> None:
    t = edited_trace(TRACE, form(**{"v0.s2.kind": "check", "v0.s2.name": "I agree"}))
    steps = t["variants"][0]["steps"]
    assert steps[0] == {
        "name": "Start date",
        "kind": "fill",
        "intent": "enter it",
        "value": "16.01.2027",
    }
    assert steps[-1] == {"name": "I agree", "kind": "check", "intent": "choose I agree"}
    assert t["variants"][1]["fault"] == "http_500"


def test_drops_steps_and_variants_and_drops_a_fault_off_a_non_technical_variant() -> None:
    t = edited_trace(TRACE, form(**{"v0.s0.drop": "1", "v1.expect": "proceed"}))
    assert [s["name"] for s in t["variants"][0]["steps"]] == ["Next"]
    assert "fault" not in t["variants"][1]
    gone = edited_trace(TRACE, {k: v for k, v in form().items() if k != "v1.keep"})
    assert [v["id"] for v in gone["variants"]] == ["happy-path"]


def test_copies_a_variant_into_a_new_one() -> None:
    t = edited_trace(TRACE, form(**{"new.id": "late-date", "new.from": "happy-path",
                                    "new.expect": "validation_error"}))  # fmt: skip
    new = t["variants"][-1]
    assert new["id"] == "late-date" and new["expect"] == "validation_error"
    assert new["steps"] == t["variants"][0]["steps"] and "fault" not in new
