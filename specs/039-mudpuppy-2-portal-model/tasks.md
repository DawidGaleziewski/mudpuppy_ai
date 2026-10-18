# Tasks 039 (R-81, MudPuppy 2.0)

Tags: `[opus]` / `[sonnet]` / `[haiku]` per task (`model-split-per-task`). One commit per task
group, ids in the message. Gates per milestone in `plan.md` § 1. `[B: …]` = blocked on.

## M0 Reset and groundwork

- [x] T001 done 2026-10-19: 21 MCP server processes of two Claude Code sessions stopped by PID (owner: "Kill all processes that get in the way")
- [x] T002 [sonnet] `store:reset --confirm` script (plan § 2): refuses while a process holds `data/db` open or a service answers, prints what it deletes, writes `data/RESET-v2.md`; run it; move eval trials and baselines to `history/v1/`. **Built** (`@pathfinder/store` `store-reset.ts`, `scripts/store-reset.ts`, 3 tests; dry run: 1,179 paths, ~1.2 GB, 64 eval files). **Run 2026-10-19** (23579b8): 1,175 paths, 1,236 MB; gate: empty store boots, every suite green
- [x] T003 [opus] Constitution 6.0.0 (design § 18) applied 2026-10-19: owner "Reviewed design.md all seems fine. Proceed." taken as approval of § 18 (morning check)
- [x] T004 [sonnet] `@pathfinder/model` (layer `models`, `MODEL_DEFAULTS`, 3 tests) and `apps/miner` (uv, Python 3.13, scikit-learn, igraph, leidenalg; `pathfinder-miner check`, read-only store opener; ruff, 4 tests) skeletons; done inline, not by the `governor` agent
- [x] T005 [opus] Scenario switchboard in `packages/reference-portal`: `SCENARIOS` (the 14 of design § 19.1 with milestone), `BUILT_SCENARIOS`, `parseScenarios` (`REFERENCE_SCENARIOS`; unknown or unbuilt ids refused, so no gate runs against a missing injection: replaces the planned no-op gate), `StartOptions.scenarios`, `GET /__admin/scenarios`; 4 tests. Ground truth per scenario lands with each scenario
- [-] T006 [haiku] Glossary entries: **moved** to each milestone (an entry lands with its term's code) and T101 (UI words after the UX consultation); the Glossary page describes the product as shipped

## M1 Capture

- [ ] T010 [opus] `db-admin`: 0029 (`builds`, `entity_refs`, `network_calls.schema_hash` / `transition_id`), decide 0037 lands here (plan § 1)
- [ ] T011 [opus] `db-admin`: 0030 `state_components`; 0031 journeys, `page_visits` → `observations`, `observation_builds`, `transitions`, `trace_runs`; drop `edges`, `processes`, `process_steps` and every `edge_id`
- [ ] T012 [opus] `db-admin`: 0032 `attribute_writes`; 0033 `runs.build_flag`
- [ ] T013 [opus] Fingerprint v2: masked names, repeated-sibling collapse, structural signatures, components, MinHash reuse; fixtures; remove v1
- [ ] T014 [opus] Element keys (`@pathfinder/fingerprint`), on every action and in `state_components.element_keys`; fixtures with Polish names
- [ ] T015 [opus] Build signatures and scopes (`observe` step, mount detection), portal hook schema `model:` in `@pathfinder/config`
- [ ] T016 [opus] Step results on observations and transitions (error pages, HTTP ≥ 500, validation, business templates, timeout, blocked)
- [ ] T017 [opus] Journeys: start kinds, child journeys on backtrack, end reasons; `record_transition` writes `transitions`; `record_visit` writes `observations` with seq and context key
- [ ] T018 [opus] Attribute writes: persona at seq 0, inputs on fill/select/check, shown label–value pairs; snapshot function in `@pathfinder/model`
- [ ] T019 [opus] Trace mode on `trace_runs` + transitions (intent, outcomes, boundary); Principle IV promotion on `trace_runs`
- [ ] T020 [sonnet] Every reader of `edges`, `page_visits`, `process_steps` moved to transitions / observations (MCP tools, BA evidence, run graph R-74, export, dashboard read models); `rg` list in findings
- [ ] T021 [opus] Headless probe runs: `runs.mode = 'probe'`, driver on `local-client.ts` + `replay.ts`, prefix cache, checkpoints, budgets, `driver = 'headless'`
- [ ] T022 [sonnet] Pipeline golden test and slow tier updated; gates green
- [ ] T023 [opus] M1 gate (plan § 1) + findings + tag `v2.0.0-m1`

## M2 Model

- [ ] T030 [opus] `db-admin`: 0034 (model tables, `screens` rebuilt, `provisional_*` rename)
- [ ] T031 [opus] Parameter roles and route keys (`@pathfinder/model`), person override
- [ ] T032 [opus] Canonical clustering: partitions, MinHash distance, LSH > 500, must-/cannot-link, average linkage, deterministic ties, label conflicts
- [ ] T033 [opus] Stable ids and lineage; history-independence handling (design § 6.2)
- [ ] T034 [opus] Action classes, global actions, model transitions (upsert key), internal transitions
- [ ] T035 [opus] Coverage, absent streaks, statuses; build epochs and overlaps
- [ ] T036 [opus] `model-writer.ts` + `pnpm model:reconcile [--rebuild]`; after `finish_run`; watermarks; one transaction
- [ ] T037 [opus] τ calibration, pair labels, labelling queue (read model); `model:decide label`
- [ ] T038 [opus] Explorer seeding (F-01@038) from `screen_members`
- [ ] T039 [sonnet] Map and screen read models on Layer M (`queries_map.py` lifting removed); functional Salvage Yard pages
- [ ] T040 [opus] Reconciler gates: order independence, idempotence, rebuild, history independence (property tests)
- [ ] T041 [opus] Scenarios: Numbered sections, Repeated rows, Not visited, Moved link (gates)
- [ ] T042 [sonnet] Reference-insurer eval trial vs v1 baseline (screens); M2 gate; tag `v2.0.0-m2`

## M3 Interpretation

- [ ] T050 [opus] `db-admin`: 0035 (deviations, occurrences, hypotheses, evidence, tests, events; `open_questions` / `marks` columns); drop `reconciliations`, `rule_candidates`
- [ ] T051 [opus] Deviation detection and reference observations, scope attribution by element-key diff
- [ ] T052 [opus] Rules R1–R8 as pure functions with fixtures; replay requests as planner marks
- [ ] T053 [opus] Hypothesis lifecycle (status from events), refuted-claim refusal, competing hypotheses
- [ ] T054 [opus] Planner priorities 2–4; probe runs consume marks; test verdicts written back
- [ ] T055 [opus] Tools: crawler `add_hypothesis`; BA `list_hypotheses`, `get_hypothesis`, `propose_hypothesis`, `add_hypothesis_test`, `list_deviations`; remove `list_differing_states`, `propose_verdicts`, `add_rule_candidate`; crawler prompt tool names
- [ ] T056 [opus] `pnpm model:decide` (confirm, reject, overturn, parameter role) with Zod; overturns bind the next reconcile
- [ ] T057 [sonnet] Review and Changes read models and functional pages
- [ ] T058 [opus] Scenarios: Deployment, Persona variant, A/B, Flaky, Deterministic error, Renamed button, Removed link (gates); M3 gate; tag `v2.0.0-m3`

## M4 Rules

- [ ] T060 [opus] Decision points and observation tables (snapshot, derived ages, dropped attributes)
- [ ] T061 [opus] Miner `rules`: tree, paths to rules, overlap step, fitness and precision, "needs data"; pytest on fixtures; `MinedRulesFile` Zod schema
- [ ] T062 [opus] `pnpm model:import`; reconciler step 10 calls the miner when present
- [ ] T063 [opus] Boundary tests as probe suites; regression suites on confirm; planner 1 and 5; `pnpm model:regress`
- [ ] T064 [opus] Guard intersection along process paths → `ambiguous`
- [ ] T065 [sonnet] DMN 1.3 XML export; Rules read model and functional page
- [ ] T066 [opus] Scenarios: Threshold rule, Overlapping rule, Rule drift (gates); M4 gate; tag `v2.0.0-m4`

## M5 Processes

- [ ] T070 [opus] `db-admin`: 0036 (correlation ids, instances, triggers, explorations, `ba_processes` columns, PROC 1:1 index and triggers, `process_models` rename); 0037 if not in M1
- [ ] T071 [opus] Correlation ids (hashed), endpoint families, boundary weights
- [ ] T072 [opus] Miner `communities` (Leiden, seed 0); proposals with triggers, start screen, outcomes; `grouping_suggestions`; human edits as constraints
- [ ] T073 [opus] Process instances and outcomes; trace variants on read
- [ ] T074 [opus] Anchors on `entity_refs`; review triggers from lineage and `not_seen_since`
- [ ] T075 [opus] Stopping rule (depth 1, depth 2, random walks) on the driver; planner 6; `process_explorations`
- [ ] T076 [opus] BA guidance (`ba.md`, `ba-practice`, record kinds) for the model, hypotheses, processes, DMN `[B: owner's R-77 review, Q-1]`
- [ ] T077 [opus] Chat orchestrator: naming proposals, changes and hypotheses tools, reconcile and probe runs as actions
- [ ] T078 [sonnet] Export: DMN files, triggers and outcomes, explored bound, contracts by schema hash, model version; exportfork-export
- [ ] T079 [sonnet] Processes read models and functional pages
- [ ] T080 [sonnet] Grouping eval and reference-insurer eval vs baselines; M5 gate; tag `v2.0.0-m5`

## M6 Classifier

- [ ] T090 [opus] Similarity classifier over components (miner), held-out evaluation vs calibrated τ; switched on per portal when better; M6 gate; tag `v2.0.0-m6`

## M7 Close-out

- [ ] T100 [sonnet] `frontend-dev`: the UX designer's pages replace the functional ones (as delivered) `[B: UX consultation, Q-6]`
- [ ] T101 [haiku] Glossary final (UI words), `uv run pathfinder-glossary --write`; `docs/how-to-use.md` and READMEs for 2.0
- [ ] T102 [opus] `code-reviewer` on the branch; fix or defer findings
- [ ] T103 [sonnet] `pnpm test` in `apps/crawler` and every app's suite; three reference-insurer trials; new baselines
- [ ] T104 [sonnet] export-fork export; changelog 2.0.0 (po); squash-merge to master, tag `v2.0.0`, delete branch
