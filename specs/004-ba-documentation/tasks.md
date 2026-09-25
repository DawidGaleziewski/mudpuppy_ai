---

description: "Task list for BA Documentation (R-13 to R-16)"
---

# Tasks: BA Documentation

**Input**: Design documents from `specs/004-ba-documentation/`

**Prerequisites**: plan.md, spec.md, research.md (§1–§14), data-model.md, contracts/
(ba-mcp-tools, crawler-trace-tools, operator-cli, http-routes-docs, srs-export), quickstart.md;
constitution at `.specify/memory/constitution.md`.

**Tests**: Required by the constitution (Principle VII, Development Workflow): pure functions get
Vitest/pytest tests before dependent code builds on them. Test tasks come first in each block and
MUST fail before the implementation task that follows.

**Organization**: Phases follow the roadmap items, not strict story priority, because each item closes
on its own: R-13 = Setup + Foundational + US1; R-14 = US4; R-15 = US2 + US3; R-16 = US5 + Polish.
US2 (P1) comes after US4 (P2) only because the Docs tab should show traced processes when it
lands; US2 does not depend on US4 and may be pulled forward.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1–US5 from spec.md
- **[DB]**: schema/migration work — delegate to the `db-admin` subagent (skill `sqlite-conventions`)
- **[FE]**: UI work — `frontend-dev` subagent, skill `revamp-dashboard`
- **[GOV]**: repo-structure work — `governor` subagent
- **[AG]**: agent/skill definition — skill `subagent-authoring`, then its linter

## Path Conventions

TS workspace `apps/crawler/` (packages under `apps/crawler/packages/<pkg>/{src,tests}`, scripts in
`apps/crawler/scripts/`, thin: logic lives in a package and is tested there, as with
`core/src/portal-data.ts`). Dashboard `apps/dashboard/src/pathfinder_dashboard/`, tests
`apps/dashboard/tests/`. Migrations `data/migrations/`. Agents/skills `.claude/`.

---

## Phase 1: Setup (R-13)

- [ ] T001 [GOV] Create package `apps/crawler/packages/docs` (`@pathfinder/docs`): `package.json` (deps `@pathfinder/core`, `zod`, `kysely`; exports `.` and `./testing`), `tsconfig.json` and `vitest.config.ts` copied from `packages/core`, `src/index.ts`, `src/testing/index.ts`, `tests/`. `pnpm install && pnpm typecheck && pnpm lint && pnpm test` pass from `apps/crawler/`
- [ ] T002 [GOV] Add the `pathfinder-ba` server: script `"start:ba": "tsx src/ba-main.ts"` in `apps/crawler/packages/mcp-server/package.json`; `.mcp.json` entry `pathfinder-ba` (stdio, `pnpm --dir apps/crawler --filter @pathfinder/mcp-server start:ba`, env `PATHFINDER_ENV=production`), next to `pathfinder`

---

## Phase 2: Foundational (R-13, blocks all stories)

