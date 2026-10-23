#!/usr/bin/env python3
"""Generate the Workbench contract files (single source: this script).

usage: python3 workbench/tools/gen_wb_schema.py      (no dependencies)
Writes into workbench/:
  schema/view-spec.schema.json   the view spec the assistant returns (JSON Schema 2020-12)
  schema/narration.schema.json   narration lines (words lane) with event citations
  schema/command.schema.json     a command proposal (writes ask first)
  schema/commands.json           the command catalogue: API, confirm text, undo
  schema/catalogue.json          component catalogue: placement, paths, data, actions (machine-readable)
  schema/tools.json              tool definitions for the model (Anthropic tool-use format)
  examples/*.json                valid and invalid examples (used by the tests)
  a2ui/catalog.json              the same catalogue as an A2UI v0.9.1 catalog (R-96 spike)
  a2ui/examples/*.jsonl          A2UI message streams compiled from the view-spec examples
CI: run it and fail if git shows a diff (the JSON must never be edited by hand).
"""
import json, os, copy

PKG = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))   # = workbench/
os.makedirs(PKG + "/schema", exist_ok=True)
os.makedirs(PKG + "/examples", exist_ok=True)
BASE = "https://mudpuppy.local/schema/workbench/"

PATHS = ["chat", "mapping", "troubleshoot", "explain"]

# Documentation record types the Workbench can show as cards. Add a prefix here when the documentation gains a
# record type. The pattern only guards the shape: the server still resolves every id (unknown → id_not_found).
RECORD_PREFIXES = ["SCR", "PROC", "BR", "CAP", "NFR", "REQ", "UC", "DI", "GL", "ASM", "OQ", "FUP", "API"]
# Scans have full UUIDs (D-9; ours are UUIDv7). The UI shows the 13-character short form (first two groups =
# the start time in ms); JSON always carries the full id.
UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"
SCAN = "01a110d5-2028-7000-8f3e-5c1a9b27d460"   # fixture scan (short form 01a110d5-2028)

# ---------------------------------------------------------------- shared defs
DEFS = {
    "scanId": {"type": "string", "pattern": f"^{UUID}$",
               "description": f"Full scan id: a canonical lowercase UUID (UUIDv7), e.g. {SCAN}. Never the short form."},
    "step": {"type": "integer", "minimum": 1, "maximum": 100000, "description": "Step number within the scan."},
    "eventRef": {"type": "string", "pattern": f"^{UUID}#[0-9]{{1,6}}$", "description": f"Full scan id # step, e.g. {SCAN}#171."},
    "route": {"type": "string", "pattern": "^/[^\\s<>\"']{0,200}$", "description": "A route as recorded, e.g. /kalkulator/kierowca."},
    "pageRef": {
        "description": "A page (screen state) in a scan: the current selection, or a route with an optional same-URL step.",
        "oneOf": [
            {"const": "@selected"},
            {"type": "object", "additionalProperties": False, "required": ["route"],
             "properties": {"route": {"$ref": "#/$defs/route"}, "state": {"type": "integer", "minimum": 1, "maximum": 50,
                            "description": "Same-URL step (step 2 of /kalkulator/kierowca)."}}},
        ],
    },
    "recordId": {"type": "string", "pattern": "^(" + "|".join(RECORD_PREFIXES) + ")-[0-9]{3,}$",
                 "description": ("A documentation record, process or rule, three or more digits: SCR-001, PROC-001, BR-021, BR-1001, "
                                 "REQ-004, UC-012, CAP-005, NFR-001 … Portal pages are pageRefs, not records.")},
    "changeId": {"type": "string", "pattern": "^CHG-[0-9]{3,}$"},
    "findingId": {"type": "string", "pattern": "^FND-[0-9]{3,}$"},
    "ruleId": {"type": "string", "pattern": "^BR-[0-9]{3,}$"},
    "plainText": {"type": "string", "pattern": "^[^<>{}]*$", "description": "Plain words. No markup, no template syntax."},
    "personaName": {"type": "string", "pattern": "^[a-z][a-z0-9-]{1,23}$",
                    "description": "A persona of the portal, lower case: guest, client, premium. The server resolves it (unknown → id_not_found)."},
    "vaultRef": {"type": "string", "pattern": "^[A-Z][A-Z0-9_]{1,47}$",
                 "description": "A credential's name in the vault, e.g. CLIENT_LOGIN. Never a value: values go to the vault through its own dialog."},
}

