---

description: "Task list for Crawl Run Observability Trace (R-17)"
---

# Tasks: Crawl Run Observability Trace

**Input**: Design documents from `specs/005-crawl-run-observability-trace/`

**Prerequisites**: plan.md, spec.md, research.md (§0–§16), data-model.md, contracts/ (trace-spans,
agent-import, tool-rationale, dashboard-routes), quickstart.md; constitution
`.specify/memory/constitution.md`.

**Tests**: required (constitution VII). Test tasks come first in each block and MUST fail before the
implementation task that follows.

**Organization**: by user story (spec.md): US1 replay (P1), US2 safety proof (P1), US3 agent side
(P2), US4 diagnose mapping/page (P2), US5 long-run summary (P3).

## Format: `[ID] [P?] [Story] [model] Description`

- **[P]**: parallelisable (different files, no dependency on an incomplete task)
- **[Story]**: US1–US5
- **[opus] / [sonnet]**: suggested model — judgment-heavy vs mechanical
- **[DB]**: schema/migration — `db-admin` subagent, skill `sqlite-conventions`
- **[FE]**: dashboard UI — `frontend-dev` subagent, skill `revamp-dashboard`
- **[AG]**: agent definition — skill `subagent-authoring`, then its linter

## Path Conventions

TS: `apps/crawler/packages/<pkg>/{src,tests}`, scripts `apps/crawler/scripts/` (thin; logic in a
package). Dashboard: `apps/dashboard/src/pathfinder_dashboard/`, tests `apps/dashboard/tests/`.
Migrations `data/migrations/`. Verification before every commit: `pnpm typecheck && pnpm lint &&
pnpm test` in `apps/crawler`, `uv run ruff check && uv run pytest` in `apps/dashboard`.

---

## Phase 1: Setup

- [X] T001 [sonnet] Add `data/traces/*` and `!data/traces/.gitkeep` to `.gitignore` (next to the `data/evidence/*` lines, comment: unscrubbed Playwright traces, research §13); create `data/traces/.gitkeep`; add a `data/traces/` paragraph to `data/README.md`
- [X] T002 [P] [sonnet] Extend `apps/crawler/packages/mcp-server/tests/mock-portal.ts`: a page `/polling` whose script fetches `/api/poll` every 200 ms forever (never settles), and a page `/with-disallowed-asset` that requests `/admin/pixel.gif` twice (robots `Disallow: /admin/`), both linked from the home page only when `MOCK_TRACE_PAGES` option is set, so existing `map-run.test.ts` expectations are unchanged

---

## Phase 2: Foundational (blocks every story)