- [ ] T003 [DB] Migration `data/migrations/0003_ba_documentation.{up,down}.sql` exactly per data-model.md: STRICT tables `analysis_sessions` (`status` CHECK `running, completed, interrupted`; `summary` required when `completed`; `passes_json`, `gaps_json` DEFAULT `'[]'` with `json_valid`), `analysis_session_runs` (PK (`session_id`,`run_id`) WITHOUT ROWID), `doc_records` (`kind` CHECK of the 12 kinds; UNIQUE(`portal_id`,`key`); UNIQUE(`portal_id`,`kind`,`seq`); `withdrawn` 0/1), `doc_revisions` (UNIQUE(`record_id`,`rev_no`); `change` CHECK `create, revise, withdraw`; `status` CHECK `draft, confirmed, rejected, superseded`; `confidence` enum; `not_observable` 0/1; `change_note` required when `change <> 'create'`), `doc_evidence_links` (`target_kind` CHECK of the 12 target kinds; `run_id` NULL only when `target_kind IN ('doc_record','review')`; indexes on `run_id` and (`target_kind`,`target_id`)), `doc_relations` (PK (`from_revision_id`,`to_record_id`,`type`); `type` CHECK of the 9 types), `doc_reviews` (`action` CHECK `confirm, reject, comment`; `text` required unless `confirm`), `followup_tasks` (`status` CHECK `open, in_progress, done, blocked, cancelled`; `blocked_reason` required when `blocked`). Down drops in reverse FK order. Regenerate `data/schema/schema.sql`; add Layer B conventions (key format `<PREFIX>-<seq>`, polymorphic evidence targets resolved by tools, status changed only by the status engine) to `data/schema/README.md`. Migration up/down/up round-trip test in `packages/core/tests/db.test.ts`
- [ ] T004 [P] Zod schemas in `apps/crawler/packages/core/src/schemas/`: `analysis-session.ts`, `doc-record.ts` (`DocKind`, `KEY_PREFIX` map `CAP SCR PROC UC REQ NFR BR GL DI ASM OQ FUP`), `doc-content.ts` (discriminated union on `kind` with the per-kind fields of data-model.md "Content per kind", e.g. `requirement.priority` ∈ `must, should, could, wont, unset`, `acceptance_criteria[]` of `{given[], when[], then[]}`; `business_rule.rule_type` ∈ `constraint, computation, inference, action_enabler`; `nfr.category` ∈ the 7 categories; `glossary_term.term_verbatim` + `lang`), `doc-revision.ts`, `evidence-link.ts` (`EvidenceTargetKind`), `doc-relation.ts` (`RelationType`), `doc-review.ts`, `followup-task.ts`; export from `schemas/index.ts`; extend `db-types.ts` with the 8 tables
- [ ] T005 [P] Schema tests in `apps/crawler/packages/core/tests/schemas.test.ts`: one valid and at least two invalid samples per content kind; Zod enums equal the migration CHECK lists (parse `schema.sql`, same approach as the existing enum tests)
- [ ] T006 [P] Failing tests `apps/crawler/packages/docs/tests/keys.test.ts`, then `src/keys.ts`: `formatKey(kind, seq)` → `REQ-007` (zero-pad to 3, wider when needed), `parseKey`, `nextSeq(db, portal, kind)` = max+1 inside the caller's transaction; keys of withdrawn records are never reused
- [ ] T007 Failing tests `apps/crawler/packages/docs/tests/status-engine.test.ts` covering research §4: new revision → `draft` and previous latest `draft` → `superseded`; confirmed stays until a newer one is confirmed, then → `superseded`; confirm/reject only the latest `draft` (else `STALE_REVISION`); reject without text refused; comment changes nothing; output includes the denormalised `latest_rev`, `confirmed_rev`, `title`, `withdrawn`
- [ ] T008 Implement `apps/crawler/packages/docs/src/status-engine.ts` as pure functions (current revisions + event → row updates). T007 passes
- [ ] T009 [P] Failing tests then `apps/crawler/packages/docs/src/relations.ts`: the allowed (from kind, type, to kind) table: `capability contains process|screen`; `use_case describes process`; `requirement refines use_case|capability`; `requirement enforces business_rule`; `data_item appears_on screen`; any kind `uses_term glossary_term`; `glossary_term synonym_of glossary_term`; `assumption|requirement|business_rule answers open_question`; `depends_on` between two records of the same kind. `isAllowed()` returns `RELATION_NOT_ALLOWED` details otherwise
- [ ] T010 [P] Failing tests then `apps/crawler/packages/docs/src/observed-rule.ts`: `observed` allowed only if ≥ 1 resolved target is `state|edge|form` with `confidence = 'observed'` or `action|network_call|process_step` observed; `doc_record`/`review`/`rule_candidate`/`open_question`/`decision` never qualify (research §5)
- [ ] T011 Fixture store in `apps/crawler/packages/docs/src/testing/fixture-store.ts`: `makeFixtureStore()` opens `:memory:`, runs migrations, seeds one completed map run of a portal `mock-insurer` shaped like `mcp-server/tests/mock-insurer.ts` (states for start, samochód, dom, quote/start; forms `Kalkulator składki`, `Zapytanie o ofertę` with fields; network calls; actions incl. `Kup polisę` mutating refused; 2 crawler open questions; 1 rule candidate; evidence files written to a temp evidence dir), plus a second portal `other` with one run (for `PORTAL_MISMATCH`)
- [ ] T012 Failing tests then `apps/crawler/packages/docs/src/evidence.ts`: `resolveTargets(db, portal, sessionRunIds, links[])` → per link `{target_kind, target_id, run_id, portal_id, confidence}` or errors `UNKNOWN_REF`, `PORTAL_MISMATCH`, `RUN_NOT_IN_SESSION`; a `state` link needs `run_id` of a `state_observations` row; `doc_record`/`review` resolve with `run_id` null; process targets deferred to T044
- [ ] T013 Extend the portal partition in `apps/crawler/packages/core/src/portal-data.ts` for export and delete with the 8 Layer B tables in the order of data-model.md "Portal data partition"; extend `packages/core/tests/portal-data.test.ts` so export includes and delete removes Layer B rows of that portal only