# ---------------------------------------------------------------- the catalogue
# placement: where the server puts it (the model never chooses layout)
#   stage = main generated area (split/focus) · card = inside the conversation · aside = side sheet · conv = conversation column
# phase: first rollout phase in which the component is available
CATALOGUE = [
    dict(type="LiveMap", phase=1, paths=["mapping"], placement={"inline": "card", "split": "stage", "focus": "stage"},
         bind={"scan": "scanId"}, required_bind=["scan"],
         props={"follow": {"type": "boolean", "default": True, "description": "Keep the crawler's position in view."},
                "view": {"enum": ["graph", "filmstrip"], "default": "graph", "description": "Inline cards always use filmstrip."},
                "highlight": {"$ref": "#/$defs/pageRef"}},
         data="events (SSE, data lane)", actions=["select page", "ask about page", "follow on/off", "open full map"],
         shows=("Pages the crawler visited, in visit order, with miniatures, edges, its current position and the queue, "
                "with the scan meter in its body. Side trips fold into a '+N side pages' chip on the page they came from.")),
    dict(type="ScanMeter", phase=1, paths=["mapping", "troubleshoot"], placement={"inline": "card", "split": "stage", "focus": "stage"},
         bind={"scan": "scanId"}, required_bind=["scan"], props={},
         data="events", actions=["stop scan (command, asks first)"],
         shows="Steps of the limit, pages, queued links, where the crawler is now. For views without a LiveMap (it has its own meter)."),
    dict(type="PageMiniature", phase=1, paths=["chat", "mapping", "explain"], placement={"inline": "card", "split": "stage", "focus": "stage"},
         bind={"scan": "scanId", "page": "pageRef"}, required_bind=["scan", "page"],
         props={"size": {"enum": ["sm", "md"], "default": "md"}},
         data="screenshots", actions=["open detail", "ask about page"],
         shows="One page's thumbnail with its route and status."),
    dict(type="PageDetail", phase=1, paths=["mapping", "troubleshoot"], placement={"inline": "aside", "split": "stage", "focus": "aside"},
         bind={"scan": "scanId", "page": "pageRef"}, required_bind=["scan", "page"], props={},
         data="model + events", actions=["ask about page", "troubleshoot (if failed, phase 2)", "add a mark (command, phase 2)", "open the screen"],
         shows="What happened on a page, when, its status, a link to the screen in the model."),
    dict(type="Narration", phase=1, paths=["mapping"], placement={"inline": "conv", "split": "conv", "focus": "aside"},
         bind={"scan": "scanId"}, required_bind=["scan"],
         props={"every": {"enum": ["page", "milestone"], "default": "page", "description": "How often a line is written."}},
         data="events → words (each line cites events)", actions=["ask about a line", "open the cited event"],
         shows="What the crawler did, in plain words, one line per page or milestone."),
    dict(type="ErrorCard", phase=1, paths=["mapping", "troubleshoot"], placement={"inline": "card", "split": "conv", "focus": "aside"},
         bind={"scan": "scanId"}, required_bind=["scan"], props={},
         data="events (scan.stopped)", actions=["resume (command)", "troubleshoot (path switch)", "ask why"],
         shows="Why the scan stopped, where, the error reference, what is kept."),
    dict(type="StepShot", phase=2, paths=["troubleshoot", "explain"], placement={"inline": "card", "split": "stage", "focus": "stage"},
         bind={"scan": "scanId", "step": "step"}, required_bind=["scan", "step"],
         props={"mark": {"enum": ["target", "none"], "default": "target", "description": "Outline the element the action aimed at."}},
         data="screenshot + DOM snapshot", actions=["ask about the marked region"],
         shows="The page at a step, with the target region marked."),
    dict(type="EventTail", phase=2, paths=["troubleshoot"], placement={"inline": "card", "split": "stage", "focus": "stage"},
         bind={"scan": "scanId", "step": "step"}, required_bind=["scan"],
         props={"count": {"type": "integer", "minimum": 5, "maximum": 50, "default": 10}},
         data="events (raw)", actions=["copy", "open in Scans"],
         shows="The last raw events up to a step."),
    dict(type="FixChoices", phase=2, paths=["troubleshoot"], placement={"inline": "card", "split": "stage", "focus": "stage"},
         bind={"scan": "scanId", "step": "step"}, required_bind=["scan", "step"], props={},
         data="recovery API (variations are not written by the model)", actions=["run attempt (command, asks first)"],
         shows="Variations for the next attempt at a failing step."),
    dict(type="AttemptList", phase=2, paths=["troubleshoot"], placement={"inline": "card", "split": "stage", "focus": "aside"},
         bind={"scan": "scanId", "step": "step"}, required_bind=["scan", "step"], props={},
         data="attempts", actions=["open attempt"],
         shows="Attempts so far at a step, with results."),
    dict(type="Compare", phase=3, paths=["chat", "explain"], placement={"inline": "card", "split": "stage", "focus": "stage"},
         bind={"change": "changeId"}, required_bind=["change"], props={},
         data="model (2.0 Changes)", actions=["open in Changes"],
         shows="Before / after of one change, the difference marked."),
    dict(type="DecisionTable", phase=3, paths=["chat", "explain"], placement={"inline": "card", "split": "stage", "focus": "stage"},
         bind={"rule": "ruleId"}, required_bind=["rule"], props={},
         data="model (2.0 Rules)", actions=["open in Rules"],
         shows="A rule as inputs ║ result with its boundary tests."),
    dict(type="FindingCard", phase=3, paths=["explain"], placement={"inline": "card", "split": "stage", "focus": "stage"},
         bind={"finding": "findingId"}, required_bind=["finding"], props={},
         data="model (2.0 Review)", actions=["open in Review (decisions stay in Review)"],
         shows="A finding with its proposed explanation and evidence."),
    dict(type="RecordCard", phase=1, paths=["chat", "explain"], placement={"inline": "card", "split": "stage", "focus": "aside"},
         bind={"record": "recordId"}, required_bind=["record"], props={},
         data="model", actions=["open record"],
         shows="One screen, process or rule as a small card with its status and link."),
    dict(type="RecordList", phase=1, paths=["chat"], placement={"inline": "card", "split": "stage", "focus": "stage"},
         bind={"records": {"type": "array", "minItems": 1, "maxItems": 12, "uniqueItems": True, "items": {"$ref": "#/$defs/recordId"}}},
         required_bind=["records"],
         props={"title": {"allOf": [{"$ref": "#/$defs/plainText"}], "maxLength": 60}},
         data="model", actions=["open record"],
         shows="Up to 12 records in a compact table, in the order given."),
]
LIMITS = {"chat": 2, "mapping": 4, "troubleshoot": 4, "explain": 3}


def bind_schema(v):
    return {"$ref": f"#/$defs/{v}"} if isinstance(v, str) else v


def comp_def(c):
    props = {"type": {"const": c["type"]},
             "id": {"type": "string", "pattern": "^[a-z][a-z0-9-]{0,23}$", "description": "Stable id within the view; keep it when you update the view."},
             "bind": {"type": "object", "additionalProperties": False, "required": c["required_bind"],
                      "properties": {k: bind_schema(v) for k, v in c["bind"].items()}}}
    req = ["id", "type", "bind"]
    if c["props"]:
        props["props"] = {"type": "object", "additionalProperties": False, "properties": c["props"]}
    return {"type": "object", "additionalProperties": False, "required": req, "properties": props,
            "description": c["shows"]}


