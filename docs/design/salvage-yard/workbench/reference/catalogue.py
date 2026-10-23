"""The catalogue and its guardrails: validate what the assistant returns before anything is rendered.

Rules (docs/17-genui-architecture.md §5.1):
- The JSON Schemas in ../schema are the contract. They are generated (../tools/gen_wb_schema.py); never edit them by hand.
- Validation runs in layers. Drop, don't fail: a bad component is dropped with a reason code, not the whole view.
  The envelope is repaired where it can be (why, suggestions, path). Nothing left → plain chat (the caller decides).
- Reason codes are fixed (examples/invalid/EXPECTED.json): repaired_why · repaired_suggestions · repaired_path ·
  unknown_type · missing_id · bad_bind_or_props · not_on_path · not_in_phase · id_not_found · duplicate_id · duplicate · too_many
- The server decides placement from path + phase + layout; the model never chooses layout.
- Narration: every number in a line must appear in an event it cites, or the line is replaced by a templated one.
"""
import copy
import json
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import NamedTuple

from jsonschema import Draft202012Validator

SCHEMA = Path(__file__).resolve().parent.parent / "schema"


def _load(name):
    return json.loads((SCHEMA / name).read_text(encoding="utf-8"))


VIEW_SCHEMA = _load("view-spec.schema.json")
VIEW = Draft202012Validator(VIEW_SCHEMA)
NARRATION = Draft202012Validator(_load("narration.schema.json"))
COMMAND = Draft202012Validator(_load("command.schema.json"))
CATALOGUE = {c["type"]: c for c in _load("catalogue.json")["components"]}
LIMITS = _load("catalogue.json")["limits_per_path"]
COMMANDS = {c["name"]: c for c in _load("commands.json")["commands"]}
# one validator per component type, against its own $defs entry
COMPONENT = {t: Draft202012Validator({"$ref": f"#/$defs/{t}", "$defs": VIEW_SCHEMA["$defs"]}) for t in CATALOGUE}

PATH_PHASE = {"chat": 1, "mapping": 1, "troubleshoot": 2, "explain": 3}   # first phase a path is available in
PATH_LABEL = {"chat": "Chat", "mapping": "Mapping", "troubleshoot": "Troubleshoot", "explain": "Explain"}
GENERIC_WHY = "Composed for your request."


class Drop(NamedTuple):
    index: int | None       # component index in the raw spec (None for envelope repairs)
    type: str               # component type, or the repaired field
    code: str               # fixed reason code (logged, tested)
    text: str               # the same in words (Why this view? › Left out)


@dataclass
class Checked:
    spec: dict | None                                # the cleaned spec, or None → plain chat
    dropped: list = field(default_factory=list)       # [Drop]
    rejected: str | None = None                      # why the whole view was rejected

    @property
    def components(self):
        return self.spec["components"] if self.spec else []

    @property
    def codes(self):
        return [d.code for d in self.dropped]


def paths_for(phase):
    return [p for p, ph in PATH_PHASE.items() if ph <= phase]


def layout_for(path, phase, focus=False):
    """Chat always renders inline (cards in the conversation). Other paths use the phase's layout."""
    if path == "chat" or phase <= 1:
        return "inline"
    return "focus" if (phase >= 3 and focus) else "split"


