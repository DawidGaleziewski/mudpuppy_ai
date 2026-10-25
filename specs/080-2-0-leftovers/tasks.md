# Tasks: spec 080 (2.0 leftovers and the crawler bundle)

Plan: the BA server checks first (fast tier, no browser), then the replays and the scenario, the
chat tool, the scope check (migration 0053), then the crawler bundle (runtime, slow tier), last
the input sweep. One commit per group; the slow tier before each runtime commit. No paid runs.

## Group A: BA server checks (R-97 (1), (2))

- [X] T001 [opus] `services/ba/process-pass-check.ts`: login-wall screens reached by a body link with no PROC citing them; warning after `processes` and `synthesis` (`sessions.ts`)
- [X] T002 [opus] `rule-pass-check.ts` `hintsOf`: a free hint tied to the control it names (FR-002)
- [X] T003 [sonnet] Unit tests (`tests/process-pass-check.test.ts`, `tests/rule-pass-check.test.ts`); `ba-practice` pass 3 names the warning; LAYOUT.md

## Group B: replays and the overlapping-rule scenario (R-98 (1), (5))

- [X] T004 [opus] `store/src/replay-tests.ts` `journeyPath` / `journeyPosition`: start at the last login landing (FR-004), a visit cut at its place in its journey (F-02) + unit test
- [X] T005 [opus] Reference portal: scenario `overlapping-rule` (FR-005) + `accounts.test.ts`, `scenarios.test.ts`
- [X] T006 [opus] `tests/context-replays.e2e.test.ts`: overlapping-rule → `nondeterministic`

## Group C: batch scans of a sample from the chat (R-98 (4))

- [X] T007 [opus] `apps/chat/src/sample-scans.ts` + tool `request_sample_scans` (`mcp-workflow-tools`), fence/allowlist, orchestrator prompt line
- [X] T008 [sonnet] Unit tests; LAYOUT.md, CLAUDE.md tool list

## Group D: scoped sessions (R-99 (1))

- [X] T009 [opus] Migration 0053 `analysis_sessions.scope_id` (Zod, schema.sql, Kysely type, dashboard model; pinned migration lists)
- [X] T010 [opus] `start_session` `scope_id`; record checks refuse off-scope evidence (`OUT_OF_SCOPE`); chat brief passes the scope id
- [X] T011 [sonnet] Unit tests (`tests/ba-session-scope.test.ts`)

## Group E: the crawler bundle (R-35, R-58, R-80 (2), (4))

- [X] T012 [opus] List cap in `getNextFrontierItem` (FR-009) with portal `scope.max_items_per_template` + unit tests
- [X] T013 [opus] `drain_frontier` tool (FR-010): service, tool shape, crawler agent allowlist and prompt
- [X] T014 [opus] Script-written pop-ups (FR-011): `BrowserSession` reads them before closing; `popups.ts` evidence + `popup_written`
- [X] T015 [opus] Gates and e2e: list cap and drain (`frontier-drain.e2e.test.ts`, mock portal), F-04@080 (LO-27 stays a gap), F-05@080 bank shared button (R-80 (2)); golden updated on purpose (the 6th offer is capped)
- [X] T016 [opus] Scar SC-25 + gate; `date-range` names SC-25 (R-80 (4))
- [X] T017 [opus] Slow tier, commit

## Group F: input sweeps (R-97 (4))

- [X] T018 [opus] `store/src/input-sweeps.ts`: plans; `mcp-server/src/sweep-portal.ts` (band search); `pnpm model:sweep`
- [X] T019 [opus] Rules pass lists unstated band edges (source `sweep`)
- [X] T020 [opus] e2e on the reference portal (engine bands 1400/1401, 2000/2001); eval opt-in `--sweep-inputs`

## Close-out

- [X] T021 [opus] R-99 (5) steps in findings; code review (G-31, by hand: findings § Close-out review); roadmap R-97, R-98, R-99, R-35 and status text of R-33, R-58, R-80; glossary; changelog; merge, tag, push