view_spec = {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": BASE + "view-spec.schema.json",
    "title": "Workbench view spec v1",
    "description": ("What the assistant returns to compose the Workbench. It picks components from the catalogue and binds them to data by id. "
                    "It never sends HTML, CSS, numbers or page content: the server renders templates and fills them from the data lane. "
                    "The server decides placement from the path and the rollout phase."),
    "type": "object",
    "additionalProperties": False,
    "required": ["version", "path", "why", "components"],
    "properties": {
        "version": {"const": "1"},
        "path": {"enum": PATHS, "description": "chat (default) · mapping · troubleshoot · explain. The person can switch it; their switch wins."},
        "why": {"allOf": [{"$ref": "#/$defs/plainText"}], "minLength": 3, "maxLength": 140,
                "description": "One plain sentence shown next to the Path switch and in 'Why this view?'. Says what the person asked, not what the model is."},
        "select": {"$ref": "#/$defs/pageRef", "description": "Optional page to select first (fills PageDetail)."},
        "components": {"type": "array", "minItems": 0, "maxItems": 4,
                       "items": {"oneOf": [{"$ref": f"#/$defs/{c['type']}"} for c in CATALOGUE]},
                       "description": "Empty list = plain chat. Order = reading order within a placement."},
        "suggestions": {"type": "array", "maxItems": 3,
                        "items": {"allOf": [{"$ref": "#/$defs/plainText"}], "minLength": 3, "maxLength": 60},
                        "description": "Follow-up questions the person can send with one click."},
    },
    "allOf": [
        {"if": {"properties": {"path": {"const": p}}, "required": ["path"]},
         "then": {"properties": {"components": {"maxItems": LIMITS[p],
                  "items": {"properties": {"type": {"enum": [c["type"] for c in CATALOGUE if p in c["paths"]]}}}}}}}
        for p in PATHS
    ],
    "$defs": dict(DEFS, **{c["type"]: comp_def(c) for c in CATALOGUE}),
}

narration = {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": BASE + "narration.schema.json",
    "title": "Narration lines v1",
    "description": ("Plain-words account of what the crawler did. Every line cites at least one event. "
                    "Any number in a line must appear in a cited event (the server checks; failing lines are dropped and replaced by the templated line)."),
    "type": "object", "additionalProperties": False, "required": ["scan", "lines"],
    "properties": {
        "scan": {"$ref": "#/$defs/scanId"},
        "lines": {"type": "array", "minItems": 1, "maxItems": 6, "items": {
            "type": "object", "additionalProperties": False, "required": ["text", "cites"],
            "properties": {"text": {"allOf": [{"$ref": "#/$defs/plainText"}], "minLength": 3, "maxLength": 160},
                           "cites": {"type": "array", "minItems": 1, "maxItems": 5, "items": {"$ref": "#/$defs/eventRef"}},
                           "kind": {"enum": ["visit", "milestone", "stop"], "default": "visit"}}}},
    },
    "$defs": {k: DEFS[k] for k in ("scanId", "eventRef", "plainText")},
}

COMMANDS = [
    dict(name="scan.start", label="Start a map scan", write=True, undo=None, api="POST /portals/{portal}/runs",
         args={"type": {"enum": ["full_map", "continue_frontier", "focused"]}, "start": {"$ref": "#/$defs/route"},
               "persona": {"$ref": "#/$defs/personaName"}, "limit_steps": {"type": "integer", "minimum": 10, "maximum": 2000}},
         required=["type"], effects="Starts a new scan on sandbox. Nothing in the portal model changes until the scan records pages.",
         stop="Stop the scan at any time; pages recorded so far are kept."),
    dict(name="scan.resume", label="Resume from last checkpoint", write=True, undo=None, api="POST /runs/{scan}:resume",
         args={"scan": {"$ref": "#/$defs/scanId"}}, required=["scan"],
         effects="Starts a new scan that continues {scan} from the last good checkpoint. Its queued links carry over.",
         stop="Not undoable; you can stop the new scan."),
    dict(name="scan.stop", label="Stop the scan", write=True, undo=None, api="POST /runs/{scan}:stop",
         args={"scan": {"$ref": "#/$defs/scanId"}}, required=["scan"],
         effects="Stops {scan}. Recorded pages and the queue are kept; you can resume later.",
         stop="Not undoable; Resume continues from the last checkpoint."),
    dict(name="path.attempt", label="Run an attempt", write=True, undo=None, api="POST /paths/{path}/attempts (the server finds the path from scan + step)",
         args={"scan": {"$ref": "#/$defs/scanId"}, "step": {"$ref": "#/$defs/step"},
               "variation": {"enum": ["wait_longer", "record_only", "skip_action"]}},
         required=["scan", "step", "variation"],
         effects="Replays to the checkpoint before step {step} and tries the action again with: {variation}.",
         stop="Not undoable; attempts are listed and never overwrite each other."),
    dict(name="mark.add", label="Add a mark", write=True, undo="DELETE /portals/{portal}/marks/{mark}", api="POST /portals/{portal}/marks",
         args={"target": {"$ref": "#/$defs/pageRef"}, "kind": {"enum": ["start_here", "focus", "probe", "retry", "recheck", "skip"]}},
         required=["target", "kind"], effects="Marks the page for the next scan plan.", stop="Undo removes the mark."),
    # R-95. The card is editable (genui.css .sy-cmd__form): the person corrects the drafted values before Confirm.
    dict(name="persona.add", label="Add a persona", write=True, undo="DELETE /portals/{portal}/personas/{name}", api="POST /portals/{portal}/personas",
         args={"name": {"$ref": "#/$defs/personaName"},
               "about": {"allOf": [{"$ref": "#/$defs/plainText"}], "maxLength": 140},
               "credential": {"oneOf": [{"const": "none"}, {"$ref": "#/$defs/vaultRef"}],
                              "description": "none = browses as a guest. Otherwise a vault reference that already exists."},
               "test_data": {"type": "array", "maxItems": 20, "items": {
                   "type": "object", "additionalProperties": False, "required": ["field", "value"],
                   "properties": {"field": {"type": "object", "additionalProperties": False, "required": ["route", "label"],
                                            "properties": {"route": {"$ref": "#/$defs/route"},
                                                           "state": {"type": "integer", "minimum": 1, "maximum": 50},
                                                           "label": {"allOf": [{"$ref": "#/$defs/plainText"}], "maxLength": 80}},
                                            "description": "A field as recorded on a form: route (+ same-URL step) and its label."},
                                  "value": {"allOf": [{"$ref": "#/$defs/plainText"}], "maxLength": 200}}},
                   "description": "Test data for forms. Never real customer data, never secrets."}},
         required=["name"], effects="Adds persona {name} to this portal. Scans you start can use it.",
         stop="Undo removes the persona until a scan uses it."),
]

