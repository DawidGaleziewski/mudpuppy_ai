# Phase 0 Research: BA Documentation

Decisions behind [plan.md](plan.md). Each: Decision / Rationale / Alternatives considered.

## 1. Review write path from the Python dashboard

**Decision**: The dashboard never opens the store for writing. A review action (POST from the Docs
tab) runs the TypeScript operator command `pnpm docs:review` (in `apps/crawler/`) as a subprocess
with a JSON payload on stdin. The command validates with Zod, checks the revision is current, writes
the `doc_reviews` row and applies the status change in one transaction, and prints a JSON result.
The dashboard maps the result to a fragment. Reads stay `mode=ro` + `query_only`.

**Rationale**: Keeps Zod the single source of truth for every write and keeps the constitution rule
"Python MUST NOT write to the DB except through the same schemas and migrations" literally true.
Status promotion stays in deterministic TS code (Principle IV). A review is a rare, human-paced
action; 1–2 s of process start is well inside SC-006 (30 s).

**Alternatives considered**: Python writes with Pydantic models mirroring Zod (two validators that
can drift; weakens the read-only guarantee of the dashboard process). A long-lived local TS HTTP
service (a second server to run and secure for one rare action). Writing review files that a TS
job ingests later (the UI could not show the result immediately; stale-revision refusal is lost).

## 2. Constitution amendment needed

**Decision**: MINOR bump 1.3.0 → 1.4.0. The Python tooling bullet gains: "The dashboard MAY record
human review decisions only by invoking the TypeScript review command, which validates with Zod
and writes through the same schemas; the dashboard process itself opens the store read-only."
Principle VI gains: "Review decisions are stored as records (reviewer, time, action, revision) and
status changes are derived from them by deterministic code." Runtime guidance for the BA moves from
`user_input/raw_idea/agents/ba.md` into `.claude/agents/ba.md` + the `ba-practice` skill (the
Governance section already anticipates this move).

**Rationale**: Materially expanded guidance, no principle removed → MINOR.

## 3. Layer B storage shape

**Decision**: Generic record tables, content validated per kind by a Zod discriminated union:
`analysis_sessions`, `analysis_session_runs`, `doc_records` (stable key per portal),
`doc_revisions` (immutable content JSON, confidence, not-observable flag, status),
`doc_evidence_links` (revision → polymorphic target, with `run_id` resolved at write time),
`doc_relations` (revision → record, typed), `doc_reviews`, `followup_tasks` (operational status of
`FUP` records). See [data-model.md](data-model.md).

**Rationale**: Twelve record kinds with evolving fields; one table per kind would mean a migration
each time the BA template grows, and the review/revision/evidence machinery is identical for all
kinds. Kind-specific shape is enforced where the constitution wants it: Zod on write. JSON
`content` is a `CHECK (json_valid)` TEXT column per the sqlite-conventions skill. Constitution's
"nodes and edges tables with JSON attributes" (raw idea §1) is exactly this.

**Alternatives considered**: One table per kind (rigid, many migrations, duplicated revision logic);
a graph DB (needs documented justification; recursive CTEs suffice at this scale); Markdown files
as truth (rejected by the user, D2).

## 4. Stable ids and revisions

**Decision**: `doc_records.id` is a server UUIDv7 (house rule); the human key (`REQ-017`) is
`<prefix>-<seq>` with `seq` = max per (portal, kind) + 1 allocated inside the write transaction,
zero-padded to 3 digits, never reused (withdrawn records keep their key). Revisions are numbered
1..n per record and never updated except for their `status` column, which only the status engine
changes. `UNIQUE(portal_id, key)`, `UNIQUE(record_id, rev_no)`.

**Status engine** (pure function, unit-tested, used by the BA tools and `docs:review`):
- new revision → `draft`; the previous latest revision, if `draft`, becomes `superseded`;
  a `confirmed` revision stays `confirmed` until a newer one is confirmed.
- confirm revision N (must be latest) → N `confirmed`; any older `confirmed` → `superseded`.
- reject revision N (must be latest, reason required) → N `rejected`.
- comment → no status change.
- agents can never set a status; the tools have no status parameter.

## 5. Evidence links and "observed" rule

