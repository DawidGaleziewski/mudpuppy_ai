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
CI: run it and fail if git shows a diff (the JSON must never be edited by hand).
"""
import json, os, copy

PKG = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))   # = workbench/
os.makedirs(PKG + "/schema", exist_ok=True)
os.makedirs(PKG + "/examples", exist_ok=True)
BASE = "https://mudpuppy.local/schema/workbench/"

PATHS = ["chat", "mapping", "troubleshoot", "explain"]

# ---------------------------------------------------------------- shared defs
DEFS = {
    "scanId": {"type": "string", "pattern": "^[0-9a-f]{8}$", "description": "Scan id as stored (lowercase hex), e.g. 01a110d5."},
    "step": {"type": "integer", "minimum": 1, "maximum": 100000, "description": "Step number within the scan."},
    "eventRef": {"type": "string", "pattern": "^[0-9a-f]{8}#[0-9]{1,6}$", "description": "scan#step, e.g. 01a110d5#171."},
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
    "recordId": {"type": "string", "pattern": "^(SCR|PROC|BR|CAP|NFR)-[0-9]{3}$", "description": "A documentation record, process or rule: SCR-001 (record of a console screen), PROC-001, BR-021, CAP-005, NFR-001. Portal pages are pageRefs, not records."},
    "changeId": {"type": "string", "pattern": "^CHG-[0-9]{3}$"},
    "findingId": {"type": "string", "pattern": "^FND-[0-9]{3}$"},
    "ruleId": {"type": "string", "pattern": "^BR-[0-9]{3}$"},
    "plainText": {"type": "string", "pattern": "^[^<>{}]*$", "description": "Plain words. No markup, no template syntax."},
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
               "persona": {"enum": ["guest"]}, "limit_steps": {"type": "integer", "minimum": 10, "maximum": 2000}},
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
    "$defs": {k: DEFS[k] for k in ("scanId", "step", "route", "pageRef", "plainText")},
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
     "description": ("Propose a write (start, resume or stop a scan, run an attempt, add a mark). The person sees a command card and confirms it; "
                     "nothing runs before that. Give a one-sentence reason in plain words. Args per command: "
                     "scan.start {type, start?, persona?, limit_steps?} · scan.resume {scan} · scan.stop {scan} · "
                     "path.attempt {scan, step, variation} · mark.add {target, kind}. You get back 'proposed, waiting for the person'."),
     "input_schema": inline_refs(command)},
]

EX = {
    "valid/mapping-live.json": {
        "version": "1", "path": "mapping", "why": "You asked to map the OC/AC calculator.",
        "select": {"route": "/kalkulator/kierowca", "state": 2},
        "components": [
            {"id": "map", "type": "LiveMap", "bind": {"scan": "01a110d5"}, "props": {"follow": True, "view": "graph"}},
            {"id": "detail", "type": "PageDetail", "bind": {"scan": "01a110d5", "page": "@selected"}},
            {"id": "story", "type": "Narration", "bind": {"scan": "01a110d5"}, "props": {"every": "page"}}],
        "suggestions": ["Where does it go next?", "Stop after the calculator"]},
    "valid/mapping-stopped.json": {
        "version": "1", "path": "mapping", "why": "The scan stopped at /kontakt.",
        "select": {"route": "/kontakt"},
        "components": [
            {"id": "map", "type": "LiveMap", "bind": {"scan": "01a110d5"}, "props": {"follow": False}},
            {"id": "err", "type": "ErrorCard", "bind": {"scan": "01a110d5"}},
            {"id": "detail", "type": "PageDetail", "bind": {"scan": "01a110d5", "page": "@selected"}}],
        "suggestions": ["Why did it stop here?", "Troubleshoot with me"]},
    "valid/troubleshoot.json": {
        "version": "1", "path": "troubleshoot", "why": "You asked why the scan stopped at /kontakt.",
        "components": [
            {"id": "shot", "type": "StepShot", "bind": {"scan": "01a110d5", "step": 171}, "props": {"mark": "target"}},
            {"id": "tail", "type": "EventTail", "bind": {"scan": "01a110d5", "step": 171}, "props": {"count": 5}},
            {"id": "fixes", "type": "FixChoices", "bind": {"scan": "01a110d5", "step": 171}},
            {"id": "tries", "type": "AttemptList", "bind": {"scan": "01a110d5", "step": 171}}]},
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
    "valid/chat-plain.json": {"version": "1", "path": "chat", "why": "A short answer is enough.", "components": []},
    "invalid/unknown-type.json": {"version": "1", "path": "mapping", "why": "You asked to map.", "components": [
        {"id": "x", "type": "HtmlBlock", "bind": {"html": "<b>hi</b>"}}]},
    "invalid/wrong-path.json": {"version": "1", "path": "chat", "why": "You asked to map.", "components": [
        {"id": "map", "type": "LiveMap", "bind": {"scan": "01a110d5"}}]},
    "invalid/too-many.json": {"version": "1", "path": "chat", "why": "Too much.", "components": [
        {"id": "a", "type": "RecordCard", "bind": {"record": "PROC-001"}}, {"id": "b", "type": "RecordCard", "bind": {"record": "PROC-002"}},
        {"id": "c", "type": "RecordCard", "bind": {"record": "BR-021"}}]},
    "invalid/markup-in-why.json": {"version": "1", "path": "chat", "why": "<img src=x onerror=alert(1)>", "components": []},
    "invalid/bad-scan-id.json": {"version": "1", "path": "mapping", "why": "You asked to map.", "components": [
        {"id": "map", "type": "LiveMap", "bind": {"scan": "../../etc"}}]},
    "invalid/extra-prop.json": {"version": "1", "path": "mapping", "why": "You asked to map.", "components": [
        {"id": "map", "type": "LiveMap", "bind": {"scan": "01a110d5"}, "props": {"style": "color:red"}}]},
    "invalid/missing-id.json": {"version": "1", "path": "mapping", "why": "You asked to map.", "components": [
        {"type": "LiveMap", "bind": {"scan": "01a110d5"}}]},
    "invalid/duplicate-id.json": {"version": "1", "path": "mapping", "why": "You asked to map.", "components": [
        {"id": "map", "type": "LiveMap", "bind": {"scan": "01a110d5"}},
        {"id": "map", "type": "PageDetail", "bind": {"scan": "01a110d5", "page": "@selected"}}]},
    "invalid/unknown-record.json": {"version": "1", "path": "chat", "why": "You asked about a process.", "components": [
        {"id": "proc", "type": "RecordCard", "bind": {"record": "PROC-999"}}]},
    "narration/valid.json": {"scan": "01a110d5", "lines": [
        {"text": "Followed 'Samochód' in the menu to /ubezpieczenia/samochod.", "cites": ["01a110d5#38"]},
        {"text": "Same URL, new screen: recorded /kalkulator/kierowca as step 2.", "cites": ["01a110d5#102"], "kind": "milestone"}]},
    "narration/ungrounded-number.json": {"scan": "01a110d5", "lines": [
        {"text": "Found 40 forms on /porownanie.", "cites": ["01a110d5#140"]}]},
    "command/resume.json": {"command": "scan.resume", "args": {"scan": "01a110d5"}, "reason": "The page loaded but the form button never appeared; resuming keeps the 113 queued links."},
    "command/attempt.json": {"command": "path.attempt", "args": {"scan": "01a110d5", "step": 171, "variation": "wait_longer"}, "reason": "The form may need more than 10 s to appear."},
    "command/invalid-unknown.json": {"command": "portal.delete", "args": {}, "reason": "Clean up."},
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
print("ok", len(CATALOGUE), "components,", len(COMMANDS), "commands,", len(EX), "examples")