command = {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": BASE + "command.schema.json",
    "title": "Command proposal v1",
    "description": "A write the assistant proposes. The person confirms it in a command card; nothing runs before that.",
    "type": "object", "additionalProperties": False, "required": ["command", "args", "reason"],
    "properties": {
        "command": {"enum": [c["name"] for c in COMMANDS]},
        "args": {"type": "object"},
        "reason": {"allOf": [{"$ref": "#/$defs/plainText"}], "minLength": 3, "maxLength": 140},
    },
    "allOf": [
        {"if": {"properties": {"command": {"const": c["name"]}}, "required": ["command"]},
         "then": {"properties": {"args": {"type": "object", "additionalProperties": False, "required": c["required"], "properties": c["args"]}}}}
        for c in COMMANDS
    ],
    "$defs": {k: DEFS[k] for k in ("scanId", "step", "route", "pageRef", "plainText", "personaName", "vaultRef")},
}

commands_doc = {
    "description": "Commands the Workbench can run. Every write asks first in a command card (.sy-cmd). The model can only propose them.",
    "commands": [{k: c[k] for k in ("name", "label", "write", "undo", "api", "required", "effects", "stop")} for c in COMMANDS],
}

catalogue_doc = {
    "description": "The component catalogue: everything the assistant may place on the Workbench. Generated with view-spec.schema.json.",
    "limits_per_path": LIMITS,
    "components": [{k: c[k] for k in ("type", "phase", "paths", "placement", "required_bind", "data", "actions", "shows")} |
                   {"bind": list(c["bind"].keys()), "props": list(c["props"].keys())} for c in CATALOGUE],
}


def inline_refs(schema):
    """Tool input schemas must be self-contained (keep $defs local) and must not have a top-level
    allOf / oneOf / anyOf: the Messages API rejects those with a 400. So the per-path and per-command rules
    (the top-level allOf) are left out of tools.json; the server validates every tool input against the
    FULL schema in schema/*.schema.json anyway. The description says the rules in words."""
    s = copy.deepcopy(schema)
    for k in ("$schema", "$id", "title", "allOf", "oneOf", "anyOf"):
        s.pop(k, None)
    return s


tools = [
    {"name": "render_view",
     "description": ("Compose the Workbench for what the person is doing. Pick a path and up to four components from the catalogue, "
                     "and bind them to data by id. Do not write HTML, numbers or page content: the server fills components from live data. "
                     "Send an empty components list to answer in plain chat. Call at most once per turn. "
                     "Limits per path: chat 2 components (RecordCard, RecordList, PageMiniature, Compare, DecisionTable), "
                     "mapping 4, troubleshoot 4, explain 3. Every component needs an id that is unique in the view."),
     "input_schema": inline_refs(view_spec)},
    {"name": "narrate",
     "description": ("Write up to six plain lines about what the crawler did since the last narration. Cite the events each line is based on. "
                     "Only use numbers that appear in the cited events. No speculation: if you don't know why, say what happened."),
     "input_schema": inline_refs(narration)},
    {"name": "propose_command",
     "description": ("Propose a write (start, resume or stop a scan, run an attempt, add a mark, add a persona). The person sees a command card and confirms it; "
                     "nothing runs before that. Give a one-sentence reason in plain words. Args per command: "
                     "scan.start {type, start?, persona?, limit_steps?} · scan.resume {scan} · scan.stop {scan} · "
                     "path.attempt {scan, step, variation} · mark.add {target, kind} · "
                     "persona.add {name, about?, credential?, test_data?}: credential is a vault reference name or 'none', never a password or token. "
                     "You get back 'proposed, waiting for the person'."),
     "input_schema": inline_refs(command)},
]

