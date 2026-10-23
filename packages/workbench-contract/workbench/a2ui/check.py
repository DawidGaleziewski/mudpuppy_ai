#!/usr/bin/env python3
"""Reference checks for the A2UI spike (docs/19-console-answers/13-a2ui-catalogue.md).

    python3 workbench/a2ui/check.py            # validates the example streams, runs the agent filter on refused.json

validate_component(c)  a component object against the generated catalog (catalog.json)
filter_agent(msg)      what the server does with a message from an agent that speaks A2UI itself:
                       returns (message or None, code). Codes: ok, server_owned, observed_path, server_prop,
                       unknown_type, reserved_id, bad_props.
Needs jsonschema (pip install jsonschema); the reference app already depends on it.
"""
import copy, json, os, sys
from jsonschema import Draft202012Validator

HERE = os.path.dirname(os.path.abspath(__file__))
CATALOG = json.load(open(os.path.join(HERE, "catalog.json"), encoding="utf-8"))
COMPONENTS = CATALOG["components"]
SERVER_OWNED = {n for n, c in COMPONENTS.items() if c["x-mudpuppy"]["owner"] == "server"}
RESERVED = set(CATALOG["x-mudpuppy"]["reserved_ids"])
_validators = {}


def _validator(name):
    if name not in _validators:
        schema = {k: v for k, v in CATALOG.items() if k in ("$schema", "$id", "$defs")}
        schema["$ref"] = f"#/components/{name}"
        schema["components"] = COMPONENTS
        _validators[name] = Draft202012Validator(schema)
    return _validators[name]


def validate_component(c):
    """Return a list of error messages (empty = valid)."""
    name = c.get("component")
    if name not in COMPONENTS:
        return [f"unknown component {name!r}"]
    return [e.message for e in _validator(name).iter_errors(c)]


def _data_path(c):
    tpl = COMPONENTS[c["component"]]["x-mudpuppy"]["dataPath"]
    for k, v in c.items():
        if isinstance(v, (str, int)):
            tpl = tpl.replace("{" + k + "}", str(v))
    return tpl


def filter_agent(msg):
    """Stage 2 of the spike: the agent sends A2UI. Nothing it sends reaches the client unchecked."""
    if "updateDataModel" in msg:
        return None, "observed_path"           # the data model is the server's: the agent never writes it
    if "updateComponents" not in msg:
        return msg, "ok"                        # createSurface / deleteSurface: the server issues its own anyway
    out = copy.deepcopy(msg)
    kept = []
    for c in out["updateComponents"]["components"]:
        name = c.get("component")
        if name not in COMPONENTS:
            return None, "unknown_type"
        if name in SERVER_OWNED:
            return None, "server_owned"
        if c.get("id") in RESERVED:
            return None, "reserved_id"
        code = "ok"
        if "data" in c:
            code = "server_prop"
        c["data"] = {"path": _data_path(c)}     # the server decides where the data comes from
        errs = validate_component(c)
        if errs:
            return None, "bad_props"
        kept.append(c)
    out["updateComponents"]["components"] = kept
    return out, code if any("data" in c for c in msg["updateComponents"]["components"]) else "ok"


def check_streams():
    problems = []
    ex = os.path.join(HERE, "examples")
    for f in sorted(os.listdir(ex)):
        if not f.endswith(".jsonl") or f.endswith(".client.jsonl"):
            continue
        for i, line in enumerate(open(os.path.join(ex, f), encoding="utf-8"), 1):
            msg = json.loads(line)
            if msg.get("version") != "v0.9.1":
                problems.append(f"{f}:{i} version")
            for c in msg.get("updateComponents", {}).get("components", []):
                for e in validate_component(c):
                    problems.append(f"{f}:{i} {c.get('id')}: {e}")
    return problems


if __name__ == "__main__":
    probs = check_streams()
    refused = json.load(open(os.path.join(HERE, "examples", "refused.json"), encoding="utf-8"))["examples"]
    for r in refused:
        _, code = filter_agent(r["message"])
        if code != r["why"]:
            probs.append(f"refused: expected {r['why']}, got {code}")
    print("\n".join(probs) or f"ok: streams valid, {len(refused)} refusals as expected")
    sys.exit(1 if probs else 0)