- [X] T003 [DB] [sonnet] Migration `data/migrations/0003_trace.{up,down}.sql` exactly per data-model.md: STRICT `trace_boots` (`server` CHECK IN (`pathfinder`); `trace_level` CHECK IN (`off`,`standard`,`verbose`); `pw_trace` CHECK IN (`non_production`,`all`)); `trace_spans` (`kind` CHECK IN (`call`,`phase`,`event`); `status` CHECK IN (`running`,`ok`,`refused`,`stopped`,`error`,`unfinished`); `duration_ms` CHECK ≥ 0 and required when `kind IN ('call','phase') AND status NOT IN ('running','unfinished')`; `attrs_json` NOT NULL DEFAULT `'{}'` with `json_valid` and `json_type = 'object'`; `rationale` CHECK length ≤ 300; `between_calls` 0/1; FKs `boot_id`→`trace_boots`, `run_id`→`runs`, `parent_id`→`trace_spans`, `decision_id`→`decision_log`; UNIQUE(`boot_id`,`seq`); indexes `ix_trace_spans_run(run_id, parent_id, boot_id, seq)`, `ix_trace_spans_tool_use(tool_use_id)`, `ix_trace_spans_decision(decision_id)`); `agent_turns` (`role` CHECK IN (`assistant`,`user`); `kind` CHECK IN (`text`,`thinking`,`tool_use`,`tool_result`); `is_error`, `matched` 0/1; `api_message_id` TEXT; UNIQUE(`agent_id`,`message_uuid`,`block_index`); indexes `ix_agent_turns_run(run_id, created_at)`, `ix_agent_turns_tool_use(tool_use_id)`). Down drops in reverse FK order. Regenerate `data/schema/schema.sql`; add a "Trace" section to `data/schema/README.md` (span model, ordering by boot + seq, run-less spans, link to decision_log). Up/down/up round-trip in `packages/core/tests/db.test.ts`
- [X] T004 [P] [sonnet] Zod `packages/core/src/schemas/trace-boot.ts`, `trace-span.ts` (`SpanKind`, `SpanStatus`, `TraceSpan` with the data-model refinements), `agent-turn.ts`; export from `schemas/index.ts`; add the three tables to `db-types.ts`
- [X] T005 [P] [sonnet] Schema tests in `packages/core/tests/schemas.test.ts`: valid + two invalid samples per schema; Zod enums equal the `0003_trace` CHECK lists (parse `schema.sql`, existing approach)
- [X] T006 [P] [opus] Failing tests `packages/core/tests/trace-url-shape.test.ts`, then `packages/core/src/trace/url-shape.ts`: `shapeUrl(url, templateFor?) → {origin, route, query_keys}` — values dropped, keys sorted, fragment dropped, unparseable URL → `{origin: null, route: '<unparseable>', query_keys: []}`, `templateFor` throwing falls back to pathname
- [X] T007 [P] [opus] Failing tests `packages/core/tests/trace-limits.test.ts` and `trace-scrub.test.ts`, then `packages/core/src/trace/scrub.ts` (`scrubTraceJson`/`scrubTraceText`, id-preserving, research §7; `isSensitiveKey` exported from `pii.ts`) and `packages/core/src/trace/limits.ts`: `fitPayload(value, {inlineBytes = 8192, store})` scrubs (`scrubTraceJson`), returns `{inline, payload_ref?, truncated}`; over the cap stores the full scrubbed JSON via `EvidenceStore.storeJson(value, scrubTraceJson)` (new optional scrubber argument) and returns a structural preview (top-level keys, arrays cut to 5 items, strings to 200 chars) that is itself ≤ cap; `fitText(text, 4096)` masks then cuts
- [X] T008 [opus] Failing tests `packages/core/tests/tracer.test.ts` per contracts/trace-spans.md "Rules": `start` writes a `trace_boots` row; `call` inserts `running` at start and final row + children in one transaction at end; status mapping (`ACTION_REFUSED`→`refused`, `RUN_STOPPED`→`stopped`, other throw→`error`) and an `event error` per throw, original error rethrown; nested `phase`/`event` get correct `parent_id` through `AsyncLocalStorage` across `await`s; `eventForRun` attaches to the run's most recently started open browser call, else `between_calls = 1`; two overlapping browser calls of one run → `concurrent_calls` on both and `overlapping_calls` on events attached meanwhile (research §3); `seq` strictly increasing per boot; `sweepUnfinished` marks earlier boots' `running` as `unfinished`; a broken table (dropped mid-test) → no throw, `health(run).dropped` > 0; level `off` writes only calls; scrubbing applied to attrs, summary, rationale; injected `now`/`monotonic`/`newId` make two identical sequences produce identical rows
- [X] T009 [opus] Implement `packages/core/src/trace/tracer.ts` (+ export from `packages/core/src/index.ts`). T008 passes
- [X] T010 [opus] Failing test then `linkDecisions(decisions, tracer)` in `packages/core/src/log.ts`: after `record()` emits `event decision` (`decision_id`, `kind`, `rule`) under the current span, or via `eventForRun(input.run_id, …)` outside a call; `record()` result and `decision_log` row unchanged
- [X] T011 [P] [sonnet] Portal partition in `packages/core/src/portal-data.ts`: add `trace_spans`, `agent_turns` to `PORTAL_TABLES` (via `run_id`), delete before `decision_log` and `runs`; `trace_spans` deleted events → phases → calls (or `parent_id` nulled first, same transaction); run-less spans and `trace_boots` untouched; `deletePortal` removes `data/traces/<portal>/`, `exportPortal` excludes it. Extend `packages/core/tests/portal-data.test.ts`
- [X] T012 [P] [sonnet] PII audit in `packages/core/src/audit.ts`: add `trace_spans: ['summary', 'rationale', 'attrs_json']`, `agent_turns: ['text']`; extend its test with a planted `[email]`-corpus value in each
- [X] T013 [opus] Wire the tracer into the server: `ServerContext.tracer` in `packages/mcp-server/src/context.ts`; in `server.ts` create it (level from `PATHFINDER_TRACE_LEVEL`, default `standard`; `pw_trace` = `all` when `PATHFINDER_PW_TRACE=1`), `start()` the boot (version from package.json), `sweepUnfinished()` beside `interruptStaleRuns`, wrap `ctx.decisions` with `linkDecisions`, `shutdown()` in the SIGINT/SIGTERM handler before `opened.close()`; update `packages/mcp-server/tests/harness.ts` to build the same context with injectable clock/ids