EX = {
    "valid/mapping-live.json": {
        "version": "1", "path": "mapping", "why": "You asked to map the OC/AC calculator.",
        "select": {"route": "/kalkulator/kierowca", "state": 2},
        "components": [
            {"id": "map", "type": "LiveMap", "bind": {"scan": SCAN}, "props": {"follow": True, "view": "graph"}},
            {"id": "detail", "type": "PageDetail", "bind": {"scan": SCAN, "page": "@selected"}},
            {"id": "story", "type": "Narration", "bind": {"scan": SCAN}, "props": {"every": "page"}}],
        "suggestions": ["Where does it go next?", "Stop after the calculator"]},
    "valid/mapping-stopped.json": {
        "version": "1", "path": "mapping", "why": "The scan stopped at /kontakt.",
        "select": {"route": "/kontakt"},
        "components": [
            {"id": "map", "type": "LiveMap", "bind": {"scan": SCAN}, "props": {"follow": False}},
            {"id": "err", "type": "ErrorCard", "bind": {"scan": SCAN}},
            {"id": "detail", "type": "PageDetail", "bind": {"scan": SCAN, "page": "@selected"}}],
        "suggestions": ["Why did it stop here?", "Troubleshoot with me"]},
    "valid/troubleshoot.json": {
        "version": "1", "path": "troubleshoot", "why": "You asked why the scan stopped at /kontakt.",
        "components": [
            {"id": "shot", "type": "StepShot", "bind": {"scan": SCAN, "step": 171}, "props": {"mark": "target"}},
            {"id": "tail", "type": "EventTail", "bind": {"scan": SCAN, "step": 171}, "props": {"count": 5}},
            {"id": "fixes", "type": "FixChoices", "bind": {"scan": SCAN, "step": 171}},
            {"id": "tries", "type": "AttemptList", "bind": {"scan": SCAN, "step": 171}}]},
    "valid/explain.json": {
        "version": "1", "path": "explain", "why": "You asked about the banner on wynik.",
        "components": [
            {"id": "finding", "type": "FindingCard", "bind": {"finding": "FND-007"}},
            {"id": "compare", "type": "Compare", "bind": {"change": "CHG-019"}}],
        "suggestions": ["Which visits had the banner?", "Open it in Review"]},
    "valid/explain-rule.json": {
        "version": "1", "path": "explain", "why": "You asked to see BR-021.",
        "components": [{"id": "rule", "type": "DecisionTable", "bind": {"rule": "BR-021"}}]},
    "valid/chat-records.json": {
        "version": "1", "path": "chat", "why": "You asked what Oblicz składkę OC/AC looks like.",
        "components": [
            {"id": "proc", "type": "RecordCard", "bind": {"record": "PROC-001"}},
            {"id": "rules", "type": "RecordList", "bind": {"records": ["BR-021", "BR-022", "BR-023", "BR-024", "BR-025", "BR-026"]},
             "props": {"title": "Rules in this process"}}]},
    "valid/chat-records-long-ids.json": {
        "version": "1", "path": "chat", "why": "You asked which requirements the calculator rules cover.",
        "components": [
            {"id": "req", "type": "RecordCard", "bind": {"record": "REQ-004"}},
            {"id": "rules", "type": "RecordList", "bind": {"records": ["BR-021", "BR-1001"]}, "props": {"title": "Rules behind REQ-004"}}]},
    "valid/chat-plain.json": {"version": "1", "path": "chat", "why": "A short answer is enough.", "components": []},
    "invalid/unknown-type.json": {"version": "1", "path": "mapping", "why": "You asked to map.", "components": [
        {"id": "x", "type": "HtmlBlock", "bind": {"html": "<b>hi</b>"}}]},
    "invalid/wrong-path.json": {"version": "1", "path": "chat", "why": "You asked to map.", "components": [
        {"id": "map", "type": "LiveMap", "bind": {"scan": SCAN}}]},
    "invalid/too-many.json": {"version": "1", "path": "chat", "why": "Too much.", "components": [
        {"id": "a", "type": "RecordCard", "bind": {"record": "PROC-001"}}, {"id": "b", "type": "RecordCard", "bind": {"record": "PROC-002"}},
        {"id": "c", "type": "RecordCard", "bind": {"record": "BR-021"}}]},
    "invalid/markup-in-why.json": {"version": "1", "path": "chat", "why": "<img src=x onerror=alert(1)>", "components": []},
    "invalid/bad-scan-id.json": {"version": "1", "path": "mapping", "why": "You asked to map.", "components": [
        {"id": "map", "type": "LiveMap", "bind": {"scan": "../../etc"}}]},
    "invalid/short-scan-id.json": {"version": "1", "path": "mapping", "why": "You asked to map.", "components": [
        {"id": "map", "type": "LiveMap", "bind": {"scan": "01a110d5"}}]},
    "invalid/extra-prop.json": {"version": "1", "path": "mapping", "why": "You asked to map.", "components": [
        {"id": "map", "type": "LiveMap", "bind": {"scan": SCAN}, "props": {"style": "color:red"}}]},
    "invalid/missing-id.json": {"version": "1", "path": "mapping", "why": "You asked to map.", "components": [
        {"type": "LiveMap", "bind": {"scan": SCAN}}]},
    "invalid/duplicate-id.json": {"version": "1", "path": "mapping", "why": "You asked to map.", "components": [
        {"id": "map", "type": "LiveMap", "bind": {"scan": SCAN}},
        {"id": "map", "type": "PageDetail", "bind": {"scan": SCAN, "page": "@selected"}}]},
    "invalid/unknown-record.json": {"version": "1", "path": "chat", "why": "You asked about a process.", "components": [
        {"id": "proc", "type": "RecordCard", "bind": {"record": "PROC-999"}}]},
    "narration/valid.json": {"scan": SCAN, "lines": [
        {"text": "Followed 'Samochód' in the menu to /ubezpieczenia/samochod.", "cites": [SCAN + "#38"]},
        {"text": "Same URL, new screen: recorded /kalkulator/kierowca as step 2.", "cites": [SCAN + "#102"], "kind": "milestone"}]},
    "narration/ungrounded-number.json": {"scan": SCAN, "lines": [
        {"text": "Found 40 forms on /porownanie.", "cites": [SCAN + "#140"]}]},
    "command/resume.json": {"command": "scan.resume", "args": {"scan": SCAN}, "reason": "The page loaded but the form button never appeared; resuming keeps the 113 queued links."},
    "command/attempt.json": {"command": "path.attempt", "args": {"scan": SCAN, "step": 171, "variation": "wait_longer"}, "reason": "The form may need more than 10 s to appear."},
    "command/invalid-unknown.json": {"command": "portal.delete", "args": {}, "reason": "Clean up."},
    "command/persona-add.json": {"command": "persona.add", "args": {
        "name": "client", "about": "A signed-in customer with one active OC policy", "credential": "CLIENT_LOGIN",
        "test_data": [{"field": {"route": "/kalkulator/kierowca", "state": 1, "label": "Data urodzenia"}, "value": "1985-04-12"},
                      {"field": {"route": "/kalkulator/kierowca", "state": 1, "label": "Kod pocztowy"}, "value": "00-950"}]},
        "reason": "Przedłuż polisę needs a signed-in customer, and no persona of this portal can sign in."},
    "command/invalid-persona-secret.json": {"command": "persona.add", "args": {
        "name": "client", "credential": "CLIENT_LOGIN", "password": "hunter2"},
        "reason": "So the scan can sign in."},
}


# What the server must do with each invalid example. code = the drop / repair reason the server logs.
# "schema" = rejected by JSON Schema alone; "server" = only the semantic layer catches it (ids, duplicates, limits).
EXPECTED = {
    "description": "Expected outcome per invalid example. Contract tests assert the server logs exactly this code.",
    "codes": ["repaired_why", "repaired_suggestions", "repaired_path", "unknown_type", "bad_bind_or_props", "not_on_path",
              "not_in_phase", "id_not_found", "duplicate", "duplicate_id", "missing_id", "too_many"],
    "examples": {
        "unknown-type.json": {"outcome": "dropped", "component": 0, "code": "unknown_type", "caught_by": "schema"},
        "wrong-path.json": {"outcome": "dropped", "component": 0, "code": "not_on_path", "caught_by": "schema"},
        "too-many.json": {"outcome": "dropped", "component": 2, "code": "too_many", "caught_by": "schema"},
        "markup-in-why.json": {"outcome": "repaired", "field": "why", "code": "repaired_why", "caught_by": "schema",
                               "result": "why becomes 'Composed for your request.'"},
        "bad-scan-id.json": {"outcome": "dropped", "component": 0, "code": "bad_bind_or_props", "caught_by": "schema"},
        "short-scan-id.json": {"outcome": "dropped", "component": 0, "code": "bad_bind_or_props", "caught_by": "schema",
                               "note": "8-character scan ids collide (UUIDv7 prefix = 65 s window); send the full id"},
        "extra-prop.json": {"outcome": "dropped", "component": 0, "code": "bad_bind_or_props", "caught_by": "schema"},
        "missing-id.json": {"outcome": "dropped", "component": 0, "code": "missing_id", "caught_by": "schema"},
        "duplicate-id.json": {"outcome": "dropped", "component": 1, "code": "duplicate_id", "caught_by": "server"},
        "unknown-record.json": {"outcome": "dropped", "component": 0, "code": "id_not_found", "caught_by": "server"},
    },
}
EX["invalid/EXPECTED.json"] = EXPECTED


