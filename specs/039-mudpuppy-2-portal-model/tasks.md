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
- [~] T021 [opus] Headless probe runs: `runs.mode = 'probe'`, driver on `local-client.ts` + `replay.ts`, prefix cache, checkpoints, budgets, `driver = 'headless'`. **Built:** replay runs (`start_run` `replay`, not a new mode: F-20), `replay-driver.ts`, element keys in replay results, autofill with the replay's inputs, `driver = 'headless'`, budget (`replayBudget`), boundary tests end to end (`pnpm model:replay`, `replay-driver.e2e.test.ts`). **Not yet:** prefix cache, checkpoint starts, R1/R4/R5/R8 replays (F-20)
- [x] T022 [sonnet] Pipeline golden and trace golden snapshots updated on purpose (`model_capture`, `model_reconciled`; diffs read: only the new step, one v2 cluster id); slow tier green
- [x] T023 [opus] M1 gate (plan § 1) + tag `v2.0.0-m1` (gate F-41@039 holds; tag left to the owner, F-41)

## M2 Model

- [x] T030 [opus] **0030_portal_model**: `model_versions`, `model_screens` (beside the crawler's `screens`, F-14), `screen_members`, `screen_lineage`, `state_pair_labels`, `parameter_roles`, `action_classes` (coverage folded in, F-14), `model_transitions`, `build_epochs`; Zod/Kysely/dashboard models, snapshot, portal export/delete
- [x] T031 [opus] Parameter roles and route keys, person override
- [x] T032 [opus] Canonical clustering (partitions, MinHash, LSH > 500, must-/cannot-link, average linkage, code-unit ties, label conflicts)
- [x] T033 [opus] Stable ids and lineage (split, merge, retire, revive)
- [x] T034 [opus] Action classes, global keys, model transitions folded by key, internal transitions
- [x] T035 [opus] Coverage and statuses (F-11, F-12, F-13); build epochs and overlaps
- [x] T036 [opus] `reconcile` (pure core) + `model-writer.ts` (`reconcilePortalModel`, watermarks, one transaction) + `pnpm model:reconcile [--rebuild]`; runs after `finish_run` (a failure is a decision-log warning, never a failed run)
- [x] T037 [opus] τ calibration, pair labels, labelling queue (read model); `model:decide label`. `calibrateTau`, `labellingQueue` (pure), `pairsToLabel`, `tauCalibration`, `calibratedTau` (store; the reconciler uses it), `pnpm model:pairs` (F-28). The dashboard queue is the UX designer's
- [x] T038 [opus] Explorer seeding (F-01@038) from `screen_members`. **Done 2026-10-20**: `seedKnownClusters` groups a route's states by their current model screen (else their crawler cluster) and seeds each group under its first member's cluster id
- [~] T039 [sonnet] Scans ▸ Map reads the model when the portal has one (`model_screens`, members as the deck, non-internal `model_transitions`, not-seen-since links greyed); one scan still reads its own edges. Screen pages and the inspector still read the crawler's screens
- [x] T040 [opus] Reconciler gates: order independence, rebuild, history independence (`model` tests on the pure core), idempotence and rebuild on the writer (`store` tests)
- [~] T041 [opus] Scenarios: Numbered sections, Repeated rows, Not visited, Moved link (gates). **Moved link built** (home shortcut into the menu, same release; `absence.e2e.test.ts`: `replaces` by R6, derived; e2e tests, not gates yet). **Repeated rows and Numbered sections built** (scenario-only pages; `model-structure.e2e.test.ts`; bugs F-26, F-27 fixed). Not visited is a run-side scenario (no portal injection), not built
- [ ] T042 [sonnet] Reference-insurer eval trial vs v1 baseline (screens); M2 gate; tag `v2.0.0-m2`

## M3 Interpretation

- [~] T050 [opus] **0031_interpretation**: `entity_refs`, `deviations`, `deviation_occurrences`, `hypotheses`, `hypothesis_evidence`, `hypothesis_tests`, `hypothesis_events`; `marks` (origin, hypothesis, priority) and `open_questions` (hypothesis) columns. Dropping `reconciliations` and `rule_candidates` waits for their readers (F-17)
- [x] T051 [opus] Deviation detection between consecutive model versions (`deviationsBetween`, `interpretVersion`), reference visits, dedup by subject
- [~] T052 [opus] Rules R1–R8 as pure functions with tests; R2, R6, R7 decide from the store; **R1 decides after two headless replays** (`error-replays.ts`, `pnpm model:replay`, F-22); **R8 after one** (`regressions.ts`, F-25); R4/R5 still leave the deviation `waiting_test` (F-17)
- [x] T053 [opus] Hypothesis lifecycle (status from events), claim hash, derived facts confirmed by the reconciler with their rule
- [~] T054 [opus] Planner priorities 2–6 (`plan`, pure); marks and probe runs wait for T021
- [x] T055 [opus] Tools: crawler `add_hypothesis`; BA `list_hypotheses`, `get_hypothesis`, `propose_hypothesis`, `add_hypothesis_test`, `list_deviations`; remove `list_differing_states`, `propose_verdicts`, `add_rule_candidate`; crawler prompt tool names. **Done 2026-10-20**: store `agent-hypotheses.ts` (typed evidence through `entity_refs`, test required except `NO_TEST_KINDS`, refuted claims refused, equal open claims returned), `services/ba/hypotheses.ts`, crawler `add_hypothesis` (builds the model when the portal has none), the agents' tool lists, the chat fence and `ba-practice` "Changes and hypotheses"; `differing-states.ts` stays for the SC-20 gate until T076 drops the v1 tables
- [x] T056 [opus] `pnpm model:decide` (confirm, reject, overturn with a reason, pair labels, parameter roles); labels and roles are constraints of the next reconcile; overturns bind (F-17)
- [~] T057 [sonnet] **What changed** page (`/changes`, Review section): deviations split into needs you / explained automatically / waiting for a check, with the hypothesis, its rule and reason; functional Salvage Yard until the UX designer's layout. Review itself does not list hypotheses yet
- [~] T058 [opus] Scenarios: **Deployment built** (reference portal serves a hashed release bundle on every page; `deployment` ships another and adds a field) and checked end to end (`model-deployment.e2e.test.ts`: two scans, one vehicle screen with two members, new member + new field both `structural_drift` by R2, derived). **Deterministic error built** (HTTP 500 for one model name; `error-replay.e2e.test.ts`: R1 replays twice, `deterministic_error` for a person). **Removed link and Renamed button built** (`absence.e2e.test.ts`: `removed` and `replaces` by R6, derived; bug F-23 fixed). Persona variant, A/B, Flaky not built

## M4 Rules

- [x] T060 [opus] Decision points and observation tables (snapshot, derived ages, dropped attributes); inputs typed at the step count (F-21)
- [x] T061 [opus] Miner `rules`: tree, paths to rules, overlap step, fitness and precision, "needs data"; pytest on fixtures; `MinedRulesFile` Zod schema (`MinedRule`, F-15)
- [~] T062 [opus] `pnpm model:import`; reconciler step 10 calls the miner when present. **Built as** `pnpm model:mine` (tables → miner → Zod import); the reconciler does not call the miner yet
- [~] T063 [opus] Boundary tests as probe suites; regression suites on confirm; planner 1 and 5; `pnpm model:regress`. **Built:** boundary tests written on import and run by `pnpm model:replay` (verdicts, supported / refuted); regression rounds of confirmed rules on a release or `pnpm model:regress`, failures → `rule_mismatch` → R8 (F-25). **Not yet:** probe-suite rows for owner review, the weekly schedule
- [x] T064 [opus] Guard intersection along process paths → `ambiguous` (decision-point chains until process models exist, F-33)
- [~] T065 [sonnet] DMN 1.3 XML export; Rules read model and functional page. **Built:** `decisionRules`, `dmnFiles` (`rule-export.ts`), `pnpm model:dmn` (one `.dmn` per confirmed or supported rule plus a README index with verdicts). **Functional Rules section** on What changed (status, boundary verdicts, fit; `queries_changes.decision_rules`); the explained bucket also takes a deviation another change's fact covers (F-23 rename). **Not yet:** the designed Rules page (UX designer); DMN inside the process export (T078)
- [~] T066 [opus] Scenarios: Threshold rule, Overlapping rule, Rule drift (gates); M4 gate; tag `v2.0.0-m4`. Threshold rule: the base portal already refuses drivers under 18 (validation on the same screen), checked by `replay-driver.e2e.test.ts` (an e2e test, not a gate yet); its switchboard entry is not marked built. **Rule drift built** (`rule-drift.e2e.test.ts`: regression round on the release, mismatch, R8 decision drift, rule superseded). Overlapping rule not built

## M5 Processes

- [x] T070 [opus] (F-34) `db-admin`: 0036 (correlation ids, instances, triggers, explorations, `ba_processes` columns, PROC 1:1 index and triggers, `process_models` rename); 0037 if not in M1
- [x] T071 [opus] Correlation ids (hashed), endpoint families, boundary weights (computed on read from `network_calls` samples, not stored yet: F-19)
- [~] T072 [opus] Miner `communities` (Leiden, seed 0); proposals with triggers, start screen, outcomes; `grouping_suggestions`; human edits as constraints. **Built:** `processGraph`, `writeProposals`, `pnpm model:propose` (start screen, flow order, dismissed sets refused). **Not yet:** triggers, outcomes, human edits as constraints (F-19)
- [x] T073 [opus] Process instances and outcomes; trace variants on read (F-35)
- [x] T074 [opus] Anchors on `entity_refs`; review triggers from lineage and `not_seen_since` (built, F-36; the v1 polymorphic columns went with 0040–0041, owner answer 13, F-45)
- [~] T075 [opus] Stopping rule (depth 1, depth 2, random walks) on the driver; planner 6; `process_explorations` (built, `pnpm model:explore`, F-37; no planner marks, no browser test yet)
- [~] T076 [opus] (done except the `api_endpoint` row, which needs 038b; F-32) BA guidance (`ba.md`, `ba-practice`, record kinds) for the model, hypotheses, processes, DMN; with R-77 (1) (the owner accepted it 2026-10-20): what a process is (goal, trigger, own first screen, outcome), where it starts and ends, pages on the way are the trigger's context, never steps; the `api_endpoint` row (R-77 (4)); then drop `reconciliations` and `rule_candidates`
- [x] T081 [opus] R-77 (3): the trace marks the trigger step (the click that enters the process); the BA and the export start the process there
- [~] T082 [sonnet] (checks `export_wrong_start` / `export_wrong_end` built; the trials cost money and wait for the owner, F-32) R-77 (2): eval check on the reference portal, each process's first and last contained screens equal the ground truth's `first_route` / `last_observable_route`, `export_extra_steps` = 0 over several trials (`create-eval`)
- [x] T077 [opus] Chat orchestrator: naming proposals, changes and hypotheses tools, reconcile and probe runs as actions (built, F-39; the assistant starts a check run after the owner's yes, `start_check_run`, owner answer 19, F-46)
- [~] T078 [sonnet] Export: DMN files, triggers and outcomes, explored bound, contracts by schema hash, model version (built except contracts by schema hash, F-38)
- [~] T079 [sonnet] Processes read models and functional pages (the process page shows triggers, outcomes, explored and rules, T100 step 4; trace variants on the page and the proposals' split/merge wait for T100)
- [ ] T080 [sonnet] Grouping eval and reference-insurer eval vs baselines; M5 gate; tag `v2.0.0-m5`

## Owner decisions 2026-10-20 (questions 1–8 of the session dump)

- [x] T110 [opus] F-06: rename `edges` → `transitions` and `page_visits` → `observations` everywhere, the design's names (`db-admin` migration; code, SQL, Python, docs, glossary); every suite green, no old name left (grep). **Done 2026-10-20** as migration 0032 (F-29), done inline
- [x] T111 [opus] **Done 2026-10-20** (F-31). Fingerprint profiles in the portal YAML (`fingerprint: { use, profiles }`, like `fixes`): the rules of `structure.ts` / `fingerprint.ts` as parameters (row roles, field roles, named roles, `ignore_names_in`, `cluster_threshold`), built-in `rows-v2` = today's behaviour, `extends`, Zod schema refused at `start_run` (`CONFIG_INVALID`); `docs/portal-config.md`
- [x] T112 [opus] **Done 2026-10-20** (migration 0033, F-31). Profile recorded on every observation and model version (name + rules hash); the reconciler never compares two profiles
- [x] T113 [opus] **Done 2026-10-20** (F-31: re-fingerprint can merge, never split, a state keeps one snapshot). `pnpm model:refingerprint --profile <name>` (recompute from stored snapshots, no recrawl; check first that every observation keeps its full snapshot) and `pnpm model:compare-fingerprints <a> <b>` (which screens merge or split differently)
- [x] T114 [sonnet] **Done 2026-10-20** (`menu-link`, `menu-link.e2e.test.ts`). Scenario: a portal-wide menu change (one link added to the main navigation) under `rows-v2` and a no-menu profile; the model keeps every screen
- [x] T116 [sonnet] **Done 2026-10-20** (F-30). F-20 as decided (the owner: "naming as per design doc"): the headless driver's runs become `runs.mode = 'probe'` (design § 9; one replayed path inside it stays a "replay", `replay_budget`); spec 032's marked-step probing is renamed "form probing" (the designer's `11-map-runs.md` word) in tools, dashboard, docs and glossary, so "probe run" means one thing; every suite green, grep for the old wording
- [x] T115 [opus] **Done 2026-10-20** (F-31; accepting from the page waits for T100). F-28 as decided (R-82): the calibrated τ is shown and a person accepts it (`model:decide accept-tau`, the What changed page); one τ per portal and fingerprint profile; the profile's `cluster_threshold` is the default until one is accepted

## M6 Classifier

- [~] T090 [opus] Similarity classifier over components (miner), held-out evaluation vs calibrated τ; in force once a person accepts it when better (owner answer 14, F-44, F-46); M6 gate; tag `v2.0.0-m6` (built, `pnpm model:classify`, F-40; the gate needs real labels, no tag)

## M7 Close-out

- [~] T100 [sonnet] (steps 1–4 done: `ux-gaps.md` (15 backend gaps, 6 owner questions), the package imported (docs, skill, CSS), the grouped nav with Changes and Rules, the Rules pages v2-11/v2-12, the process page's model facts; the rest waits for the owner's answers in `ux-gaps.md` § 3) `frontend-dev`: the UX designer's pages replace the functional ones; delivered 2026-10-20 in `user_input/MudPuppyRebrand/mudpuppy-salvage-yard (3).zip` (screens `v2-01`…`v2-16`, `docs/12-v2-ux.md`, `13-v2-fixtures.md`, updated `mudpuppy-salvage-ui` skill); first check the package against `ux-requirements.md` and list gaps
- [~] T101 [haiku] (entries for this session's terms added; the UI words of `12-v2-ux.md` § 3 wait for the pages) Glossary final (UI words), `uv run pathfinder-glossary --write`; `docs/how-to-use.md` and READMEs for 2.0
- [ ] T102 [opus] `code-reviewer` on the branch; fix or defer findings
- [ ] T103 [sonnet] `pnpm test` in `apps/crawler` and every app's suite; three reference-insurer trials; new baselines
- [ ] T104 [sonnet] Changelog 2.0.0 (po); squash-merge to master, tag `v2.0.0`, delete branch