def check_view(raw, phase, resolve, current_path="chat"):
    """Validate a view spec in layers. `resolve(kind, value) -> bool` answers whether an id exists."""
    if not isinstance(raw, dict):
        return Checked(None, rejected="not an object")
    comps = raw.get("components") if isinstance(raw.get("components"), list) else []
    env = {k: copy.deepcopy(v) for k, v in raw.items() if k in VIEW_SCHEMA["properties"] and k != "components"}
    env["version"], env["components"] = "1", []
    dropped = []

    # 1 · envelope: repair what we can
    for err in VIEW.iter_errors(env):
        key = (list(err.absolute_path) or [None])[0]
        missing = err.validator == "required" and err.message.split("'")[1:2]
        key = key or (missing[0] if missing else None)
        if key == "why":
            env["why"] = GENERIC_WHY
            dropped.append(Drop(None, "why", "repaired_why", "why was not plain words; replaced"))
        elif key == "suggestions":
            env["suggestions"] = []
            dropped.append(Drop(None, "suggestions", "repaired_suggestions", "suggestions were not plain words; removed"))
        elif key == "path":
            env["path"] = current_path
            dropped.append(Drop(None, "path", "repaired_path", f"unknown path; kept {current_path}"))
        elif key == "select":
            env.pop("select", None)                          # 6 · a select that doesn't fit is ignored
    if list(VIEW.iter_errors(env)):
        return Checked(None, dropped, rejected="the envelope could not be repaired")
    path = env["path"]
    if PATH_PHASE[path] > phase:
        return Checked(None, dropped, rejected=f"path {path} is not available in phase {phase}")

    # 2–5 · each component on its own, then limits
    kept, ids, binds = [], set(), set()
    for i, c in enumerate(comps):
        t = c.get("type") if isinstance(c, dict) else None
        meta = CATALOGUE.get(t)
        if not meta:
            dropped.append(Drop(i, str(t), "unknown_type", f"{t!r} is not in the catalogue"))
        elif "id" not in c:
            dropped.append(Drop(i, t, "missing_id", "no component id"))
        elif list(COMPONENT[t].iter_errors(c)):
            err = next(COMPONENT[t].iter_errors(c))
            dropped.append(Drop(i, t, "bad_bind_or_props", f"bind or props do not match the catalogue ({err.message[:60]})"))
        elif path not in meta["paths"]:
            dropped.append(Drop(i, t, "not_on_path", f"{t} is not allowed on the {path} path"))
        elif meta["phase"] > phase:
            dropped.append(Drop(i, t, "not_in_phase", f"{t} arrives in phase {meta['phase']}"))
        elif not _ids_resolve(c, resolve):
            dropped.append(Drop(i, t, "id_not_found", "an id does not exist"))
        elif c["id"] in ids:
            dropped.append(Drop(i, t, "duplicate_id", f"id {c['id']!r} is used twice"))
        elif (t, json.dumps(c["bind"], sort_keys=True)) in binds:
            dropped.append(Drop(i, t, "duplicate", "same component and binding as an earlier one"))
        else:
            ids.add(c["id"])
            binds.add((t, json.dumps(c["bind"], sort_keys=True)))
            kept.append((i, dict(copy.deepcopy(c), props=c.get("props", {}))))
    limit = LIMITS[path]
    for i, c in kept[limit:]:
        dropped.append(Drop(i, c["type"], "too_many", f"more than {limit} components on the {path} path"))
    env["components"] = [c for _, c in kept[:limit]]
    env.setdefault("suggestions", [])
    return Checked(env, dropped)


def _ids_resolve(c, resolve):
    b = c.get("bind", {})
    checks = [(k, b.get(k)) for k in ("scan", "record", "change", "finding", "rule")]
    checks += [("record", r) for r in b.get("records", [])]
    if isinstance(b.get("page"), dict):
        checks.append(("page", b["page"]))
    return all(resolve(kind, v) for kind, v in checks if v is not None)


def place(spec, layout):
    """Group components by where the server puts them: card | stage | aside | conv."""
    slots = {"card": [], "stage": [], "aside": [], "conv": []}
    for c in spec["components"] if spec else []:
        slots[CATALOGUE[c["type"]]["placement"][layout]].append(c)
    return slots


# -- narration (words lane) ------------------------------------------------
NUM = re.compile(r"\d+")


def check_narration(raw, events_by_ref):
    """Return (good_lines, rejected) — rejected = [(line, reason)]. `events_by_ref`: 'scan#step' -> event data."""
    errs = list(NARRATION.iter_errors(raw))
    if errs:
        return [], [(raw, errs[0].message[:120])]
    good, rejected = [], []
    for line in raw["lines"]:
        cited = [events_by_ref.get(r) for r in line["cites"]]
        if any(c is None for c in cited):
            rejected.append((line, "cites an event that does not exist"))
            continue
        text = re.sub(r"(?<=\d)[  ](?=\d{3}\b)", "", line["text"])     # "1 234" counts as 1234
        known = set()
        for ref, data in zip(line["cites"], cited):
            known.add(int(ref.split("#")[1]))
            known |= _numbers(data)
        missing = [n for n in NUM.findall(text) if int(n) not in known]
        if missing:
            rejected.append((line, f"number(s) {', '.join(missing)} not in the cited events"))
        else:
            good.append(line)
    return good, rejected


def _numbers(value):
    if isinstance(value, bool) or value is None:
        return set()
    if isinstance(value, int):
        return {value}
    if isinstance(value, str):
        return {int(n) for n in NUM.findall(value)}
    if isinstance(value, dict):
        return set().union(*map(_numbers, value.values())) if value else set()
    if isinstance(value, (list, tuple)):
        return set().union(*map(_numbers, value)) if value else set()
    return set()


# -- commands ---------------------------------------------------------------
def check_command(raw):
    """Return (command, reason). Unknown commands or bad args are refused; the reply still shows."""
    if not isinstance(raw, dict):
        return None, "not an object"
    errs = list(COMMAND.iter_errors(raw))
    if errs:
        return None, errs[0].message[:120]
    return raw, None
