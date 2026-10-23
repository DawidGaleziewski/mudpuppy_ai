"""Settings ▸ Hints and Budgets as the chat service takes them (spec 040 T021, 12-v2-ux § 10): a
form's fields (`{field: [values]}`, as a url-encoded post parses) into `PUT /portals/{p}/hints`'s
body. Shared by the htmx route (`web/hints.py`) and the React console's API (`web/api_settings.py`,
spec 068), so both write the portal file the same way (G-13)."""

from __future__ import annotations


def _lines(text: str) -> list[str]:
    return [line.strip() for line in text.splitlines() if line.strip()]


def _flag(line: str) -> dict[str, str]:
    """`cookie ab_calc` · `storage exp.hero` · a bare name is a cookie."""
    kind, _, name = line.partition(" ")
    if kind in ("cookie", "storage") and name.strip():
        return {"kind": kind, "name": name.strip()}
    return {"kind": "cookie", "name": line}


def _number(value: str) -> int | None:
    return int(value) if value.strip().isdigit() else None


def hints_body(form: dict[str, list[str]], part: str) -> dict[str, object] | None:
    """The chat service's body for one plate's form (`hints` or `budgets`); None: not a number."""
    one = {k: (v or [""])[0] for k, v in form.items()}
    if part == "budgets":
        checks, step, scan = (
            _number(one.get(k, ""))
            for k in ("checks_per_scan", "probes_per_step", "probes_per_scan")
        )
        if checks is None or step is None or scan is None:
            return None
        return {"replay_budget": checks, "probes": {"per_step": step, "per_run": scan}}
    return {
        "release_marker": {
            "header": one.get("marker_header", "").strip(),
            "meta": one.get("marker_meta", "").strip(),
        },
        "experiment_flags": [_flag(x) for x in _lines(one.get("ab_flags", ""))],
        "business_errors": _lines(one.get("refusals", "")),
    }