**Checkpoint**: tracer tested in isolation; server boots with it; nothing instrumented yet.

---

## Phase 3: User Story 1 — Replay a run step by step (P1) — MVP

**Goal**: every tool call with rationale, I/O, status, duration and a phase breakdown, viewable in
the dashboard. **Independent test**: quickstart scenarios 1, 2, 4.

- [X] T014 [P] [US1] [opus] Failing tests `packages/mcp-server/tests/trace-calls.test.ts` (fake runtime, no browser): each of the 8 tools → exactly one `call` span; `_meta["claudecode/toolUseId"]` and `["claudecode/agentId"]` stored; MCP `requestId` in attrs; outcomes map to statuses; `start_run` refused in preflight → run-less call with `error` event; successful `start_run` → call span `run_id` set once the run row exists; `rationale` stored masked
  - Note: the masked-rationale assertion is an `it.todo` until T015 adds the `rationale` input field (the SDK strips undeclared keys); the wrapper already strips `rationale` from service input and passes it to the tracer.
- [X] T015 [P] [US1] [sonnet] `rationale` per contracts/tool-rationale.md on `navigate`, `act`, `finish_run` in `packages/mcp-server/src/tools/index.ts` (`z.string().trim().min(1).max(300)`, required, passed only to the tracer); add a rationale to every existing test call; extend `agent-lockdown.test.ts` (tool list unchanged; field required on the three tools; service inputs never contain `rationale`)
- [X] T016 [P] [US1] [AG] [sonnet] `.claude/agents/crawler.md`: one procedure line — "Every `navigate`, `act` and `finish_run` carries a one-sentence `rationale`: what you expect this step to reveal, or why you stop." Run `python3 .claude/skills/subagent-authoring/scripts/lint_agent.py .claude/agents/crawler.md --root .`
- [X] T017 [US1] [opus] Instrument the `tool()` factory in `packages/mcp-server/src/tools/index.ts`: run each handler in `ctx.tracer.call({tool, runId: args.run_id ?? null, args, meta: extra._meta, requestId: extra.requestId, rationale})`; `start_run` calls `span.setRunId` when the run exists; `ok()`/`fail()` unchanged for the client. T014 passes
- [X] T018 [P] [US1] [opus] Failing test `packages/mcp-server/tests/trace-map-run.test.ts` (mock portal, `describe.skipIf(!await canLaunchBrowser())`): a scripted run (start_run → navigate home → act ×3 → finish_run); every completed `navigate`/`act` has phases from the contract vocabulary whose durations sum to within 5% of the call; `start_run` has `preflight`, `robots_fetch`, `insert_run`, `open_session`, `restore_index`
- [X] T019 [US1] [opus] Phases: `packages/mcp-server/src/runtime/pipeline.ts` (`begin_step`, `gate`, `reach_state`, `locate`, `click`, `goto`, `settle`, `observe`, `net_drain`, `fingerprint`, `record_state`, `record_forms`, `record_transition`, `record_api_calls`, `enqueue_frontier`, `run_bookkeeping`), `services/start-run.ts` (`preflight`, `resume_check`, `robots_fetch`, `insert_run`), `runtime/browser-runtime.ts` (`open_session`, `restore_index`); `RunState.activeCallSpan` set/cleared by the tool wrapper. T018 phase assertions pass
  - Note: no `RunState.activeCallSpan`; the tracer's AsyncLocalStorage already carries the call, and Playwright callbacks use `eventForRun`. Phases outside a tool call (direct service tests) run untraced (contract updated).
- [X] T020 [US1] [opus] `packages/mcp-server/tests/trace-golden.test.ts` (SC-007): fixed clock/ids, scripted tool sequence on the fake runtime (and a `skipIf` browser variant on the mock portal with durations normalised) → normalised `trace_spans` rows equal a committed snapshot; a second run of the same script is identical
  - Note: the browser variant compares two runs to each other (span tree, durations and timing-dependent request/limiter events left out) rather than a committed snapshot, which would flake on timing; the fake-runtime variant is the committed snapshot `tests/__snapshots__/trace-golden.json`.
