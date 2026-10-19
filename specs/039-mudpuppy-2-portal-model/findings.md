# Findings 039 (MudPuppy 2.0)

Bugs, slips and design deviations found while building, each with a test or eval idea
(`log-every-bug-for-evals`). Newest last.

## F-01 Fingerprint v1 already masked accessible names (T013), 2026-10-19

- **What**: design § 5.4 (from the source) lists "accessible names are masked" as a v2 change, but
  v1's `canonicalizeAria` already runs `maskVolatile` on every name, so "Koszyk (3)" and
  "Koszyk (4)" already hashed alike. The real v2 change is the repeated-sibling collapse.
- **Test**: `structure.test.ts` "masks numbers in names, so a counter does not change the key".

## F-02 Collapsing every repeated sibling run erased form fields (T013), 2026-10-19

- **What**: the design's rule, "runs of two or more consecutive siblings with the same structural
  signature collapse", also matched leaves: two textboxes in a row, three menu links, two
  paragraphs. Their names left identity, so "one added form field" (the Deployment scenario) no
  longer changed the state. **Deviation:** only row-like runs collapse: a row role (`listitem`,
  `row`, `article`, `option`, `treeitem`) or a subtree holding more than text. Leaves keep their names.
- **Test**: "never collapses leaves: a form keeps every field name, an added field changes identity";
  "keeps consecutive paragraphs as content". Eval idea: the Repeated rows and Deployment scenarios
  together (rows collapse, a new field does not).

## F-03 Element key container path made precise (T014), 2026-10-19

- **What**: the design's container path is "nearest landmark role and its name, then the nearest
  heading above", but its own example `main>form "Dane pojazdu"` has two landmarks. **Built:** every
  container ancestor outermost first (banner, navigation, main, contentinfo, complementary, region,
  search, form, dialog, alertdialog; with its name when it has one), then the nearest heading above
  inside the innermost container that has one. Ordinal only when role, name and container repeat.
  Options under a native select are skipped, as the action extractor skips them.
- **Risk** (design § 20, element-key churn): a renamed heading changes every key under it; R6
  pairs them as `replaces`. Test idea: the Renamed button scenario plus a renamed section heading.

## F-04 Build scopes approximated from what the page loads (T015), 2026-10-19

- **What**: design § 5.2 assigns assets "requested by a micro-frontend mount (by frame, initiator or
  remote entry URL)" to that mount's scope. The crawler knows each asset's frame and whether the
  document named it or a script loaded it (`MountProbe.bundles`), not which mount requested it.
  **Built:** frames are their own scope (`frame:<host><path>`); a bundle loaded by script belongs to
  the folder it was served from (`mfe:<folder>`, a remote entry and its chunks); the rest is
  `shell`. Two micro-frontends served from one folder share a scope.
- **Test idea**: a proving-ground page with two remote entries in two folders and one shared
  library; drift of one remote changes only its scope.

## F-05 Step results need a precedence (T016), 2026-10-19

- **What**: design § 5.6 lists when each result applies but not which wins when several do (a
  validation message on a page that never settled; a refusal text on a 500). **Built:** blocked >
  technical_error > business_error > validation > timeout > ok.
- **Test**: `capture.test.ts` step results table.
- **Also**: the session does not expose the document's HTTP status. `technical_error` is the
  browser's own error page, the transient-error page detector, or a 5xx among the page's own
  calls (drained network). A 500 document with a normal-looking body is missed. Test idea: the
  Flaky page scenario serves a plain 500 page.

## F-06 Physical table names kept: `edges` = transitions, `page_visits` = observations (T010–T012), 2026-10-19

- **What**: design § 5.9 renames `page_visits` to `observations` and replaces `edges` with
  `transitions`. About 250 places name `edges`, `edge_id` or `page_visits` (tools, BA evidence, the
  run graph, the export, the dashboard's SQL), and the repo forbids scripted edits. **Built:**
  migration 0029 adds the design's columns to `edges` (journey, seq, start visit, element key,
  kind, result, driver) and `page_visits` (journey, seq, result, context key, flags) and keeps
  their names; code and docs say "transition" and "observation". The trace tables
  (`processes`, `process_steps`) stay until M5 (one process concept), `reconciliations` and
  `rule_candidates` until M3 (hypotheses), `entity_refs` lands with the tables it points at.