def dump(path, obj):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=2)
        f.write("\n")


dump(PKG + "/schema/view-spec.schema.json", view_spec)
dump(PKG + "/schema/narration.schema.json", narration)
dump(PKG + "/schema/command.schema.json", command)
dump(PKG + "/schema/commands.json", commands_doc)
dump(PKG + "/schema/catalogue.json", catalogue_doc)
dump(PKG + "/schema/tools.json", tools)
for rel, obj in EX.items():
    os.makedirs(os.path.dirname(f"{PKG}/examples/{rel}"), exist_ok=True)
    dump(f"{PKG}/examples/{rel}", obj)


# ================================================================ A2UI (R-96 spike, docs/19-console-answers/13)
# The same catalogue as an A2UI catalog. A2UI v0.9.1 messages: createSurface · updateComponents · updateDataModel ·
# deleteSurface (server → client) and action (client → server). Check the exact envelope against the spec you adopt.
# Ownership is the point: the agent may set the component's ids and options; every observed value reaches the client
# through updateDataModel, written by the SERVER from the data lane. Props marked server-owned are stripped from
# anything the agent sends, then filled in by the server.
A2UI_VERSION = "v0.9.1"
CATALOG_ID = "https://mudpuppy.local/a2ui/catalogs/workbench/v1/catalog.json"
os.makedirs(PKG + "/a2ui/examples", exist_ok=True)

# Where each component's live data sits in the surface's data model (JSON Pointer templates over its own ids).
DATA_PATH = {
    "LiveMap": "/scans/{scan}", "ScanMeter": "/scans/{scan}/meter", "PageMiniature": "/scans/{scan}/pages",
    "PageDetail": "/scans/{scan}/pages", "Narration": "/scans/{scan}/narration", "ErrorCard": "/scans/{scan}/stop",
    "StepShot": "/scans/{scan}/steps/{step}", "EventTail": "/scans/{scan}/events", "FixChoices": "/scans/{scan}/fixes/{step}",
    "AttemptList": "/scans/{scan}/attempts/{step}", "Compare": "/changes/{change}", "DecisionTable": "/rules/{rule}",
    "FindingCard": "/findings/{finding}", "RecordCard": "/records/{record}", "RecordList": "/records",
}
PAGE_CTX = {"type": "object", "additionalProperties": False, "required": ["route"],
            "properties": {"route": {"$ref": "#/$defs/route"}, "state": {"type": "integer", "minimum": 1, "maximum": 50}}}
NO_CTX = {"type": "object", "additionalProperties": False, "properties": {}}


def act(name, ctx=None, write=False, does=""):
    a = {"name": name, "context": ctx or NO_CTX, "does": does}
    if write:
        a["write"] = "the server answers with a CommandCard on the same surface; nothing runs before command.confirm"
    return a


ACTIONS = {
    "LiveMap": [act("page.select", PAGE_CTX, does="select a page (fills PageDetail)"), act("page.ask", PAGE_CTX, does="add the page as context to the next message"),
                act("map.follow", {"type": "object", "additionalProperties": False, "required": ["on"], "properties": {"on": {"type": "boolean"}}}),
                act("map.open", does="open the full map")],
    "ScanMeter": [act("scan.stop", write=True)],
    "PageMiniature": [act("page.select", PAGE_CTX), act("page.ask", PAGE_CTX)],
    "PageDetail": [act("page.ask", PAGE_CTX), act("path.switch", {"type": "object", "additionalProperties": False, "required": ["path"],
                                                                 "properties": {"path": {"const": "troubleshoot"}}}),
                   act("mark.add", {"type": "object", "additionalProperties": False, "required": ["kind"],
                                    "properties": {"kind": {"enum": ["start_here", "focus", "probe", "retry", "recheck", "skip"]}}}, write=True),
                   act("screen.open", does="open the screen in the model")],
    "Narration": [act("line.ask", {"type": "object", "additionalProperties": False, "required": ["cites"],
                                   "properties": {"cites": {"type": "array", "items": {"$ref": "#/$defs/eventRef"}}}}),
                  act("event.open", {"type": "object", "additionalProperties": False, "required": ["event"], "properties": {"event": {"$ref": "#/$defs/eventRef"}}})],
    "ErrorCard": [act("scan.resume", write=True), act("path.switch", {"type": "object", "additionalProperties": False, "required": ["path"],
                                                                      "properties": {"path": {"const": "troubleshoot"}}}), act("page.ask", PAGE_CTX)],
    "StepShot": [act("region.ask", does="ask about the marked region")],
    "EventTail": [act("events.copy"), act("scans.open")],
    "FixChoices": [act("path.attempt", {"type": "object", "additionalProperties": False, "required": ["variation"],
                                        "properties": {"variation": {"enum": ["wait_longer", "record_only", "skip_action"]}}}, write=True)],
    "AttemptList": [act("attempt.open", {"type": "object", "additionalProperties": False, "required": ["attempt"],
                                         "properties": {"attempt": {"type": "integer", "minimum": 1}}})],
    "Compare": [act("changes.open")], "DecisionTable": [act("rules.open")], "FindingCard": [act("review.open")],
    "RecordCard": [act("record.open")],
    "RecordList": [act("record.open", {"type": "object", "additionalProperties": False, "required": ["record"],
                                       "properties": {"record": {"$ref": "#/$defs/recordId"}}})],
}
SERVER_BINDING = {"type": "object", "additionalProperties": False, "required": ["path"],
                  "properties": {"path": {"type": "string", "pattern": "^/[^\\s]{0,300}$"}},
                  "description": "Added by the server: where this component's data lives in the surface's data model. Dropped if the agent sends it."}


def a2ui_component(c):
    props = {"id": {"$ref": "#/$defs/componentId"}, "component": {"const": c["type"]}}
    props.update({k: bind_schema(v) for k, v in c["bind"].items()})
    props.update(c["props"])
    props["data"] = {"$ref": "#/$defs/serverBinding"}
    return {"type": "object", "description": c["shows"], "required": ["id", "component"] + c["required_bind"],
            "properties": props, "unevaluatedProperties": False,
            "x-mudpuppy": {"owner": "agent", "serverProps": ["data"], "phase": c["phase"], "paths": c["paths"],
                           "placement": c["placement"], "dataPath": DATA_PATH[c["type"]], "data": c["data"],
                           "actions": ACTIONS[c["type"]]}}