- [X] T021 [US1] [opus] `packages/mcp-server/tests/trace-failure.test.ts` (FR-014): with `trace_spans` dropped mid-run the crawl's `runs`/`states`/`edges`/`frontier`/`decision_log` rows equal those of a traced run and `trace_health.dropped` > 0 afterwards; a simulated crash (new server on the same DB) leaves the in-flight call `unfinished`
- [X] T022 [P] [US1] [sonnet] Dashboard read models `TraceBoot`, `TraceSpan`, `AgentTurn` in `apps/dashboard/src/pathfinder_dashboard/models.py`; drift test `apps/dashboard/tests/test_models_schema.py` covers them
- [X] T023 [US1] [sonnet] Queries in `queries.py`: `trace_calls(conn, run_id, tools, statuses, problems, cursor)` ordered by boot `started_at`, `seq`; `span_children(conn, span_id, kinds, names)`; `server_activity(conn, cursor)`; tests in `tests/test_queries.py` against a fixture store built from migrations
- [X] T024 [US1] [FE] [sonnet] Routes and templates per contracts/dashboard-routes.md: `trace` tab, `/fragments/runs/{run_id}/trace`, `/fragments/spans/{span_id}/children` (lazy expand), `/activity`, `/fragments/activity`, empty states; `partials/trace_calls.html`, `trace_children.html`, `activity_rows.html`, `activity.html`; route tests in `tests/test_routes.py`; read-only test still passes

**Checkpoint**: MVP — a run's calls and phases are inspectable end to end.

---

## Phase 4: User Story 2 — Verify safety and compliance decisions (P1)

**Goal**: every gate, robots, limiter and block decision inside its call. **Independent test**:
quickstart scenario 3.

- [X] T025 [P] [US2] [opus] Failing tests in `packages/crawler/tests/request-gate.test.ts`: `onRequestDecision` fires once per routed request with `decision` `continue`/`abort`/`fulfill`, `reason`, `robotsRule`, `limiterWaitMs`, redirect target; `onRobotsCheck` fires on every occurrence (the existing `onNote` dedupe unchanged); `onBlockVerdict` fires on a block; all existing assertions unchanged
- [X] T026 [US2] [opus] Implement the callbacks (`onRequestDecision`, `onRobotsCheck`, `onResponse`, `onBlockVerdict`, injectable `now`) in `packages/crawler/src/request-gate.ts` and pass them through `packages/crawler/src/session.ts` (`SessionOptions.observe`). T025 passes
- [X] T027 [US2] [opus] Events in `packages/mcp-server/src/runtime/pipeline.ts` and `browser-runtime.ts`: `gate_decision`, `item_cap`, `locator`, `request` (notable only at `standard`: main frame, abort, redirect, status ≥ 400, failed, limiter wait > 1 s; all at `verbose`), `request_aggregate` per call, `robots_check`, `limiter_wait`, `block_verdict`, `run_stop` — browser callbacks via `eventForRun`. Extend `trace-map-run.test.ts`: `decision_log` count equals `decision` span count (SC-002); `/with-disallowed-asset` yields two `robots_check` events; a refused action shows `gate_decision` with `allowed=false`
  - Note: trace URL shaping uses `RunState.peekRouteTemplate` (never feeds route-template inference, so tracing cannot change recorded templates); tool-call `url` args are shaped too; limiter waits are integer ms (float fractions tripped the PII audit as card/phone numbers). Requests between calls are recorded individually when notable but not aggregated. Stale Playwright async context (from the closed `start_run`) is routed via `eventForRun`.
- [ ] T028 [US2] [FE] [sonnet] Dashboard (the status filter itself shipped with T024): event rendering for `gate_decision`, `robots_check`, `request`, `block_verdict`, `decision` (rule, reason, linked decision id) in `partials/trace_children.html`; route test for `status=refused`

---

## Phase 5: User Story 3 — Understand what the agent was thinking (P2)

**Goal**: agent text, tokens and rationale joined to server calls. **Independent test**: quickstart
scenario 5.