- **Owner question (morning)**: rename the tables to the design's names before 2.0 merges (a
  mechanical task, hours of hand edits), or keep the names and say it in the glossary?

## F-07 A transition's target observation is the visit naming it (T011), 2026-10-19

- **What**: the pipeline records the edge before the visit (API calls hang off the edge), and the
  visit already names the edge that led to it (`page_visits.edge_id`). A `to_observation_id` on
  the edge would point at a row not yet written. **Built:** the edge stores the visit it started
  from (`from_visit_id`); its target is `SELECT id FROM page_visits WHERE edge_id = <edge>`.

## F-08 Two "element keys" (T014), 2026-10-19

- **What**: `@pathfinder/core` already has `elementKeys` (spec 008: `role:name#n`, layout regions
  and BA screen-region citations). The model's element key (`role|masked name|container|ordinal`)
  is another thing. **Built:** the model's is `modelElementKeys` in `@pathfinder/fingerprint`; the
  column is `element_key`. Glossary must name both (T101).

## F-09 No version endpoint as a build marker (T015), 2026-10-19

- **What**: design § 5.10 lets a portal hook name a version endpoint. Fetching it would be a request
  of the crawler's own, which spec 001 FR-025 forbids ("never issues a request of its own").
  **Built:** `model.build_marker` takes a document response `header` or a `meta` name only; an
  `endpoint` key is refused by the schema. If the page itself calls a version endpoint, its
  response shape is still recorded.

## F-10 `go_to_state` starts a root journey, not a child (T017), 2026-10-19

- **What**: design § 5.7 makes a backtrack a child journey that inherits its parent's steps up to
  the branch point. `go_to_state` replays the recorded path from its start, so the replayed steps
  are transitions of their own; a child journey would count them twice. **Built:** `go_to_state`
  starts a root `checkpoint` journey (the open one ends `backtrack`); child journeys stay in the
  schema for a real browser back, which the crawler does not do yet.

## F-11 Coverage: the latest runs decide (T035), 2026-10-19

- **What**: design § 6.6 calls an action `active` when present in the current epoch and
  `not_seen_since` when absent in two consecutive runs of it; an action present early in the epoch
  and missed by the last two runs is both. **Built:** `not_seen_since` wins when every audience it
  was on missed it in the last two runs.
- **Test**: `transitions.test.ts` "present, then missed twice".

## F-12 Audience = persona and environment of the run (T035), 2026-10-19

- **What**: design § 5.6 defines the audience as a hash of the persona's attribute set and the
  environment; visits store only the combined context key (builds + audience + arm), not the
  audience apart. **Built:** the reconciler uses `<persona id>@<environment>` from the run. Two
  personas with the same attributes count as two audiences (stricter, never wrong).

## F-13 A screen's epoch is the set of builds of its latest visit (T035), 2026-10-19

- **What**: design § 6.7 gives a screen's current epoch as "the latest epochs of the scopes mounted
  on its members". **Built:** coverage compares the build set (scope = build, every scope) of each
  run's last visit of the screen with that of the screen's latest visit; `build_epochs` per scope
  are still computed and stored for display and rules. A build change in a scope the screen does
  not use still starts a new epoch for it (a stricter reading; coverage then says `untested`
  until a run looks again).

## F-14 Model screens beside the crawler's screens; coverage folded into action classes (T030), 2026-10-19

- **What**: design § 6.8 rebuilds `screens` as the model's registry. The crawler writes `screens`
  at crawl time (route + cluster, revisions r1, r2…) and the dashboard reads them on most pages.
  **Built:** migration 0030 adds `model_screens` (keys `SC-0001`…) with `screen_members` and
  `screen_lineage`; `screens` stays the crawl-time provisional assignment the explorer uses. Coverage
  (status and absent streak per audience) lives on `action_classes` (`status`, `streak_json`), not a
  separate `action_coverage` table: the reconciler recomputes it from Layer A each time.
- **Later** (M2 dashboard): Map and Screens read `model_screens`; F-01@038's seeding moves to
  `screen_members` (T038).

