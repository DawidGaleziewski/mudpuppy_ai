"""The probe suite editor in Review (spec 032 US3; owner 2026-10-17: add variants and edit their
steps there). Pure: the posted form and the suite's trace in, the edited trace out. The chat
service validates it as a traces.yaml entry and keeps it; the dashboard never writes.

Form fields: `variants` (count); per variant i `v{i}.id`, `v{i}.keep`, `v{i}.expect`,
`v{i}.steps` (count) and per step j `v{i}.s{j}.kind|name|value|drop` (one extra empty row adds a
step); a new variant `new.id`, `new.expect`, `new.from` (the variant whose steps it copies)."""

from __future__ import annotations

from typing import Any

KINDS = ("fill", "select", "check", "click")
EXPECTS = ("proceed", "validation_error", "technical_error", "branch")

Form = dict[str, list[str]]


def _one(form: Form, key: str) -> str:
    return (form.get(key) or [""])[0].strip()


def _intent(kind: str, name: str, value: str) -> str:
    return {
        "click": f"press {name}",
        "check": f"choose {name}",
        "select": f"pick {value} for {name}",
    }.get(kind, f"enter {name}")


def _steps(form: Form, i: int, old: list[dict[str, Any]]) -> list[dict[str, Any]]:
    count = int(_one(form, f"v{i}.steps") or "0")
    out: list[dict[str, Any]] = []
    for j in range(count + 1):  # the last row is the empty "add a step" row
        p = f"v{i}.s{j}."
        name, kind, value = _one(form, p + "name"), _one(form, p + "kind"), _one(form, p + "value")
        if not name or _one(form, p + "drop") or kind not in KINDS:
            continue
        before = old[j] if j < len(old) else {}
        same = before.get("name") == name and before.get("kind") == kind
        step: dict[str, Any] = {
            "name": name,
            "kind": kind,
            "intent": before["intent"]
            if same and before.get("intent")
            else _intent(kind, name, value),
        }
        if kind in ("fill", "select"):
            step["value"] = value
        out.append(step)
    return out


def edited_trace(trace: dict[str, Any], form: Form) -> dict[str, Any]:
    """The suite as the owner left it: kept variants with their edited steps, plus a new one."""
    old = {v["id"]: v for v in trace.get("variants", [])}
    variants: list[dict[str, Any]] = []
    for i in range(int(_one(form, "variants") or "0")):
        vid = _one(form, f"v{i}.id")
        if vid not in old or not _one(form, f"v{i}.keep"):
            continue
        before = old[vid]
        expect = _one(form, f"v{i}.expect") or before["expect"]
        rows = before.get("steps") or trace.get("steps") or []
        v = {**before, "expect": expect, "steps": _steps(form, i, rows)}
        if expect != "technical_error":
            v.pop("fault", None)  # a fault goes with a technical variant only
        variants.append(v)
    new_id = _one(form, "new.id")
    source = next((v for v in variants if v["id"] == _one(form, "new.from")), None)
    if new_id and source is not None:
        expect = _one(form, "new.expect") if _one(form, "new.expect") in EXPECTS else "proceed"
        new = {"id": new_id, "expect": expect, "steps": [dict(s) for s in source["steps"]]}
        if expect == "technical_error" and source.get("fault"):
            new["fault"] = source["fault"]
        variants.append(new)
    return {**trace, "variants": variants}
