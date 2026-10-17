# Tasks: Map from a known screen, export, documentation that grows, navigation (spec 034)

Branch `feature/034-known-screen-export-navigation`. Model tags per the owner's rule (`[opus]`
design-heavy, `[sonnet]` pattern work, `[haiku]` docs and small edits). Owner away: Claude does
every task (memory "autonomous overnight work").

## Phase 1: setup

- [x] T001 [haiku] commit the other session's roadmap rows and findings on master, branch, merge the spec 027 draft
- [x] T002 [opus] spec, plan, tasks, findings

## Phase 2: R-68 mocks (US4, first by D-2)

- [x] T003 [opus] mock process folder (`mocks/demo-insurer/travel-quote/`: README, PROCESS_STEPS, BUSINESS_REQUIREMENTS, FUNCTIONAL_REQUIREMENTS, GAPS, EARS, CONTRACTS, openapi.yaml, images/, process.json) shaped by what the store records; made-up data
- [x] T004 [sonnet] mock portal folder (`mocks/demo-insurer/`: README with the process index, GLOSSARY, APIS, SCREENS, two placeholder process folders)
- [x] T005 [sonnet] rating page (artifact https://claude.ai/artifact/BGWFoV1P2oX399QdWZXdUL: Keep / Change / Drop + note per section, saved; copy as text)

## Phase 3: R-71 navigation (US8)

- [x] T006 [sonnet] `pager.py` (25 per page, offset, total, links keep the query) + tests
- [x] T007 [sonnet] pager on Screens (filter over every screen), scan history, Review group tabs, Processes; keyset lists (records, actions, frontier, runs, decisions) at 25. Not paged: a scan's States tab and the "In no process" picker (its ticks span the list)
- [x] T008 [sonnet] Prev / Next on screen, record and Review items (`list=`); tests
- [x] T009 [sonnet] store picker in the header, stores filtered by portal, portal switch picks a store; tests; ui:check

## Phase 4: R-70 documentation that grows (US7)

- [x] T010 [opus] regression guard in `revise_record` (`dropped`), error-only process guard on create/revise; unit tests; BA text
- [x] T011 [opus] run grouping: shared JSON fixture; `services/ba/run-groups.ts`; `queries_run_groups.py`; tests on the fixture
- [x] T012 [sonnet] BA tool `open_process_update` (G-14, allowlist, `ba` agent); tests
- [x] T013 [sonnet] dashboard Scans ▸ By process; route test; ui:check
- [x] T014 [haiku] BA guidance (`ba.md`, `ba-practice`): update mode first, guard, grouping

## Phase 5: R-66 map from a known screen (US1–US3)

- [x] T015 [sonnet] db-admin: migration 0027 `checkpoints`, runs `run_type`/`parent_run_id`/`plan_json`, network_calls `req_sample`/`res_sample`; Zod, store types, read models, schema.sql
- [x] T016 [opus] record checkpoints from `navigate`/`act` bookkeeping; recipe resolver (direct visit, checkpoint, rebuilt from visits); tests
- [x] T017 [opus] `go_to_state` tool: replay through the gates, record pages without queuing, per-step screen check, queue the target at depth 0; e2e test on the mock portal
- [x] T018 [opus] `start_run` run types and plan: continue (parent's pending states, parent's done actions left out), focused (depth from start), recheck, retry (one action, variation); Skip marks; tests
- [x] T019 [sonnet] chat: marks of all kinds, `request_scan` run types and plan, crawler briefs per type; tests
- [x] T020 [sonnet] map inspector marks, Next scan plan link, Plan next scan page (14), stopped-scan recovery (15) with attempts; route tests; ui:check
- [ ] T021 [sonnet] gate cases on the proving ground / scar-maker (replay to a deep state, divergence, resume after a form stop). Not done: `replay.e2e.test.ts` covers the three on the mock portal; a scar for a data-dependent result page (F-05) is the gate to add

## Phase 6: R-68 export (US5, US6)

- [x] T022 [sonnet] `ears` on requirement, rule and NFR content; record-kind text; BA guidance
- [x] T023 [opus] sample bodies in the network recorder (on by run outside production, masked with `pii_scrub`, 4 KB)
- [x] T024 [opus] shared process step resolver (PROC evidence and workspace processes); tests
- [x] T025 [opus] process export generator per D-7; portal export; CLI; byte-identical test. The final layout waits for the owner's rating
- [x] T026 [sonnet] dashboard process tabs + zip download (Docs PROC page, Processes page); route tests
- [x] T027 [sonnet] export grader in the eval (`export-completeness.ts`)

## Phase 7: live checks and close-out (stop before merge, D-3)

- [x] T028 [opus] live runs on the reference portal: focused scan by replay (F-05, F-06 fixed), BA update mode (F-08 fixed); findings. Not run live: a resume after a stop and a retry (covered by the e2e test)
- [x] T029 [sonnet] agent notes (CLAUDE.md per package), docs/how-to-use.md, glossary entries
- [x] T030 [opus] code-reviewer on the branch: 16 findings, 7 small fixed, 9 large deferred (file splits; table in findings.md "Close-out review")
- [x] T031 [haiku] roadmap rows, session dump, push the branch

## Phase 8: owner review of the first real export (`user_input/outputing_decent_docs/review.md`, 2026-10-17)

- [x] T032 [opus] (a) a page is one step: cited states of a walked page fold into it, recordings of the same form one row, a differing form a variant (4a/4b) with the actions that lead to it (`step-states.ts`); a blank page never names a step (F-10, F-11)
- [x] T033 [opus] (a) reference portal: "OC + Autocasco (AC)" adds a required "Wartość pojazdu (zł)" box and asks `/api/wartosc-pojazdu`; ground truth F03.4, R20 and the P01 variant; grader `process_variants` (the BA reconciled it as one step) and `export_steps_distinct`
- [x] T034 [opus] (b) validation per step from the probes: field, input tried, exact message, how it shows; a picture with each message in a band opened under its field
- [x] T035 [sonnet] (c) every field and button or link tagged on each happy-path screenshot, with an element table (where each action led)
- [x] T036 [sonnet] (d) reference portal noise: an icon sprite and an analytics ping by fetch on every page
- [x] T037 [opus] live on the reference portal: a trace choosing AC (goal reached, 4b recorded, reached by "OC + Autocasco (AC)"), BA update of PROC-001 with a neutral request (it documented 4b as a variant of the options step, UC-001 alternate flow, BR-021..BR-023, DI-029; `process_variants` 1/1, `export_steps_distinct` 100 %); the fields table marks a field only some variants show; export regenerated for the owner's re-review. Not run: probes of the 4b box (its messages show once a probe scan covers it)

## Phase 9: an eval of the export's quality (the owner, 2026-10-17: "make it a ground truth for this eval … to check the quality of our exports")

Owner answers: the eval also probes the calculator and traces P01 choosing AC; facts in the ground truth plus the approved export kept as the reference solution; this branch.

- [x] T038 [haiku] the approved export kept byte for byte (`evals/reference-solutions/`); roadmap R-73 for the crawler and export problems (F-11..F-16)
- [x] T039 [opus] ground truth: native messages per field, the forward action of each P01 step, the calls of each step, the portal's noise calls (both schemas); self-checks tie each to the served pages (messages follow from the constraints, actions and calls are on their pages, noise on every page). Left out until seen: the date limits' messages
- [x] T040 [opus] grader `export-quality.ts` over `process.json`: steps in order and extra steps, fields, validation messages, actions, calls, noise leaked; test: the reference solution scores as pinned (steps 100, fields 92.9, validation 58.3, actions 100, calls 100; 1 extra step, 3 stray destinations), a copy with the flaws put right scores 100 everywhere (F-17 logged)
- [x] T041 [sonnet] eval: after the map, probe marks on the task's form routes and a probe scan (`--no-probe-scan`); the P01 trace chooses AC; the BA map session covers the probe run; `runs.probe_scan`, `outcomes.probe_scan`, condition `probe_scan`; README, glossary `export-quality-score`
- [x] T042 [opus] a live trial on the reference portal (`data/evals/reference-insurer/2026-10-17T20-12-16-690Z.json`, not promoted): the probe scan marked 3 form steps and ran; P01 chose AC, `process_variants` 1/1; export quality as the approved export (steps 100, fields 92.9, validation 58.3, actions 100, calls 100; extra steps 0, stray destinations 3, noise leaked 0). BA side regressed: F-20 (traces session stops on ungrouped runs, from R-70), F-21 (map session thinner)

## Phase 10: the BA side of the eval (owner decisions 2026-10-17 on F-20, F-21) and the merge blockers

- [x] T043 [opus] F-18: the map e2e test expects sample bodies as they came (no masking outside production unless the portal asks, standing owner rule); F-19: the golden test leaves out slow `limiter_wait` spans (machine load, not the pipeline)
- [x] T044 [opus] F-20: the harness groups each trace run as a workspace process (`harness/group-traces.ts`, as accepting a grouping does) between the two BA sessions; the traces prompt names the grouped processes and asks for an update (`open_process_update`, revise or write)
- [x] T045 [opus] F-21: cause found in the transcript (the session completed all passes; 14 of 19 data items named by the field's technical name, so the label match found 5 of 27); `create_record` refuses a data item named by a cited form field's technical name, naming its label
- [x] T046 [opus] trials with and without the probe scan to confirm F-20 and F-21 (four trials, findings F-20/F-21); `pnpm eval:transcript`; the data pass also checks page-defined glossary terms; trial 4 (`2026-10-17T23-12-13-807Z`, probe scan) promoted as the baseline, no regression
