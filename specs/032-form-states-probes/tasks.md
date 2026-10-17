# Tasks 032: Every state of a form (R-69 (1)–(3))

Model tags per the owner's split: `[opus]` judgment and subtle code, `[sonnet]` mechanical code,
`[haiku]` very mechanical. In this overnight run Claude does every task itself (owner, 2026-10-16:
"continue working through night"). Schema tasks go to the db-admin agent (G-16).

## Phase 0: setup and spike

- [x] T001 [opus] Spike: SC-19 scar (`apps/scar-maker/src/scars/sc19-*.ts`, `scars.yaml`) and a throwaway scripted run; write `research.md` and the first `findings.md` entries
- [x] T002 [haiku] Refresh `.claude/skills/mudpuppy-salvage-ui` from the package's `skill/mudpuppy-salvage-ui` (FR-013); the repo's own DS_PATH line kept

## Phase 1: schema and config (US1–US3 foundation)

- [x] T003 [sonnet] db-admin: migration 0022 `form_steps` + `states.form_step_id`, `states.state_kind`; Zod rows (core `schemas/probe.ts`); schema.sql; dashboard read models
- [x] T004 [sonnet] db-admin: migration 0023 `probe_outcomes`, `probe_suites`; Zod rows; schema.sql; portal export/delete
- [x] T005 [sonnet] config: `probes` budget (`probe-budget.ts`), persona `test_data` merged into `trace_inputs`, `TraceVariant.fault` + `expect` `technical_error`/`branch`; tests

## Phase 2: US1 form steps (P1)

- [x] T006 [opus] fingerprint: `invalid` and `shown` on canonical nodes (level 1 unchanged), `formControls`, `errorSignals`, `FormStepIndex` (form name, Jaccard ≥ 0.5, `match` without changes); unit tests
- [x] T007 [opus] mcp-server: form step and state kind in `record_state` (`pipeline/form-step.ts`, the portal's steps loaded on the run's first form); `form_step` event; `form_steps` persisted; pipeline golden updated (only the new events)
- [x] T008 [opus] mcp-server: in-run path per state (`RunState.pathTo`, `run-path.ts`) and `returnToState` (`replay.ts`); `reachState` replays on a same-URL step (F-01)
- [x] T009 [opus] gate SC-19 form steps (`scars-form-steps.test.ts`)

## Phase 3: US2 probes (P1)

- [x] T010 [opus] package `@pathfinder/probes`: `defineProbe`, the catalogue, `planTries` (round-robin within the budget); unit tests; CLAUDE.md; layers.json
- [x] T011 [opus] probes: `classifyOutcome`; unit tests
- [x] T012 [opus] mcp-server: `probe.ts` (press: back to the step, happy values + try, revealed fields filled, fault armed, native messages, `processPage`, classify, `probe_outcomes`), `fault.ts`, `probe-steps.ts`
- [x] T013 [opus] mcp-server: `probe_form` tool (`tools/index.ts`, `pipeline/probe-form.ts` like `act`: browser tools live in the runtime, G-12), budget, limit ≥ mutating (O-M1), one-time code → blocked (O-M2), `missing_test_data`, 40 s per call with `more` (F-11); allowlists; crawler agent definition; chat fence
- [x] T014 [opus] gates SC-19 probes, missing test data, read-only limit (`scars-probes.test.ts`); scars.yaml status gate

## Phase 4: US3 owner-reviewed suite (P2)

- [x] T015 [sonnet] `act` `fault` input (trace runs only, `withFault`), the trace driver passes a variant's fault on its last step
- [x] T016 [opus] BA: `get_run_evidence` kind `probe_outcomes` and form step fields on states; `propose_probe_suite` (steps built from the outcomes, stored `open`)
- [x] T017 [sonnet] chat service: `probe-suites.ts` + `api-probe-suites.ts` (approve with kept variants and changed expectations, `traces.yaml` written with comments kept; dismiss); tests
- [x] T018 [sonnet] dashboard: Review kind "Probe suites to approve" (`queries_suites.py`, `partials/review_suite.html`, `POST /review/suites/…` through the chat service); route tests
- [x] T019 [opus] gate SC-19 suite (`scars-probe-suite.test.ts`): not in `traces.yaml` before approval; driven twice, the same landing per variant

## Phase 5: US4 documentation (P2)

- [x] T020 [sonnet] ba-practice skill ("Form steps and probe outcomes") + BA agent definition (tool, procedure step)
- [x] T021 [sonnet] dashboard: screen page "States of this step" (`partials/state_form_step.html`)
- [x] T022 [sonnet] chat: `save_test_data` (merges into an existing persona; `save_persona` never overwrites) and the orchestrator's guidance for `missing_test_data`

## Phase 6: close-out

- [x] T023 [haiku] docs: package CLAUDE.md files, `docs/portal-config.md`, `docs/how-to-use.md`, contracts (`contracts/probe-tools.md` + pointers), trace vocabulary, glossary + `pathfinder-glossary --write`
- [x] T024 [opus] full test pass (`pnpm test` in apps/crawler, every app), code-reviewer agent, fix or defer findings
## Phase 7: US5 probing only when asked (owner answer 3, 2026-10-17)

- [x] T026 [sonnet] db-admin: migration 0024 `marks` (design entity `mark`; kinds of the design, only `probe` written now; one open mark per target and kind); Zod row; schema.sql; portal export/delete; dashboard read model
- [x] T027 [opus] mcp-server: `start_run` `probe_marked` (map only; refused without marks; the run's marks in its result), `probe_form` refused outside a probe run (`PROBE_NOT_ASKED`) and on an unmarked step (`STEP_NOT_MARKED`), a finished step uses its mark, `finish_run` of a probe run does not drain the frontier; unit tests
- [x] T028 [sonnet] chat service: `POST`/`DELETE /portals/{p}/marks`; `request_scan` `probe_marked` with its crawler brief; orchestrator guidance; tests
- [x] T029 [sonnet] dashboard: screen page "Mark for probing" / "Remove the mark" (through the chat service), Probe tag and coverage on the step plate and in the Screens list; tests
- [x] T030 [opus] crawler agent: map mode never probes; "Probe forms" section; gates SC-19 updated (marks, probe runs, `PROBE_NOT_ASKED`, `STEP_NOT_MARKED`)
- [x] T031 [haiku] docs: contracts/probe-tools.md, docs/how-to-use.md, docs/portal-config.md, glossary (Probe mark, Probe scan)

- [x] T025 [haiku] roadmap R-69 row, spec status, findings, session dump with open owner questions; changelog only when merging (after the owner's answers)