A2UI_COMPONENTS = {c["type"]: a2ui_component(c) for c in CATALOGUE}
# Frame components: in the catalog so the client can render them, owned by the server. An agent message that places
# one is dropped (code server_owned), exactly like markup in a view spec.
A2UI_COMPONENTS["View"] = {
    "type": "object", "description": "The generated view frame (D-40): genmark, Why this view?, source line, feedback. Always the surface's root.",
    "required": ["id", "component", "path", "why", "children"], "unevaluatedProperties": False,
    "properties": {"id": {"const": "root"}, "component": {"const": "View"}, "path": {"enum": PATHS},
                   "why": {"allOf": [{"$ref": "#/$defs/plainText"}], "minLength": 3, "maxLength": 140},
                   "children": {"type": "array", "maxItems": 4, "uniqueItems": True, "items": {"$ref": "#/$defs/componentId"}},
                   "suggestions": {"type": "array", "maxItems": 3, "items": {"allOf": [{"$ref": "#/$defs/plainText"}], "minLength": 3, "maxLength": 60}},
                   "data": {"$ref": "#/$defs/serverBinding"}},
    "x-mudpuppy": {"owner": "server", "dataPath": "/view", "actions": [
        act("view.feedback", {"type": "object", "additionalProperties": False, "required": ["right"], "properties": {"right": {"type": "boolean"}}}),
        act("path.switch", {"type": "object", "additionalProperties": False, "required": ["path"], "properties": {"path": {"enum": PATHS}}}),
        act("suggestion.send", {"type": "object", "additionalProperties": False, "required": ["index"], "properties": {"index": {"type": "integer", "minimum": 0, "maximum": 2}}})]},
}
A2UI_COMPONENTS["CommandCard"] = {
    "type": "object", "description": "A write waiting for the person (D-41). persona.add renders editable fields bound two-way to /commands/{id}/args.",
    "required": ["id", "component", "command", "data"], "unevaluatedProperties": False,
    "properties": {"id": {"$ref": "#/$defs/componentId"}, "component": {"const": "CommandCard"},
                   "command": {"enum": [c["name"] for c in COMMANDS]}, "data": {"$ref": "#/$defs/serverBinding"}},
    "x-mudpuppy": {"owner": "server", "dataPath": "/commands/{id}", "actions": [
        act("command.confirm", {"type": "object", "additionalProperties": False, "required": ["command"], "properties": {"command": {"$ref": "#/$defs/componentId"}}}),
        act("command.cancel", {"type": "object", "additionalProperties": False, "required": ["command"], "properties": {"command": {"$ref": "#/$defs/componentId"}}}),
        act("command.undo", {"type": "object", "additionalProperties": False, "required": ["command"], "properties": {"command": {"$ref": "#/$defs/componentId"}}})]},
}

a2ui_catalog = {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": CATALOG_ID,
    "catalogId": CATALOG_ID,
    "title": "MudPuppy Workbench catalog v1 (A2UI " + A2UI_VERSION + ")",
    "description": ("Generated by workbench/tools/gen_wb_schema.py from the same CATALOGUE as view-spec.schema.json. Agent-owned components "
                    "take ids and options only; the server adds 'data' (a path into the surface's data model) and writes every observed "
                    "value there with updateDataModel. View and CommandCard are server-owned. 'root' is reserved for View."),
    "components": A2UI_COMPONENTS,
    "functions": [],
    "theme": {},
    "$defs": dict({k: v for k, v in DEFS.items()}, componentId={"type": "string", "pattern": "^[a-z][a-z0-9-]{0,23}$"},
                  serverBinding=SERVER_BINDING),
    "x-mudpuppy": {"limits_per_path": LIMITS, "reserved_ids": ["root"],
                   "dataModel": {"/view": "frame facts: path, why, phase, source line, data time (server)",
                                 "/scans/{scan}": "meter, pages (visit order), edges, narration, stop, steps/{n}, events, fixes/{n}, attempts/{n} (server, from the data lane)",
                                 "/records/{id}": "portal-model records", "/rules/{id}": "decision tables", "/changes/{id}": "before / after",
                                 "/findings/{id}": "findings", "/commands/{id}": "command cards: state, facts, args (args two-way for editable cards)",
                                 "/ui/selected": "the selected page (client state, sent back in action context)"}},
}
dump(PKG + "/a2ui/catalog.json", a2ui_catalog)


def fill(tpl, bind):
    out = tpl
    for k, v in bind.items():
        if isinstance(v, (str, int)):
            out = out.replace("{" + k + "}", str(v))
    return out


def compile_view(spec, surface):
    """The spike's server step: a validated view spec → A2UI messages. The model keeps writing view specs."""
    root = {"id": "root", "component": "View", "path": spec["path"], "why": spec["why"],
            "children": [c["id"] for c in spec["components"]], "data": {"path": "/view"}}
    if spec.get("suggestions"):
        root["suggestions"] = spec["suggestions"]
    comps = [root]
    for c in spec["components"]:
        o = {"id": c["id"], "component": c["type"]}
        o.update(c.get("bind", {}))
        o.update(c.get("props", {}))
        o["data"] = {"path": fill(DATA_PATH[c["type"]], c.get("bind", {}))}
        comps.append(o)
    return [{"version": A2UI_VERSION, "createSurface": {"surfaceId": surface, "catalogId": CATALOG_ID}},
            {"version": A2UI_VERSION, "updateComponents": {"surfaceId": surface, "components": comps}}]


def data(surface, path, value):
    return {"version": A2UI_VERSION, "updateDataModel": {"surfaceId": surface, "path": path, "value": value}}


VISITS = [(1, "/", None, "Ubezpieczenia dla Ciebie", "10:49:31Z", 12, 2), (2, "/ubezpieczenia/samochod", None, "Samochód", "10:51:02Z", 38, 2),
          (3, "/kalkulator/kierowca", 1, "Kalkulator OC/AC — dane kierowcy", "10:53:40Z", 77, 2),
          (4, "/kalkulator/kierowca", 2, "Kalkulator OC/AC — opcje", "10:55:12Z", 102, 1),
          (5, "/porownanie", None, "Porównanie", "10:57:05Z", 140, 2)]