**Decision**: `doc_evidence_links(target_kind, target_id, run_id)` where `target_kind` ∈ `state,
edge, action, form, network_call, rule_candidate, open_question, decision, process, process_step,
doc_record, review`. The BA tool resolves each target in the same DB, checks it belongs to the
record's portal and to one of the session's input runs (a `state` link must name the run whose
`state_observations` row the BA read), and stores `run_id` so run ↔ docs queries need no
polymorphic joins. `doc_record` and `review` links have `run_id` NULL (a human answer is valid
evidence for a `needs_confirmation` record, never for `observed`).

`observed` requires ≥ 1 link to a Layer A item that is observed: `state`/`edge`/`form` with
`confidence = 'observed'`, or `action`, `network_call`, `process_step` with `confidence='observed'`.
Otherwise `INVALID_CONFIDENCE`. Checked by a pure function over resolved targets.

**Alternatives considered**: evidence as `evidence_ref` file hashes only (loses the path to runs and
to the record that explains the file); FK per target kind (many nullable FK columns).

## 6. Open questions: crawler vs BA

**Decision**: Crawler questions stay in `open_questions` (run-bound, unchanged). BA questions are a
doc record kind `OQ` (so they get keys, revisions, reviews and appear in the SRS). An `OQ` may cite a
crawler question as evidence; the BA tool `address_crawler_question` sets the crawler row to
`addressed` and requires the record key that addresses it. A reviewer answers an `OQ` with a
comment; the BA turns the answer into an assumption or requirement citing that `review`.
The Docs tab "Open questions" section shows both sources, labelled.