- [X] T029 [P] [US3] [opus] Fixture `packages/core/tests/fixtures/crawler-transcript.jsonl`: trimmed from a real crawler transcript shape (one entry per content block with `apiBlockIndex`, usage repeated per entry with `output_tokens` growing, a message with two `tool_use` blocks, user tool_result incl. `is_error`, meta and attachment entries), all values synthetic and obviously fake. Failing tests `packages/core/tests/trace-transcript.test.ts` per contracts/agent-import.md "Parsing"
- [X] T030 [US3] [opus] Implement `packages/core/src/trace/transcript.ts` (`parseTranscript`, pure; masks text, scrubs tool inputs/results, tokens on block 0 only). T029 passes
- [X] T031 [P] [US3] [opus] Failing tests then `packages/core/src/trace/join.ts` (`joinTurns`, pure) per contracts/agent-import.md "Join": exact tool-use match, run assignment (following, else preceding), `unmatchedAgentCalls` for `mcp__pathfinder__*` only, `unmatchedServerCalls` scoped to the agent id
- [X] T032 [US3] [sonnet] `packages/core/src/trace/import-agent.ts` (`importAgent({transcriptPath | agentId, dataDir})`: reads the file, finds stores whose `trace_spans.tool_use_id` match, upserts on (`agent_id`,`message_uuid`,`block_index`), sets `matched`) + thin `apps/crawler/scripts/trace-import-agent.ts` (`--hook` stdin, `--transcript`, `--agent-id`, `--data-dir`; `--hook` always exits 0) + `"trace:import-agent"` in `apps/crawler/package.json`; idempotency test (import twice → identical rows)
- [ ] T033 [US3] [sonnet] Create the committed `.claude/settings.json` (none exists; `settings.local.json` is gitignored and stays as is) with the `SubagentStop` hook (matcher `crawler`, command `pnpm --silent --dir apps/crawler trace:import-agent --hook`); the `po` agent's frontmatter hook is unaffected
- [ ] T034 [US3] [FE] [sonnet] Dashboard: preceding agent text, tokens and "agent-stated" rationale on call rows; "never reached server" rows; "not imported" state with the CLI command; queries `agent_turns_for_run`; tests

---

## Phase 6: User Story 4 — Diagnose mapping and page behaviour (P2)

**Goal**: fingerprint, frontier and settle diagnostics; per-call browser traces. **Independent
test**: quickstart scenarios 6, 7.

- [X] T035 [P] [US4] [opus] Failing tests `packages/crawler/tests/stabilizer.test.ts`: `trackNetworkActivity` keeps in-flight requests (url, resource type, start); `settleWithDiagnostics` on timeout returns them with ages, `sinceMutationMs`, `runningAnimations`; `settle()` result unchanged for existing callers
- [X] T036 [US4] [opus] Implement in `packages/crawler/src/stabilizer.ts` (`inFlightRequests()`, `onRequestFailed`, `settleWithDiagnostics` → `{result, waitedMs, diagnostics?}`); `BrowserSession.settleTraced()` returns the outcome plus obstacles dismissed by both sweeps, `settle()` delegates; `SessionOptions.observe.onRequestFailed`. T035 passes
- [X] T037 [US4] [opus] `pipeline.ts` switches to `session.settleTraced()` and emits `stabilization_timeout` (URLs shaped; `/polling` in `trace-map-run.test.ts` yields the event naming `/api/poll`) and `request` events with `failed` from `onRequestFailed`. Events `fingerprint_assign` (level1, decision, cluster, matched, similarity, threshold; no level2), `state_recorded`, `frontier_enqueue`/`frontier_skip` (pipeline `enqueueActions` results), `frontier_pick` (`services/frontier.ts` `getNextFrontierItem`, incl. pending count and `empty`/`budget_exhausted`), `run_status`; assertions in `trace-map-run.test.ts`
  - Note: `enqueueActions` now also returns `enqueued` ids (additive); the mock `/polling` page uses overlapping slow polls (100 ms interval, 250 ms response) so it truly never settles under the 150 ms idle window. Obstacles from `settleTraced()` are left to T039.
- [X] T038 [US4] [opus] `packages/mcp-server/src/runtime/pw-trace.ts`: pure `pwTraceEnabled(environment, bootFlag)`; in `openSession` `tracing.start({screenshots: true, snapshots: true})`; per browser-touching call `startChunk({title: "<tool> <span id>"})` / `stopChunk({path})` to `data/traces/<portal>/<run_id>/<seq>-<tool>.zip`, phases wrapped in `tracing.group`; `pw_trace_path` on the call span; failures counted as trace health, never thrown. Unit test for the enable rule; `skipIf` e2e: sandbox run writes one zip per browser call, `environment: production` without the flag writes none
  - Note: chunks cover `navigate`/`act` (start_run opens no page). Chunk start/stop I/O is its own `pw_trace` phase (added to the vocabulary) so SC-003 still holds; the call is found through `tracer.currentCall()`, and failures go to `tracer.countFailure()`. `ServerContext.pwTrace` carries the boot flag.