pages = [{"order": o, "route": r, **({"state": st} if st else {}), "title": t, "at": "2026-10-06T" + at, "step": sp,
          "status": "here" if o == 5 else "ok", "sideTrips": side} for o, r, st, t, at, sp, side in VISITS]
S1 = "t1"
live = compile_view(EX["valid/mapping-live.json"], S1) + [
    data(S1, "/view", {"phase": 1, "source": "Live · events up to 10:57:05Z", "generated": True}),
    data(S1, f"/scans/{SCAN}/meter", {"status": "running", "steps": 140, "limit": 400, "pages": 14, "queued": 97, "at": "/porownanie"}),
    data(S1, f"/scans/{SCAN}/pages", pages),
    data(S1, f"/scans/{SCAN}/narration", [{"at": "2026-10-06T10:57:05Z", "text": "Back on /, followed 'Porównaj produkty' to /porownanie. 31 more links queued.",
                                          "cites": [SCAN + "#140"]}]),
    data(S1, "/ui/selected", {"route": "/kalkulator/kierowca", "state": 2}),
    # the next event: only the changed paths
    data(S1, f"/scans/{SCAN}/meter/steps", 141),
]
S2 = "t2"
stopped = compile_view(EX["valid/mapping-stopped.json"], S2) + [
    data(S2, f"/scans/{SCAN}/meter", {"status": "stopped", "steps": 171, "limit": 400, "pages": 17, "queued": 113, "at": "/kontakt"}),
    data(S2, f"/scans/{SCAN}/stop", {"at": "2026-10-06T10:58:44Z", "route": "/kontakt", "step": 171, "reason": "The next action's element wasn't there after the page settled.",
                                     "error": "ERR-01M48DVAT5E1GS5K42CTCTTDTJ", "kept": {"pages": 17, "queued": 113}, "checkpoint": {"route": "/porownanie", "step": 140}}),
    # the person pressed Resume on the ErrorCard (client → server, below); the server answers with a command card
    {"version": A2UI_VERSION, "updateComponents": {"surfaceId": S2, "components": [
        {"id": "root", "component": "View", "path": "mapping", "why": "The scan stopped at /kontakt.", "children": ["map", "err", "detail", "cmd-1"], "data": {"path": "/view"}},
        {"id": "cmd-1", "component": "CommandCard", "command": "scan.resume", "data": {"path": "/commands/cmd-1"}}]}},
    data(S2, "/commands/cmd-1", {"state": "proposed", "label": "Resume from last checkpoint", "args": {"scan": SCAN},
                                 "facts": [["Starts", "a new scan that continues 01a110d5-2028"], ["From", "/porownanie · step 140"],
                                           ["Kept", "17 pages, 113 queued links"], ["Where", "sandbox"], ["Undo", "Not undoable. You can stop the new scan."]]}),
    data(S2, "/commands/cmd-1/state", "running"),
    data(S2, "/commands/cmd-1/state", "done"),
    data(S2, "/commands/cmd-1/result", "Resumed as scan 01a110e7-2068 · continues 01a110d5-2028"),
]
stopped_client = [
    {"version": A2UI_VERSION, "action": {"name": "scan.resume", "surfaceId": S2, "sourceComponentId": "err", "timestamp": "2026-10-06T11:05:31Z", "context": {}}},
    {"version": A2UI_VERSION, "action": {"name": "command.confirm", "surfaceId": S2, "sourceComponentId": "cmd-1", "timestamp": "2026-10-06T11:05:38Z",
                                         "context": {"command": "cmd-1"}}},
]
S3 = "t3"
chat = compile_view(EX["valid/chat-records.json"], S3) + [
    data(S3, "/records/PROC-001", {"kind": "Process", "title": "Oblicz składkę OC/AC", "status": "ok", "word": "Accepted",
                                   "facts": [["Explored", "Thorough on 9c21"], ["Screens", "5 (3 steps + 2 outcome screens)"], ["Rules", "BR-021…BR-026"]]}),
    data(S3, "/records/BR-021", {"kind": "Rule", "title": "Driver must be 21 or older", "status": "needs", "word": "Changed · needs you"}),
]
# What the server refuses from an agent that speaks A2UI itself (stage 2 of the spike): each line is dropped and logged.
refused = [
    {"why": "server_owned", "message": {"version": A2UI_VERSION, "updateComponents": {"surfaceId": S1, "components": [
        {"id": "cmd-9", "component": "CommandCard", "command": "scan.stop", "data": {"path": "/commands/cmd-9"}}]}}},
    {"why": "observed_path", "message": data(S1, f"/scans/{SCAN}/meter/pages", 400)},
    {"why": "server_prop", "message": {"version": A2UI_VERSION, "updateComponents": {"surfaceId": S1, "components": [
        {"id": "map", "component": "LiveMap", "scan": SCAN, "data": {"path": "/records"}}]}}, "result": "data is replaced by /scans/{scan}"},
    {"why": "unknown_type", "message": {"version": A2UI_VERSION, "updateComponents": {"surfaceId": S1, "components": [
        {"id": "x", "component": "Text", "text": "<b>hi</b>"}]}}},
    {"why": "reserved_id", "message": {"version": A2UI_VERSION, "updateComponents": {"surfaceId": S1, "components": [
        {"id": "root", "component": "RecordCard", "record": "PROC-001"}]}}},
]


def jsonl(path, msgs):
    with open(path, "w", encoding="utf-8") as f:
        for m in msgs:
            f.write(json.dumps(m, ensure_ascii=False) + "\n")


jsonl(PKG + "/a2ui/examples/mapping-live.jsonl", live)
jsonl(PKG + "/a2ui/examples/mapping-stopped-resume.jsonl", stopped)
jsonl(PKG + "/a2ui/examples/mapping-stopped-resume.client.jsonl", stopped_client)
jsonl(PKG + "/a2ui/examples/chat-records.jsonl", chat)
dump(PKG + "/a2ui/examples/refused.json", {"description": "Agent messages the server drops before the client sees them.", "examples": refused})
print("ok", len(CATALOGUE), "components,", len(COMMANDS), "commands,", len(EX), "examples, A2UI catalog with", len(A2UI_COMPONENTS), "components")