**Rationale**: `open_questions.run_id` is NOT NULL; BA questions are not run-bound. Rebuilding that
table for this is churn; a doc kind gives questions the same review loop as everything else.
(Supersedes the spec's assumption that BA questions live in `open_questions`; spec updated.)

## 7. BA tool surface: separate MCP server

**Decision**: A second entry point in `@pathfinder/mcp-server`, `ba-main.ts`, registers only BA
tools on a server named `pathfinder-ba` (tools appear as `mcp__pathfinder-ba__*`); it has no browser
runtime. `.mcp.json` gains the second server. The crawler server does not register BA tools and vice
versa (tests assert both lists, as `agent-lockdown.test.ts` does today).

**Rationale**: Role separation (Principle III) enforced by what each server exposes, not only by
agent frontmatter. Shares `ServerContext`, DB and error types.

**Alternatives considered**: one server with all tools, filtered by agent `tools:` (a misconfigured
agent could reach crawler tools); a separate TS package (duplicates bootstrapping for no gain).

## 8. Pure documentation core: new package `@pathfinder/docs`

**Decision**: `apps/crawler/packages/docs` holds pure functions with no browser/LLM: key allocation
helpers, the status engine, the observed-rule check, evidence resolution over a DB handle, the SRS
renderer (records → Markdown + Mermaid), the traceability matrix builder and the evidence audit.
MCP BA services, `docs:review`, `docs:export` and `docs:audit` scripts call it. Zod schemas for
Layer B live in `@pathfinder/core/schemas` like all others.

**Rationale**: Principle VII (pure, unit-tested against fixtures); one renderer for export.

## 9. Diagrams in the dashboard

**Decision**: Mermaid source is produced from structured records, never authored by the agent.
Export uses the TS renderer. The dashboard builds the same Mermaid text in Python for the Docs tab
(process map, state diagram, capability map) and renders it client-side with vendored
`mermaid.min.js` loaded only on Docs pages. Parity is enforced by shared golden fixtures in
`specs/004-ba-documentation/contracts/diagram-fixtures/` (records JSON in, `.mmd` out) tested by
both apps.

**Rationale**: calling the TS renderer per page view would break the dashboard's < 1 s page budget;
the diagram grammar is small (three diagram types) and the golden fixtures stop drift.

**Alternatives considered**: storing rendered Mermaid in the revision (derived data in the source of
truth, stale on re-render changes); server-side SVG rendering (needs a headless browser in Python).

## 10. Trace mode on top of the map runtime

**Decision**:
- `start_run` gains `mode: 'map' | 'trace'` (default `map`), and for trace `process: { name, goal }`
  and optional `followup_key`. `RunMode` Zod enum adds `trace` (no migration: `runs.mode` has no
  CHECK, by design since 001 FR-022).
- `navigate`/`act` take `intent` (required in trace mode). In trace mode the server appends a
  `process_steps` row for every executed call: order, intent, edge, action, state before/after,
  network calls (via edge), observed outcomes (title/route/URL changes, new alerts/dialogs, form
  validation messages read from the post-state ARIA snapshot), evidence, confidence `observed`.
- Typing: trace mode also extracts fillable controls (textbox, searchbox, combobox, spinbutton,
  checkbox, radio) as `fill`/`check`/`select` actions, safety class `read` (local only, no request).
  `act` takes `value` for them. Values must be synthetic: the persona may declare
  `trace_inputs` (field label → value); agent-supplied values go through the PII scrubber and are
  refused with `PII_SUSPECTED` if it would change them. Stored values are the scrubbed ones.
- Boundary: when `act` is refused by the action gate **for its safety class** in trace mode, the
  server closes the process with `outcome = 'boundary_reached'`, records `boundary_action_id`, adds a
  crawler open question ("What happens after '<name>'? Not observable: <class> on <environment>"),
  ends the run `completed`, and returns `TRACE_BOUNDARY_REACHED` (details: process id, step count).
  Robots/denylist/scope refusals stay plain `ACTION_REFUSED`.
- `finish_run` in trace mode takes `outcome: 'goal_reached' | 'abandoned'` and a short
  `observed_result`; it does not require an empty frontier (no frontier is used for trace).
- The crawler agent stays one agent with two modes (Principle III): `crawler.md` gets a Trace
  section; its description stops saying "never for trace runs".

**Rationale**: reuses every safety gate unchanged (FR-021); the stop happens at the same gate that
already protects production. Fill actions are needed for any real process (quote forms).

**Alternatives considered**: a separate trace agent (constitution forbids a separate explorer);
letting the agent report steps itself (the server observes and records; agents do not record facts).

## 11. Follow-up tasks lifecycle

**Decision**: `FUP` is a doc record kind (content: question, suggested mode, target, persona,
reason) with an operational row in `followup_tasks(record_id, status, run_id, blocked_reason)`.
`status` ∈ `open, in_progress, done, blocked, cancelled`, driven by deterministic code:
`start_run(followup_key)` → `in_progress` + `run_id`; run completes → `done`; trace boundary before
the goal or run `stopped_warning` → `blocked` with the rule/warning; operator
`docs:review --cancel-followup` → `cancelled`. The BA cannot set it.

## 12. SRS export layout

**Decision**: `pnpm docs:export <portal> [--env] [--confirmed-only] [--out]` writes
`data/exports/<portal>-<env>-srs/` (overwritten) with numbered Markdown chapters following an
ISO/IEC/IEEE 29148 SRS outline adapted to as-is documentation, Mermaid in fenced blocks, and
`records.json` (canonical: sorted keys, records sorted by key, revisions by number). No wall-clock
time in any file: "as of" is the newest revision/review timestamp. Byte-identical on re-run (SC-007).
Chapters: see [contracts/srs-export.md](contracts/srs-export.md).

## 13. Portal data export/delete (spec 002 FR-028)

**Decision**: `portal:export`/`portal:delete` must include the new tables in their partition map
(all Layer B tables carry or reach `portal_id`); delete order: reviews → relations → evidence links
→ followup_tasks → revisions → records → session runs → sessions, then process steps → processes
before runs. Covered by the existing workspace tests extended with Layer B rows.

## 14. BA knowledge as a skill

**Decision**: `.claude/skills/ba-practice/SKILL.md` (procedure, record-kind guide, quality
attributes) with `references/` for the SRS outline, Cockburn use-case template, requirement
writing rules (EARS-style "The system shall …", Given/When/Then), business-rule types and decision
tables, glossary rules (verbatim term + English definition, one preferred term), and "what I could
not see" checklist. Derived from `user_input/raw_idea/agents/ba.md`. The `ba` agent preloads it.
Written with the `subagent-authoring` skill.

**Model**: `ba` runs on `opus` (synthesis quality and consistency across passes matter more than
cost; it never browses so token use is bounded by evidence size). Budget: stop condition per pass,
the session summary lists what was skipped.