**Checkpoint**: store, schemas and pure rules ready; nothing agent-facing yet.

---

## Phase 3: User Story 1 — BA documents a portal from recorded evidence (P1, R-13) 🎯 MVP

**Goal**: A browserless `pathfinder-ba` server and a `ba` agent that turn map-run evidence into
keyed, revisioned, evidence-linked draft records inside analysis sessions.

**Independent Test**: quickstart.md R-13: service tests on the fixture store, lockdown test,
`docs:audit` clean after a scripted full session.

### Tests for User Story 1 (write first, must fail)

- [ ] T014 [P] [US1] `apps/crawler/packages/mcp-server/tests/ba-lockdown.test.ts`: the BA server lists exactly `BA_TOOL_NAMES` = `list_runs, get_run_evidence, get_evidence, list_records, get_record, get_pending_feedback, start_session, record_pass, finish_session, create_record, revise_record, withdraw_record, address_crawler_question` (13 in R-13; `list_processes`, `get_process` join in T043); the crawler server lists none of them and the BA server none of `AGENT_TOOL_NAMES`; no BA tool input schema has a `status`, `key` (except as a lookup on revise/withdraw/get), `id` or evidence `run_id` other than the `state` observation run
- [ ] T015 [P] [US1] `apps/crawler/packages/mcp-server/tests/ba-session.test.ts`: `start_session` (runs must be of the portal → `PORTAL_MISMATCH`; unknown → `RUN_NOT_FOUND`), resume of `interrupted` (may add runs), `record_pass` appends, `finish_session` before `synthesis` → `SESSION_INCOMPLETE`, writes to a completed session → `SESSION_NOT_ACTIVE`, sweep of `running` sessions idle > 24 h to `interrupted` on server start
- [ ] T016 [P] [US1] `apps/crawler/packages/mcp-server/tests/ba-records.test.ts`: create allocates `REQ-001`, `REQ-002`, `GL-001`…; revision 1 `draft`; `MISSING_EVIDENCE` on empty evidence; `INVALID_CONFIDENCE` for `observed` citing only a rule candidate; `RUN_NOT_IN_SESSION`; `SCHEMA_INVALID` for bad content; `revise_record` with stale `base_rev` → `STALE_REVISION` with `latest_rev`; `change_note` required; `withdraw_record` sets `withdrawn`; `RELATION_NOT_ALLOWED`; `not_observable` without question → `NOT_OBSERVABLE_NEEDS_QUESTION`; prose with an e-mail → `PII_SUSPECTED`; kind `followup` creates a `followup_tasks` row `open`; `address_crawler_question` sets the crawler row `addressed` only when `by_key`'s latest revision cites it; a failed write leaves no partial rows
- [ ] T017 [P] [US1] `apps/crawler/packages/mcp-server/tests/ba-reads.test.ts`: `list_runs` counts; `get_run_evidence` per kind with cursor paging (limit ≤ 200); `get_evidence` returns the record and evidence file content, truncated at 60 kB with `truncated: true`; `list_records` filters; `get_record` returns all revisions, links, relations, reviews; `get_pending_feedback` returns reviews and follow-up changes newer than the previous completed session

### Implementation for User Story 1

