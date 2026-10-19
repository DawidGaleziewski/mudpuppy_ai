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

- [x] T010–T012 [opus] One migration, **0029_capture_v2** (additive, reversible): `builds`, `state_components`, `journeys`, `attribute_writes`, `observation_builds`; v2 columns on `edges` (journey, seq, `from_visit_id`, element key, kind, result, driver), `page_visits` (journey, seq, result, context key, flags) and `network_calls` (`schema_hash`). Physical names kept (F-06), target observation via `page_visits.edge_id` (F-07); `entity_refs` moves to M3/M5 with the tables it points at; `runs.build_flag` dropped (a portal without hashed builds shows from `builds.source = unknown`)
- [x] T013 [opus] Fingerprint v2 (row-like repeated siblings collapse, F-01, F-02), components, `minhashBlob`; the fingerprint lock rewritten once for v2
- [x] T014 [opus] Model element keys (`modelElementKeys`, `keysForActions`; F-03, F-08) on every issued action and in `state_components.element_keys`
- [x] T015 [opus] Build signatures (`buildSignatures`, scopes F-04), `recordAssets` (crawler), `model:` portal hook (header or meta marker, F-09; experiment flags; business errors); bug F-16 fixed
- [x] T016 [opus] Step results (`stepResult`, precedence F-05) on every visit and transition (`model_capture` step)
- [x] T017 [opus] Journeys: `entry_url` on a typed navigate, `checkpoint` on `go_to_state` (F-10), `login`, `fresh_session`, `resume`; ended on the next start and at `finish_run`; visits numbered per run, transitions per journey; refused actions are `blocked` steps
- [x] T018 [opus] Attribute writes: persona at seq 0, typed and autofilled inputs, shown label–value pairs; `snapshotAt`, `typeValue`, `ageOf`
- [-] T019 [opus] Trace mode on `trace_runs`: **moved to M5** (one process concept); traces already write journeys, transitions and attributes
- [-] T020 [sonnet] Readers of `edges` / `page_visits`: **not needed** while the physical names stay (F-06, owner question)
- [ ] T021 [opus] Headless probe runs: `runs.mode = 'probe'`, driver on `local-client.ts` + `replay.ts`, prefix cache, checkpoints, budgets, `driver = 'headless'`
- [x] T022 [sonnet] Pipeline golden and trace golden snapshots updated on purpose (`model_capture`, `model_reconciled`; diffs read: only the new step, one v2 cluster id); slow tier green
- [ ] T023 [opus] M1 gate (plan § 1) + tag `v2.0.0-m1`

## M2 Model

- [x] T030 [opus] **0030_portal_model**: `model_versions`, `model_screens` (beside the crawler's `screens`, F-14), `screen_members`, `screen_lineage`, `state_pair_labels`, `parameter_roles`, `action_classes` (coverage folded in, F-14), `model_transitions`, `build_epochs`; Zod/Kysely/dashboard models, snapshot, portal export/delete
- [x] T031 [opus] Parameter roles and route keys, person override
- [x] T032 [opus] Canonical clustering (partitions, MinHash, LSH > 500, must-/cannot-link, average linkage, code-unit ties, label conflicts)
- [x] T033 [opus] Stable ids and lineage (split, merge, retire, revive)
- [x] T034 [opus] Action classes, global keys, model transitions folded by key, internal transitions
- [x] T035 [opus] Coverage and statuses (F-11, F-12, F-13); build epochs and overlaps
- [x] T036 [opus] `reconcile` (pure core) + `model-writer.ts` (`reconcilePortalModel`, watermarks, one transaction) + `pnpm model:reconcile [--rebuild]`; runs after `finish_run` (a failure is a decision-log warning, never a failed run)
- [ ] T037 [opus] τ calibration, pair labels, labelling queue (read model); `model:decide label`
- [ ] T038 [opus] Explorer seeding (F-01@038) from `screen_members`
- [~] T039 [sonnet] Scans ▸ Map reads the model when the portal has one (`model_screens`, members as the deck, non-internal `model_transitions`, not-seen-since links greyed); one scan still reads its own edges. Screen pages and the inspector still read the crawler's screens
- [x] T040 [opus] Reconciler gates: order independence, rebuild, history independence (`model` tests on the pure core), idempotence and rebuild on the writer (`store` tests)
- [ ] T041 [opus] Scenarios: Numbered sections, Repeated rows, Not visited, Moved link (gates)
- [ ] T042 [sonnet] Reference-insurer eval trial vs v1 baseline (screens); M2 gate; tag `v2.0.0-m2`

## M3 Interpretation

- [~] T050 [opus] **0031_interpretation**: `entity_refs`, `deviations`, `deviation_occurrences`, `hypotheses`, `hypothesis_evidence`, `hypothesis_tests`, `hypothesis_events`; `marks` (origin, hypothesis, priority) and `open_questions` (hypothesis) columns. Dropping `reconciliations` and `rule_candidates` waits for their readers (F-17)
- [x] T051 [opus] Deviation detection between consecutive model versions (`deviationsBetween`, `interpretVersion`), reference visits, dedup by subject
- [~] T052 [opus] Rules R1–R8 as pure functions with tests; R2, R6, R7 decide from the store; R1/R4/R5/R8 leave the deviation `waiting_test` until the headless driver (T021) runs replays (F-17)
- [x] T053 [opus] Hypothesis lifecycle (status from events), claim hash, derived facts confirmed by the reconciler with their rule
- [~] T054 [opus] Planner priorities 2–6 (`plan`, pure); marks and probe runs wait for T021
- [ ] T055 [opus] Tools: crawler `add_hypothesis`; BA `list_hypotheses`, `get_hypothesis`, `propose_hypothesis`, `add_hypothesis_test`, `list_deviations`; remove `list_differing_states`, `propose_verdicts`, `add_rule_candidate`; crawler prompt tool names
- [x] T056 [opus] `pnpm model:decide` (confirm, reject, overturn with a reason, pair labels, parameter roles); labels and roles are constraints of the next reconcile; overturns bind (F-17)
- [~] T057 [sonnet] **What changed** page (`/changes`, Review section): deviations split into needs you / explained automatically / waiting for a check, with the hypothesis, its rule and reason; functional Salvage Yard until the UX designer's layout. Review itself does not list hypotheses yet
- [~] T058 [opus] Scenarios: **Deployment built** (reference portal serves a hashed release bundle on every page; `deployment` ships another and adds a field) and checked end to end (`model-deployment.e2e.test.ts`: two scans, one vehicle screen with two members, new member + new field both `structural_drift` by R2, derived). Persona variant, A/B, Flaky, Deterministic error, Renamed button, Removed link not built (most need the headless driver's replays)

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
- [x] T071 [opus] Correlation ids (hashed), endpoint families, boundary weights (computed on read from `network_calls` samples, not stored yet: F-19)
- [~] T072 [opus] Miner `communities` (Leiden, seed 0); proposals with triggers, start screen, outcomes; `grouping_suggestions`; human edits as constraints. **Built:** `processGraph`, `writeProposals`, `pnpm model:propose` (start screen, flow order, dismissed sets refused). **Not yet:** triggers, outcomes, human edits as constraints (F-19)
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