- [X] T039 [US4] [sonnet] `recordObstacles(tracer, events)` in `packages/mcp-server/src/runtime/obstacles-trace.ts` + fixture test (one `obstacle` event per `ObstacleEvent`); call it from `pipeline.ts` with the entries of `session.obstacles.events` added since the call started, after `settle` and at call end (research §16); mock portal gains an `obstacles` config with a dismissible banner and `trace-map-run.test.ts` asserts the event
- [ ] T040 [US4] [FE] [sonnet] Dashboard (the proportional phase bar shipped with T024): rendering for `fingerprint_assign`, `frontier_*`, `stabilization_timeout`, `obstacle`, and the copyable `npx playwright show-trace data/<path>` block; tests

---

## Phase 7: User Story 5 — Spot problems in a long run (P3)

**Goal**: summary and problems filter at 20 000 spans. **Independent test**: quickstart scenario 8.

- [ ] T041 [US5] [sonnet] `trace_summary(conn, run_id)` in `queries.py` (time per phase sum/p50/p95, counts by kind/status, slowest 5 calls, tokens, health: dropped, truncated, unfinished, unmatched both ways, boot level/flag) + `partials/trace_summary.html` + `problems=1` filter: `queries.trace_calls(problems=True)` already covers errors, refused, stopped, unfinished, stabilization timeouts, > run p95 and concurrent calls (T023) — pass `problems` through `app.trace_calls_values` and add unmatched agent calls (`agent_turns.matched = 0`, needs T032); tests
- [ ] T042 [US5] [sonnet] Perf fixture generator (500 calls / 20 000 spans) in `apps/dashboard/tests/conftest.py` and `tests/test_perf.py`: summary + first page < 1 s (SC-005)
- [X] T043 [US5] [opus] Overhead check in `trace-map-run.test.ts` (SC-008): same scripted run at `off` and `standard`, median step time increase < 10% (skipped under `CI=1` if timing is noisy; result logged)
  - Note: measured on a production-declared mock portal so no Playwright trace is recorded in either run (the span trace alone): median step 434 ms (off) vs 413 ms (standard), -4.8%, i.e. within noise (2026-09-27). Writing it exposed a latent hang in `NetworkRecorder.drain` (a body read that never settles after navigating away from a polling page), fixed in the crawler.

---

## Phase 8: Polish

- [ ] T044 [sonnet] `roadmap.md`: R-17 row → `specs/005-crawl-run-observability-trace` T001–T046, status `in progress`; note that R-13's `0003_ba_documentation` must become `0004` when R-13 resumes
- [X] T045 [opus] Run skill `speckit-analyze` over spec/plan/tasks and fix any inconsistency it reports
- [ ] T046 [sonnet] Manual validation: quickstart scenarios 1–10 on a sandbox portal (browser libraries installed); record results and any gaps in `roadmap.md` notes

---

## Dependencies

- T001–T002 → none. T003 → T004, T005, T011, T012. T004 → T009. T006, T007 → T009. T008 → T009 → T010 → T013.
- US1 needs Phase 2. T014 → T017; T018 → T019; T017, T019 → T020, T021; T022 → T023 → T024.
- US2 needs T019 (phases exist). T025 → T026 → T027 → T028.
- US3 needs T017 (call spans with tool-use ids). T029 → T030; T031; T030, T031 → T032 → T033; T032 → T034.
- US4 needs T019. T035 → T036; T037; T038; T039; T040 after T024.
- US5 needs T024 and T032 (unmatched agent calls). T041 → T042; T043 needs T027.
- Polish last.

## Parallel examples

- Phase 2: T004, T005, T006, T007 together; then T011, T012 beside T008–T010.
- US1: T014, T015, T016, T018, T022 together.
- After US1: US2 (T025…), US3 (T029, T031) and US4 (T035, T037, T038) can proceed in parallel.

## Implementation strategy

1. Phases 1–2, then US1 → MVP: every call with phases in the dashboard.
2. US2 (safety proof), then US3 and US4 in either order, then US5.
3. Commit per completed task group with task ids in the message.

## Model split

`[opus]`: T006–T010, T013, T014, T017–T021, T025–T027, T029–T031, T035–T038, T043, T045 (24).
`[sonnet]`: T001–T005, T011, T012, T015, T016, T022–T024, T028, T032–T034, T039–T042, T044, T046 (22).