- [ ] T018 [US1] Add error codes `SESSION_NOT_ACTIVE, SESSION_INCOMPLETE, RUN_NOT_IN_SESSION, PORTAL_MISMATCH, RECORD_NOT_FOUND, STALE_REVISION, RELATION_NOT_ALLOWED, NOT_OBSERVABLE_NEEDS_QUESTION` to `apps/crawler/packages/mcp-server/src/errors.ts`
- [ ] T019 [US1] `apps/crawler/packages/mcp-server/src/services/ba/sessions.ts`: start/resume/record_pass/finish, stale-session sweep (called from server start like `interruptStaleRuns`). T015 passes
- [ ] T020 [US1] `apps/crawler/packages/mcp-server/src/services/ba/records.ts`: create/revise/withdraw/address in one synchronous transaction each (validate content with `doc-content.ts`, PII-check prose with the core scrubber, resolve evidence with `@pathfinder/docs` `resolveTargets`, apply `observed-rule`, `relations`, `keys`, `status-engine`, write revision + links + relations + denormalised record + `followup_tasks`). T016 passes
- [ ] T021 [P] [US1] `apps/crawler/packages/mcp-server/src/services/ba/reads.ts` and `feedback.ts` (read tools of contracts/ba-mcp-tools.md; evidence file read through the core `EvidenceStore`). T017 passes
- [ ] T022 [US1] `apps/crawler/packages/mcp-server/src/ba-tools/index.ts` (`BA_TOOL_NAMES`, `registerBaTools`, `createBaServer`, same ok/fail wrappers as `tools/index.ts`), `src/ba-main.ts` (same root/env resolution as `main.ts`, no runtime), export from `src/index.ts`. T014 passes
- [ ] T023 [US1] Failing tests then `apps/crawler/packages/docs/src/audit.ts` (checks of contracts/operator-cli.md `docs:audit`: ≥ 1 link per revision, links resolve with matching portal/run, observed rule, non-draft status explained by a review, denormalised columns match, every `followup` has a task row) and thin `apps/crawler/scripts/docs-audit.ts` + `"docs:audit"` script in `apps/crawler/package.json` (JSON report, exit 1 on findings)
- [ ] T024 [US1] `apps/crawler/packages/mcp-server/tests/ba-e2e.test.ts`: an in-memory MCP client plays a full session on the fixture store (all 7 passes; creates SCR, CAP, DI, GL, REQ with Given/When/Then, BR, NFR, ASM, OQ, FUP; one revise after a seeded reject review with `responds_to_review`), then `audit()` returns zero findings (SC-001, SC-002)
- [ ] T025 [AG] [US1] Skill `.claude/skills/ba-practice/`: `SKILL.md` (≤ 500 lines; when to use; the 7-pass procedure of FR-012 and what each pass writes; observed vs inferred vs needs_confirmation with examples; "never guess, ask": OQ vs FUP; English prose with portal terms verbatim; respond to feedback first) and `references/`: `record-kinds.md` (every kind's fields and a good/bad example, from data-model.md), `requirements-writing.md` ("The system shall…", quality attributes unambiguous/complete/consistent/verifiable, Given/When/Then, rule vs requirement), `use-cases.md` (Cockburn template), `business-rules.md` (rule types, decision tables), `glossary.md` (ubiquitous language, synonyms, one preferred term), `srs-outline.md` (29148-style outline mapped to kinds), `blind-spots.md` (not observable: backend jobs, emails, integrations, manual workarounds, business goals). Source: `user_input/raw_idea/agents/ba.md`, constitution I–III, VI
- [ ] T026 [AG] [US1] Agent `.claude/agents/ba.md` per skill `subagent-authoring`: name `ba`; description ≤ 50 words (documents a portal from recorded crawl evidence into keyed, evidence-linked Layer B records; never browses; not for crawling, testing or UI); `tools:` exactly the `mcp__pathfinder-ba__*` names of `BA_TOOL_NAMES`; `model: opus`; `skills: [ba-practice]`; body: procedure (start_session with given runs → get_pending_feedback first → passes → finish_session), rules (every record cites evidence; ask via OQ/FUP; never set status; stop on repeated tool refusal), return contract ≤ 15 lines (session id, records by kind, gaps, follow-ups). Run `python3 .claude/skills/subagent-authoring/scripts/lint_agent.py .claude/agents/ba.md --root .` and fix all errors
- [ ] T027 [US1] Update the Governance note: add to `user_input/raw_idea/agents/ba.md` a first line pointing to `.claude/agents/ba.md` and `.claude/skills/ba-practice/` as the live guidance
- [ ] T028 [US1] Manual validation, quickstart.md R-13 step 2–3: run the `ba` agent on a sandbox store holding a mock-insurer map run (produce it with the existing `insurer-run` harness writing to `data/db/sandbox.sqlite`); `pnpm docs:audit mock-insurer --env sandbox` exits 0; record session id and record counts in `roadmap.md` notes

**Checkpoint**: R-13 closable — BA documents from map evidence; audit clean.

---

## Phase 4: User Story 4 — Crawler traces a named process (P2, R-14)

**Goal**: `trace` mode records one process as server-observed steps; production stops at the first
non-read action with a not-observable remainder.

**Independent Test**: quickstart.md R-14 on the mock insurer (sandbox → `goal_reached`; production →
`TRACE_BOUNDARY_REACHED`, no mutating request).

### Tests for User Story 4 (write first, must fail)

- [ ] T029 [P] [US4] `apps/crawler/packages/config/tests/persona-trace-inputs.test.ts`: `trace_inputs` map (label verbatim → value) accepted; a value the PII scrubber would change (e-mail, PESEL-like, phone) → `CONFIG_INVALID`; inherited through `extends`
- [ ] T030 [P] [US4] `apps/crawler/packages/crawler/tests/action-extractor.test.ts` (extend): with `{ mode: 'trace' }` textbox, searchbox, combobox, spinbutton, checkbox, radio become `fill`/`check`/`select` actions with safety class `read` and ranked locators; map mode unchanged (existing expectations stay)
- [ ] T031 [P] [US4] `apps/crawler/packages/crawler/tests/step-outcomes.test.ts`: pure `stepOutcomes(before, after)` over two ARIA snapshots + URLs → strings for title change, route change, new dialog/alert, new validation messages, element count changes; deterministic order
- [ ] T032 [P] [US4] `apps/crawler/packages/mcp-server/tests/trace-run.test.ts` with the mock insurer (extend `mock-insurer.ts` with a quote result page reachable by GET after `step2` and a POST `Kup polisę`/`Wyślij zapytanie` submit): sandbox trace "calculate a car premium" → steps with fills, `finish_run(goal_reached)`, process `recorded`; production config → `TRACE_BOUNDARY_REACHED` at the submit with `{process_id, steps, action, rule}`, process `boundary_reached` with `boundary_action_id` and `not_observable`, one crawler open question, run `completed`, mock request log has no POST (SC-005); missing `intent` or `process` → `SCHEMA_INVALID`; `get_next_frontier_item` → null; map runs unchanged; `followup_key`: `open → in_progress → done` and `→ blocked` with the rule

### Implementation for User Story 4

- [ ] T033 [DB] [US4] Migration `data/migrations/0004_trace_processes.{up,down}.sql` per data-model.md: `processes` (`run_id` UNIQUE FK; `status` CHECK `recorded, replay_verified, documented`; `outcome` CHECK `goal_reached, boundary_reached, stopped, abandoned` or NULL; `boundary_action_id` and `not_observable` required when `boundary_reached`), `process_steps` (UNIQUE(`process_id`,`ord`); `kind` CHECK `navigate, click, fill, check, select`; `outcomes_json` JSON array; `evidence_ref` non-empty; `confidence` enum); regenerate `schema.sql`; add both tables to the portal partition in `core/src/portal-data.ts` before `runs`
- [ ] T034 [P] [US4] Zod `apps/crawler/packages/core/src/schemas/process.ts`, `process-step.ts`; `RunMode` in `run.ts` → `['map','trace']`; `db-types.ts`; schema tests
- [ ] T035 [US4] `trace_inputs` in `apps/crawler/packages/config/src/persona-schema.ts` + PII check in `load-persona.ts`. T029 passes
- [ ] T036 [US4] Trace-mode fillable controls in `apps/crawler/packages/crawler/src/action-extractor.ts` (option `mode`), `fill/check/select` execution with `value` in `apps/crawler/packages/mcp-server/src/runtime/browser-runtime.ts`. T030 passes
- [ ] T037 [P] [US4] `apps/crawler/packages/crawler/src/step-outcomes.ts`. T031 passes
- [ ] T038 [US4] `apps/crawler/packages/mcp-server/src/services/trace.ts`: create process on trace `start_run`; `appendStep` (ord, intent, kind, action/edge, scrubbed value, state before/after, `stepOutcomes`, evidence ref, `observed`); `closeProcess(outcome, …)`; follow-up transitions `open → in_progress → done|blocked` (research §11)
- [ ] T039 [US4] Tool/input plumbing per contracts/crawler-trace-tools.md in `apps/crawler/packages/mcp-server/src/tools/index.ts`, `services/start-run.ts`, `services/frontier.ts`, `runtime/pipeline.ts`: `mode`, `process`, `followup_key` (must be an `open` FUP of the portal), `intent` (required in trace), `value` (fill/select only, `PII_SUSPECTED`), no frontier in trace, `step` in results
- [ ] T040 [US4] Boundary in `apps/crawler/packages/mcp-server/src/runtime/pipeline.ts`: on an action-gate refusal for safety class in a trace run → `closeProcess(boundary_reached)`, crawler open question "What happens after '<name>'? Not observable: <class> on <environment>", run `completed`, follow-up `blocked`, error `TRACE_BOUNDARY_REACHED` (add to `errors.ts`); robots/denylist/scope refusals unchanged
- [ ] T041 [US4] `finish_run` trace variant (`outcome` `goal_reached|abandoned` required, `observed_result` ≤ 1000, no frontier check) in `services/run-lifecycle.ts` / `tools/index.ts`. T032 passes
- [ ] T042 [AG] [US4] `.claude/agents/crawler.md`: description covers both modes ("maps a portal or traces one named process…; never interprets business intent or tests"); new "Trace" section (start_run with mode/process[/followup_key], pass `intent` on every call, use `trace_inputs` values or obvious synthetic values, stop and report on `TRACE_BOUNDARY_REACHED`, `finish_run` with outcome + facts-only `observed_result`); lint with `lint_agent.py`; existing lockdown test unchanged
- [ ] T043 [P] [US4] Failing tests then BA tools `list_processes`, `get_process` in `apps/crawler/packages/mcp-server/src/services/ba/reads.ts` + registration; `BA_TOOL_NAMES` → 15 (update T014's test)
- [ ] T044 [P] [US4] Process targets in `apps/crawler/packages/docs/src/evidence.ts` (`process`, `process_step` resolve to their run; `process_step` qualifies for `observed`) with tests; fixture store gains a trace run (sandbox, goal reached) and a boundary trace (production)
- [ ] T045 [US4] `.claude/skills/ba-practice/SKILL.md` + `references/use-cases.md`: process pass uses `get_process`; `PROC` `observed_extent` (`full | until_boundary | map_only`); use-case main flow from steps; boundary → not_observable + OQ; request traces with `FUP` (`suggested_mode: trace`, target `{process_name, goal}`)
- [ ] T046 [US4] Manual validation quickstart.md R-14 with the crawler agent on the mock insurer (sandbox and production configs); note results in `roadmap.md`

**Checkpoint**: R-14 closable.

---

## Phase 5: User Story 2 — Read the documentation and trace it to evidence (P1, R-15)

**Goal**: Docs tab with SRS sections, record pages, diagrams, revision history, evidence → run
links, run → docs reverse tab; live.

**Independent Test**: quickstart.md R-15 steps 1–2 and `uv run pytest`.

### Tests for User Story 2 (write first, must fail)

- [ ] T047 [P] [US2] `apps/dashboard/tests/conftest.py`: seed helpers for Layer B and process rows (inserting directly into the fixture store built from migrations, test-only) and a `ba_fixture` store: portal `mock-insurer` with records of every kind, a REQ with 2 revisions (rev 1 confirmed, rev 2 draft), a rejected BR with reason, a withdrawn GL, a not-observable PROC with OQ, FUP `blocked`, evidence links to states/forms/network calls/process steps across 2 runs, one link to a deleted target (broken link)
- [ ] T048 [P] [US2] `apps/dashboard/tests/test_models_schema.py` passes for the 10 new tables once models exist (TABLE_MODELS must equal the table set — fails now)
- [ ] T049 [P] [US2] `apps/dashboard/tests/test_docs_queries.py`: portal list with counts by status; section listings with filters (`kind`, `status`, `confidence`, `flag`); record detail with revisions/links/relations in and out/reviews; resolved evidence rows carry run id, mode, date; broken links flagged; run → citing records; session detail
- [ ] T050 [P] [US2] Diagram goldens `specs/004-ba-documentation/contracts/diagram-fixtures/` (`process-map.json`/`.mmd` incl. a boundary node, `screen-nav.json`/`.mmd`, `capability-map.json`/`.mmd`) and `apps/dashboard/tests/test_diagrams.py` asserting byte equality
- [ ] T051 [P] [US2] `apps/dashboard/tests/test_docs_routes.py`: every page/fragment of contracts/http-routes-docs.md renders on `ba_fixture` (200), empty state on a store with no records, unknown key → 404, evidence link hrefs point to `/runs/{run_id}?tab=…#id` (SC-003: requirement page → run page is one link), run `docs` tab lists citing records, `process` tab on trace runs, `?rev=1` shows the older revision; `test_readonly.py` route sweep includes all new GET routes
- [ ] T052 [P] [US2] `apps/dashboard/tests/test_perf.py`: every Docs page < 1 s on a synthetic store with 2 000 records × 3 revisions × 3 links

### Implementation for User Story 2

- [ ] T053 [US2] Read models for the 10 new tables in `apps/dashboard/src/pathfinder_dashboard/models.py` (+ view models `DocPortalSummary`, `DocRecordRow`, `DocRecordDetail`, `ResolvedEvidence`, `SessionDetail`). T048 passes
- [ ] T054 [US2] `apps/dashboard/src/pathfinder_dashboard/queries_docs.py` (pure over a ro connection; evidence resolution by `run_id` + `target_kind` table lookup; keyset pagination as in `queries.py`). T049 passes
- [ ] T055 [P] [US2] TS Mermaid builders `apps/crawler/packages/docs/src/render/mermaid.ts` (process map, screen navigation, capability map) tested against the same goldens in `packages/docs/tests/mermaid.test.ts`; Python twin `apps/dashboard/src/pathfinder_dashboard/diagrams.py`. T050 passes in both apps
- [ ] T056 [FE] [US2] Vendor `mermaid.min.js` (pinned version, URL + sha256 in `static/vendor/README.md`) and `static/js/diagrams.js` (render `pre.mermaid` after htmx swaps; theme from Console tokens; loaded only by Docs templates)
- [ ] T057 [FE] [US2] Nav tab **Docs**; pages `/docs`, `/docs/{portal}` (section index with counts, section list, filters with `push=1`), live fragments; templates in `templates/docs/` and `templates/partials/docs/`; status/confidence/not-observable badges per `revamp-dashboard` conventions (text, not colour alone); routes in `app.py`
- [ ] T058 [FE] [US2] Record page `/docs/{portal}/{key}`: header, rendered content per kind (use case flows, Gherkin blocks, decision tables, verbatim terms with `lang`), diagram, evidence list (links, notes, broken-link state), relations in/out, revision history with `?rev=`, review list (read-only here)
- [ ] T059 [FE] [US2] Session page `/docs/{portal}/sessions/{id}`; run page tabs `docs` and `process` (`/fragments/runs/{run_id}/docs|process`) in `run_detail.html` / `partials/`. T051, T052 pass

**Checkpoint**: Docs readable end to end; still read-only.

---

## Phase 6: User Story 3 — Review drafts: confirm, reject, comment (P2, R-15)

**Goal**: Human review from the Docs tab, written only by the TS `docs:review` command; status
derived by the status engine.

**Independent Test**: quickstart.md R-15 step 3; `test_review.py`; `docs/tests/review.test.ts`.

- [ ] T060 [US3] Amend `.specify/memory/constitution.md` to 1.4.0 per research §2 (Python tooling bullet: dashboard may record review decisions only by invoking the TS review command, its process opens the store read-only; Principle VI: review decisions are records and status is derived from them by deterministic code); update Sync Impact Report and Last Amended; update plan.md Constitution Check rows from **Amend** to Pass
- [ ] T061 [P] [US3] Failing tests `apps/crawler/packages/docs/tests/review.test.ts` for `applyReview(db, input)`: Zod input (`portal_id, key, rev_no, action, text?, reviewer`); confirm/reject only latest `draft` else `STALE_REVISION` (details latest rev + status); reject/comment need `text`; one transaction (review row + status engine + denormalised record); `cancelFollowup` → `cancelled`; result shape of contracts/operator-cli.md
- [ ] T062 [US3] Implement `apps/crawler/packages/docs/src/review.ts` and thin `apps/crawler/scripts/docs-review.ts` + `"docs:review"` script (stdin JSON or flags, one JSON line on stdout, exit 0/2/1). T061 passes
- [ ] T063 [P] [US3] Failing tests `apps/dashboard/tests/test_review.py`: POST without `PATHFINDER_REVIEWER` → 403; foreign `Origin` → 403; confirm on the latest draft → 200, panel + header fragments show `confirmed` (runs the real `docs:review` against the fixture store; marked `integration`, skipped with a reason when `pnpm` is absent); stale → 409 inline message; reject without text → 422; the store diff after POST is exactly the reported review + status rows; GET routes still leave the hash unchanged
- [ ] T064 [US3] `apps/dashboard/src/pathfinder_dashboard/settings.py` (+ `reviewer: str | None`, `crawler_dir` default `<repo>/apps/crawler`) and `review.py` (subprocess `pnpm --dir <crawler_dir> docs:review --env <env>` with JSON on stdin, 10 s timeout, map exit codes/errors to HTTP 200/409/422/500; never opens a writable connection)
- [ ] T065 [FE] [US3] Review panel on the record page: confirm / reject (reason required) / comment forms for the latest revision, disabled with a hint when reviewer unset; `POST /docs/{portal}/{key}/reviews` in `app.py` with the same-origin guard, returning panel + header via htmx OOB swap; inline refusal messages. T063 passes
- [ ] T066 [US3] Extend `apps/crawler/packages/mcp-server/tests/ba-e2e.test.ts`: after `applyReview(reject)` the next session's `get_pending_feedback` returns it, the BA revises with `responds_to_review`, the new revision is `draft` and the confirmed baseline stays visible (US3 scenario 2)
- [ ] T067 [US3] Manual validation quickstart.md R-15 steps 1–3 in a browser (two tabs for the stale case); note in `roadmap.md`

**Checkpoint**: R-15 closable.

---

## Phase 7: User Story 5 — Export the SRS (P3, R-16)

**Goal**: Deterministic Markdown + Mermaid + `records.json` export per contracts/srs-export.md.

**Independent Test**: quickstart.md R-16.

- [ ] T068 [P] [US5] Golden export `apps/crawler/packages/docs/tests/golden/mock-insurer-all/` and `…-confirmed/` from the fixture store (extended with a confirmed REQ and review); failing tests `packages/docs/tests/export.test.ts`: files equal goldens; `--confirmed-only` contains no `DRAFT` callout and only confirmed revisions; two renders byte-identical; every key and evidence id in Markdown exists in `records.json` and the store; no evidence file content or request bodies copied (FR-054)
- [ ] T069 [US5] `apps/crawler/packages/docs/src/render/chapters/*.ts` (README, 01–11 per contracts/srs-export.md; statement header line and evidence line formats; Gherkin blocks; decision tables; Mermaid from `render/mermaid.ts`)
- [ ] T070 [P] [US5] `apps/crawler/packages/docs/src/render/traceability.ts` (REQ/BR/UC → related records → evidence → run) and `render/records-json.ts` (canonical JSON: sorted keys, records by key, revisions by number, LF)
- [ ] T071 [US5] `apps/crawler/packages/docs/src/export.ts` (`exportSrs(db, portal, {confirmedOnly})` → file map; "as of" = newest revision/review time) and thin `apps/crawler/scripts/docs-export.ts` + `"docs:export"` script (default out `data/exports/<portal>-<env>-srs/`, replaced; `portal_data_log` row `export`; exit 1 when the portal has no records). T068 passes
- [ ] T072 [US5] Manual validation quickstart.md R-16: export twice + `diff -r`; read the mock-insurer export against SC-008 and note gaps as follow-up items in `roadmap.md`

---

## Phase 8: Polish & Cross-Cutting (R-16)

- [ ] T073 [P] Docs: `apps/dashboard/README.md` (Docs tab, `PATHFINDER_REVIEWER`, review write path), `data/README.md` (Layer B tables, exports), root `README.md` (crawl → BA → review → export flow, agents `crawler`/`ba`)
- [ ] T074 Full gates: `apps/crawler`: `pnpm typecheck && pnpm lint && pnpm test`; `apps/dashboard`: `uv run pytest && uv run ruff check . && uv run ruff format --check .`; `pnpm docs:audit` on every fixture store; fix all failures
- [ ] T075 Run skill `speckit-analyze` over spec/plan/tasks; resolve findings; mark roadmap R-13…R-16 task ranges final

---

## Dependencies & Execution Order

- **Setup (T001–T002) → Foundational (T003–T013)** block everything.
- **US1 (T014–T028)** needs Foundational. MVP.
- **US4 (T029–T046)** needs US1 for follow-ups and BA process tools (T043–T045); T029–T041 need only Foundational.
- **US2 (T047–T059)** needs Foundational + US1 records; process views need T033 (US4 migration) — if US2 is pulled before US4, gate the `process` tab/target kinds behind table existence.
- **US3 (T060–T067)** needs US2 record page (T058).
- **US5 (T068–T072)** needs US1; process chapters need US4; Mermaid builders from T055.
- **Polish (T073–T075)** last.

Within a block: tests → models/schemas → services → tools/routes → UI → manual validation.

## Parallel Examples

- Foundational: T004 ∥ T005 ∥ T006 ∥ T009 ∥ T010 (different files) after T003.
- US1 tests: T014 ∥ T015 ∥ T016 ∥ T017; then T021 ∥ (T019 → T020).
- US4 tests: T029 ∥ T030 ∥ T031 ∥ T032; T037 ∥ T035; T043 ∥ T044.
- US2 tests: T047 ∥ T049 ∥ T050 ∥ T051 ∥ T052; T055 ∥ T053.
- US5: T068 ∥ T070.

## Implementation Strategy

1. **MVP = R-13** (T001–T028): BA documents mock-insurer map evidence; audit proves traceability.
   Close R-13 with `po`.
2. **R-14** (T029–T046): trace mode; BA gains processes and use cases.
3. **R-15** (T047–T067): read the docs, then review them (constitution 1.4.0 lands with T060, before
   the POST route).
4. **R-16** (T068–T075): export and polish.

Each item ends with its manual validation task and a `po` close (CHANGELOG entry, merge).