## F-15 The miner takes the observation table as JSON (T061), 2026-10-19

- **What**: design § 11.2 has the miner read the store and build the observation tables itself.
  The snapshot logic (journeys, branch points, missing values) is TypeScript (`snapshotAt`), and
  rebuilding it in Python would make two implementations to keep equal. **Built:**
  `pathfinder-miner rules --in <table.json>` takes one decision point's rows (features + target)
  and returns the decision table; `communities --in <graph.json>` takes the weighted screen graph.
  The miner still never writes the store. Also: rules with the same outcome that differ only in
  one category feature covering every value seen are merged (design § 11.3 step 2); without it
  the tree's split order showed as two exit rules.
- **Order of rules**: `classify` runs R6 and R8 for their own deviation kinds first, then R1, R2,
  R3, R7, R4 and R5 (R7 before R4: same-audience target changes are decision points, other-audience
  ones go to the R4 replays).

## F-16 Bug: the asset recorder threw on a pop-up's first request (T015), 2026-10-19

- **What**: the gate F-04@020 (a pop-up window opens a URL) raised three uncaught errors:
  `Request.frame()` throws for a navigation request issued before its frame exists, a case the
  crawler's own docs name (spec 020). The tests passed, but vitest exits 1 on unhandled errors.
  **Fixed:** the recorder skips a request whose frame is not there yet.
- **Test idea**: a unit test of `recordAssets` with a fake context emitting such a response; the
  pop-up gate already covers it end to end.

## F-17 M3 as built: what waits for the headless driver (T050–T056), 2026-10-19

- **What**: the reconciler now records deviations between consecutive model versions and classifies
  them (`interpret-writer.ts`): R2 drift, R6 removal / replacement and R7 decision points decide
  from stored evidence; derived facts are confirmed by the reconciler with their rule as the reason.
  Rules that need replays (R1, R4, R5, R8) leave the deviation `waiting_test`: the headless driver
  that would run them (T021) is not built, so no planner marks are written yet. A deviation no rule
  decides stays `open`: that is the agent's queue (no `ambiguous` hypothesis is written for it, so
  no hypothesis exists without a rule or an author).
- **Not yet**: `schemaChanged` (R3) and `presentForOtherAudience` (R6) are always false (they need
  the endpoint-schema history and per-audience coverage of the reference visit); the first version
  of a portal records no deviations (everything is new). `reconciliations` and `rule_candidates`
  are not dropped yet: their readers (BA tools, Review, crawler `add_rule_candidate`) move with the
  BA guidance, which waits for the owner's R-77 review (Q-1).
- **Overturns bind**: deviations are unique per subject, so an overturned or rejected claim is never
  written again for the same deviation.
- **Clock note**: hypothesis events are ordered by `at` (wall clock); a WSL clock jump between a
  reconcile and a person's decision would misorder them (`wsl-clock-jumps`). Test idea: a decision
  stamped before the fact it decides is refused.

## F-18 A mined threshold is only as sharp as the data's gap (T061–T063), 2026-10-19

- **What**: the real miner on eleven executions (drivers aged 14–16 refused, 19–51 priced) found
  `< 22`, not `< 18`: no driver between 17 and 26 was seen, so any cut in that gap fits every row,
  and the tree takes its middle. This is why design § 11.5 tests rules at their boundaries; the
  tests at 21, 22, 23 refute `< 22` (21 is priced), and re-mining with those rows converges.
- **Improvement** (not built): have the miner report the gap around each numeric cut
  (`[17, 26)` here) and probe inside it by bisection: two or three replays find the real threshold
  instead of three tests per iteration. Needs the headless driver (T021).
- **Test**: `rule-mining.test.ts` "the real miner (PF_MINER=1)": the cut lies in (17, 26].
- **Built in M4 so far**: `observationTables` (decision points, snapshots, derived ages),
  `loadObservationTables`, `importMinedRule` (Zod-validated, `decision_rule` by R7 waiting for a
  person, boundary tests as `hypothesis_tests`, recorded once), `pnpm model:mine`. Not yet: running
  the boundary tests (driver), the regression suites, drift on a new epoch, DMN in the export.
