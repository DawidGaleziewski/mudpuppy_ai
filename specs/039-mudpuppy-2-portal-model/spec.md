# Spec 039: MudPuppy 2.0, the reconciled portal model (R-81)

Branch `feature/039-r81-mudpuppy-2-portal-model` · 2026-10-18 · owner request (2026-10-18): "We will
do a full blown change as suggested. Prepare design docs for this. Including getting rid of all
data that could go in the way. … one branch … This will be version 2.0 of mudpuppy." Source design:
`user_input/system_design/Design.md` (the owner's, 2026-10-18). This folder adapts it to the
codebase; where they differ, `design.md` here wins and says why.

| File | For |
| --- | --- |
| `spec.md` (this) | what and why: problem, requirements, decisions, open questions |
| `design.md` | the system design: layers, schema, reconciler, rules, hypotheses, decision mining, processes, planner, anchors |
| `plan.md` | how the change is made: milestones, order, data reset, gates, Constitution Check, risks |
| `tasks.md` | the task list, tagged by model |
| `ux-requirements.md` | the brief for the UX designer |

## Problem

R-79 (owner, 2026-10-18: "we need to re-discuss how we store data and reconcile states"). Scans
are stored as one append-only graph per portal, but there is no picture of the portal **as it is
now**:

1. **Edges are never matched across scans.** A link moved from the body into the menu shows as two
   lines; a link that is gone stays forever.
2. **Absence is unclear.** "Scan B did not see it" is not told apart from "it no longer exists".
3. **Why states differ is unknown.** Time (a deployment), persona, environment (an error),
   randomness (A/B): a revision does not say which (R-33 F-01).
4. **Screen identity depends on visit order.** The fingerprint index is in-memory per run and
   deterministic only for one insertion order; rescans made twin screens (F-01@038 is a patch).
5. **Route identity is too coarse.** Path segments fold into `/:param` after 10 values and query
   strings never count (R-50, F-16@030: numbered sections become one screen).
6. **The screen graph is not stored.** `queries_map.py` lifts state edges to screens on every load.
7. **Three meanings of "process".** Trace `processes`, `ba_processes` (PRC) and PROC doc records
   (R-65 D-9, R-78 C6).
8. **Process start and end are undefined** (R-77): the page the user came from becomes step 1.
9. **Grouping only on request, reasons lost** (R-78 (1)–(4)).
10. **Reconciliation only per node** (spec 033 `reconciliations`, `screens.merged_into`).
11. **Polymorphic references, fragile anchors.** `doc_evidence_links.target_id`, `amendments.target_id`
    and `about_ref` have no foreign keys; a new revision pushes amendments to `needs_reanchor` (R-44).
12. **Much evidence per state, little meaning per edge.** Edges carry no inputs, no step result,
    no build, no guard.

And for the R-68 goal (documentation good enough to rebuild a portal per process): business rules
are unverified `rule_candidates`, and nothing says how completely a process was explored.

## Goal

MudPuppy 2.0 keeps a stored, rebuildable **portal model** between the raw evidence and the BA's
documentation. Deterministic code builds it after every run; agents and people add decisions on
top. It tracks a portal over time: what changed, when, and why; which business rules hold, with
tests; how far each process was explored.

## Requirements

Grouped by the design's six phases (milestones M1–M6 in `plan.md`).

### Capture (M1)

- **FR-001 Build signatures.** Every observation records the build of each scope on the page
  (shell and every micro-frontend mount), from hashed asset names or a portal-declared marker;
  `unknown` when neither exists, and the portal is flagged.
- **FR-002 Endpoint schemas.** Every captured API call carries a hash of its response's key paths
  and value types (values ignored).
- **FR-003 Fingerprint v2.** Accessible names are masked like text; runs of two or more siblings
  with the same structure collapse into one repeated node. Components (structure, content,
  overlays, calls, mounts, MinHash, element keys) are stored per state. v2 is the only fingerprint.
- **FR-004 Element keys.** Every actionable element gets `role | masked name | container path | ordinal`.
- **FR-005 Observations.** One row per visit with its journey, order, full URL, step result,
  context key (builds, audience, experiment arm) and flags.
- **FR-006 Journeys and transitions.** Each continuous path is a journey (fresh session, typed
  navigation, checkpoint replay or backtrack starts a new one; a backtrack is a child journey).
  Every action, fills included, is a transition between observations with its element key, step
  result and the API calls it caused. Transitions replace `edges`; journeys replace trace `processes`.
- **FR-007 Attribute writes.** Persona attributes, typed inputs and shown label–value pairs are
  recorded per journey position, raw (personas are synthetic).
- **FR-008 Step results.** `ok`, `validation`, `business_error`, `technical_error`, `timeout`,
  `blocked`, on every observation and transition.

### Model (M2)

- **FR-010 Canonical clustering.** Abstract states (screens) come from an order-independent
  clustering per route key (MinHash distance, average linkage, deterministic ties, must-link and
  cannot-link from labels and confirmed hypotheses).
- **FR-011 Stable ids and lineage.** Re-clustering keeps screen ids by member overlap; splits,
  merges, retirements and revivals are recorded per model version.
- **FR-012 Threshold calibration.** τ per portal: 0.9 until 30 + 30 pair labels exist, then the
  F1-best value on the labels; a labelling queue shows the pairs nearest τ.
- **FR-013 Parameter roles.** Each path and query parameter of a route template is identity, data
  or ignored, decided from structure (a person can override); route key = template with identity
  parameters written out.
- **FR-014 Model transitions and action classes.** Every transition maps to one model transition
  (screen, action class, screen, result) with support, first and last sighting; self-loops are
  internal and shown in the screen, not on the Map.
- **FR-015 Coverage and status.** Per action class and audience: last present, last absent, absent
  streak, last executed; statuses `active`, `not_seen_since`, `untested`, `retired`.
- **FR-016 Build epochs.** Per scope and environment; overlapping epochs mark gradual rollouts.
- **FR-017 The Map reads the model.** Scans ▸ Map shows the current model version's non-internal
  transitions; one run's own graph still reads Layer A.
- **FR-018 Reconciler guarantees.** Idempotent, order-independent, rebuildable with stable ids;
  each a gate.

### Interpretation (M3)

- **FR-020 Deviations.** Every place where a new run does not fit the previous model version is a
  deviation (new screen, new member, new action, missing action, target mismatch, result
  mismatch, rule mismatch), with a reference observation, the changed components and the context
  difference; repeats attach to the first.
- **FR-021 Rules R1–R8.** Deterministic classification of deviations (errors, drift, backend
  drift, context, randomness, absence, targets, rule drift) into hypotheses, derived where the rule
  allows, otherwise waiting for a person or the agent.
- **FR-022 Hypotheses.** One table for every testable claim (replaces `reconciliations` and
  `rule_candidates`), with evidence, tests (each with what would refute it), a lifecycle and an
  event log whose every change carries a reason.
- **FR-023 Who confirms what.** Derived facts apply automatically and are reversible in Review; an
  overturn binds later reconciles. Identity labels, rules, process boundaries and anything needing
  interpretation wait for a person.
- **FR-024 Deterministic replays.** Every replay, boundary test, regression suite and exploration
  walk runs through the headless driver without the LLM (`local-client.ts`, `trace-driver.ts`,
  `replay.ts`), with a per-run budget (adaptation, see design § Replays).

### Rules (M4)

- **FR-030 Decision points.** An action class whose executions in one epoch and environment lead
  to two or more (target, result) pairs.
- **FR-031 Decision mining.** A Python worker mines DMN decision tables from attribute snapshots
  (scikit-learn decision trees, overlapping rules, fitness and precision), writing through the
  TypeScript command that validates them.
- **FR-032 Boundary tests.** Each proposed rule gets boundary tests (t − δ, t, t + δ; one per
  category), run deterministically; once confirmed they are its regression suite.
- **FR-033 Decision drift.** Regression suites rerun on a new epoch of a scope that renders the
  decision point, on an endpoint schema change, and weekly; a failure is a rule mismatch, R8
  supersedes the rule and re-mines.
- **FR-034 DMN export.** Confirmed rules are exported as DMN 1.3 XML with the SRS and process export.

### Processes (M5)

- **FR-040 One process concept.** Journey (A), process (M, `ba_processes`), process documentation
  (B, exactly one PROC record per process, enforced in SQLite).
- **FR-041 Process definition.** Trigger, start screen, member screens, outcomes (completed,
  exited, error, abandoned), entry path, preconditions; global navigation ends an instance.
- **FR-042 Boundary signals and proposals.** Correlation ids, mounts, endpoint families and form
  steps weight a screen graph; Leiden community detection proposes processes after every
  reconcile; the agent names them and saves them as proposals (R-78 direction); a person accepts,
  edits or rejects with a reason.
- **FR-043 Process instances.** Each journey's pass through a process, with outcome, the cases
  decision mining uses.
- **FR-044 Typed references.** `entity_refs` with real foreign keys replaces every polymorphic
  reference; anchors are a screen plus an element key; an anchor needs review only on lineage or
  `not_seen_since`.
- **FR-045 Explored bound.** Per process and epoch set: depth 1, depth 2, 50 random walks; explored
  when a pass finds no new deviation; the documentation states the bound.

### Classifier (M6)

- **FR-050 Similarity classifier.** Over all fingerprint components, trained on the pair labels,
  replaces the single τ when it beats it on held-out labels.

### Cross-cutting

- **FR-060 Planner.** After each reconcile, priorities 1–6 (design § The query loop) become marks
  with origin `planner`, consumed by deterministic probe runs.
- **FR-061 Portal hooks.** Build marker, version header, flag names, business error templates,
  per portal, optional.
- **FR-062 Clean slate.** v2 starts from an empty store; obsolete tables, columns and data are
  removed, not migrated (plan § Data reset).
- **FR-063 Scenario switchboard.** The reference portal gets flags that each inject one known
  change, with ground truth; each scenario is a gate.
- **FR-064 Dashboard.** The pages in `ux-requirements.md`, after the UX designer's consultation.
- **FR-065 Constitution 6.0.0.** The amendment in design § Constitution amendment, before any code
  that relies on it.

## Decisions made while adapting (owner may overturn)

| # | Decision | Why |
| --- | --- | --- |
| D-1 | **Clean slate.** The store, evidence, traces, exports and gate/mutation leftovers are deleted; v2 migrations drop obsolete tables with no back-fill, no dual writes, no legacy links | Owner 2026-10-18: "all test data. We can drop it." Removes about a quarter of the source design (back-fill, v1/v2 fingerprints side by side, `legacy_process_id`, `legacy_edge_id`, compatibility views) |
| D-2 | **Schema follows the store conventions**: UUIDv7 `TEXT` ids, `STRICT`, `json_valid` checks, ISO timestamps; human keys (`H-0001`) beside ids | The source's `INTEGER` ids do not match any existing table |
| D-3 | **Migration chain kept** (0001–0028); v2 is 0029 onward and destructive. The parked `feature/038b-api-endpoint-kind` renumbers when rebased | A new baseline would rewrite 28 migrations and every read-model drift test for no gain on an empty store |
| D-4 | **`page_visits` becomes `observations`** (renamed, extended) and **`network_calls` gets `schema_hash`** instead of new parallel tables | Avoids three per-visit tables; `network_calls` already stores the shapes |
| D-5 | **New pure package `@pathfinder/model`** (clustering, ids, coverage, deviations, rules R1–R8, planner) and its writer in `@pathfinder/store` | Principle VII; one place the MCP server, CLI and dashboard commands share |
| D-6 | **New Python app `apps/miner`** (uv; scikit-learn, igraph + leidenalg): decision mining and Leiden. It reads the store read-only and prints JSON; `pnpm model:import` validates it with Zod and writes | Constitution: Python never writes the DB except through the TypeScript schemas; no solid Leiden in TypeScript |
| D-7 | **Every replay is deterministic** (headless driver, no LLM), budgeted per run | The design's cost and repeat-run assumptions hold only then |
| D-8 | **Internal names follow the design; the UI keeps BA words** (screen, process, scan, change, variant); the UX designer and the glossary settle the UI copy | The literature names are precise but the BA never needs most of them |
| D-9 | **The reconciler runs after `finish_run` and on demand** (`pnpm model:reconcile <portal>`, dashboard button through that command) | Same pattern as `docs:review` |
| D-10 | **The scenario switchboard scenarios are gates** (deterministic driver), plus one end-to-end eval trial per milestone | Deterministic checks are tests, not evals (`create-eval`); cheaper and repeatable |
| D-11 | **Version 2.0.0** of MudPuppy at merge; one branch, internal milestones M0–M7 each ending in its gate; master gets only fixes meanwhile | Owner 2026-10-18 |

## Open questions for the owner

Built without waiting; each has a default the plan uses until answered.

- **Q-1 R-77 review before M5.** The BA guidance (`ba-practice`, `ba.md`) is frozen until the
  owner's R-77 review; M3 (hypothesis tools) and M5 (process concept) change it. Default: M1–M4 go
  ahead; the guidance edits wait in M5 for the review.
- **Q-2 Constitution 6.0.0 wording** (design § Constitution amendment). Default: the text there,
  approved before M3 code.
- **Q-3 Weekly rule regression** needs something that starts it (cron or the chat service).
  Default: a `pnpm model:regress <portal>` command; scheduling left to the owner.
- **Q-4 Pair labels across portals** on the same frontend platform (source's open question).
  Default: per portal.
- **Q-5 038b `api_endpoint`.** Default: rebased onto v2 after R-77, as `entity_refs` users.
- **Q-6 UX designer.** Default: functional Salvage Yard pages per milestone, replaced by the
  designer's pages when they arrive (UX-R items in `ux-requirements.md`).

## Out of scope

- Moving any v1 data. Real accounts (hashing of attribute text values): only noted.
- Playwright trace retention (1.2 GB today): its own item.
- New crawler capabilities (logins, legacy pages, frames); the model reports them as gaps.

## Success criteria

- Every gate in design § Evals and gates passes: the three reconciler guarantees and the 14
  switchboard scenarios.
- Reference-insurer eval at or above the v1 baseline on screens, processes, rules and export
  scores; rules score from tested decision rules (today 9 / 17).
- Grouping eval (spec 038) at or above baseline; PROC to PRC 1:1 enforced.
- After a simulated deployment the owner sees what changed and why on one page, and confirms
  only items that need a person.
