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
- **Answered 2026-10-20**: rename. Done in T110, see F-29.

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

## F-19 Process proposals reuse grouping suggestions, before 0036 (T071–T072), 2026-10-19

- **What**: design § 13 stores correlation ids, process instances and triggers (migration 0036,
  T070). **Built first, without 0036:** `processGraph` computes the weighted screen graph on read
  (correlation ids from the masked `network_calls` samples, hashed, never stored; scopes from
  `observation_builds`; endpoint families; form chains; direct non-global transitions), Leiden
  cuts it (`pnpm model:propose`, apps/miner), and each community of two or more screens becomes an
  open `grouping_suggestions` row (the Processes page and the chat's accept flow already read
  them). Steps start at the screen reached from outside the community, then breadth first; each
  screen is shown by its first page version. A set already suggested or dismissed is skipped
  (`screens_key`, FR-007@029).
- **Gaps**: samples are recorded only outside production (spec 034), so on production the
  correlation weight is 0 and the graph leans on links and families. A dismissed set blocks only
  the same set: Leiden returning one screen more proposes it again (human edits as constraints
  are T072's open part). The name is the start screen's title; naming proposals are the chat's
  (T077).
- **Test**: `process-proposals.test.ts` (graph, flow order, once, dismissed); with `PF_MINER=1` the
  real Leiden keeps the form and its two outcomes together. Eval idea: the grouping eval (spec 038)
  scored on `model:propose` output against the reference portal's ground truth.

## F-20 The headless driver as built: replay runs, not `mode = 'probe'` (T021, T063), 2026-10-19

- **What**: design § 9 makes driver runs `runs.mode = 'probe'`. "Probe run" already names the
  spec 032 run that probes marked form steps (`start_run probe_marked`, the dashboard's wording).
  **Built:** a `replay` run choice (`start_run replay: {inputs}`, kept in `config_snapshot.choices`
  like `probe`): a new map run; its results list each action's model element key; map-mode
  autofill types the replay's inputs (by attribute name, `input.<attribute>`) before the persona's
  test data; its transitions carry `driver = 'headless'`; it finishes without draining the
  frontier. `replay-driver.ts` walks a plan (start URL, element keys of the clicks and submits);
  a step it cannot find again ends it `diverged`, and the test is `inconclusive`, never `fail`.
  `pnpm model:replay` plans the untested boundary tests (the latest execution of the decision
  point is the path; fills are not replayed as steps, autofill types them at the submit), runs at
  most `replayBudget` of them, and judges: a failed test refutes the rule, passing tests support it
  (a person still confirms). The tool's `replay` field says "never set it" to the agent.
- **Ages and the portal's day**: a test's age becomes a birth date half a year past the birthday on
  "today". The reference portal counts ages from a fixed day (`TODAY` = 2026-01-15), so
  `model:replay --today` exists; the observation table counts ages from the capture day, so on
  that portal a mined threshold is off by up to a year until the boundary tests correct it. A real
  portal counts from the real day. Test idea: a scenario whose rule depends on the date.
- **Not yet**: the prefix cache, checkpoint starts and logged-in reuse (each test is one fresh run;
  the e2e test's eight runs took about 4.4 s on the reference portal), the replays of rules R1, R4, R5 and R8 (their
  deviations stay `waiting_test`), probe suites for owner review, regression suites. One reconcile
  per finished replay run (complete-run does it): fine at 20 tests, worth batching later (R-24).
- **Owner question (morning)**: keep the name "replay run", or rename spec 032's probe runs and
  use `mode = 'probe'` as the design says?
- **Answered 2026-10-20**: the design's naming. Done in T116, see F-30.
- **Test**: `replay-driver.e2e.test.ts` (four replays make the decision point, the rule "under 18"
  is supported by its tests at 17, 18 and 19, every transition headless); `replay-tests.test.ts`
  (plans, supported, the F-18 gap rule refuted at 21, diverged = inconclusive); `replay-inputs.test.ts`.

## F-21 Bug: map-mode inputs were invisible to decision mining (T060), 2026-10-19

- **What**: map-mode autofill fills the form at its submit, so its writes share the submit's seq.
  `snapshotAt` read only writes below the transition's seq, so a real run's observation table had
  no `input.*` features at all (the store tests had written inputs one seq earlier and passed).
  Found by the first end-to-end replay. **Fixed:** inputs the transition itself typed count for it;
  shown values at that seq (what it revealed) still do not.
- **Test**: `capture.test.ts` "counts what the transition itself typed, not what it showed";
  `replay-driver.e2e.test.ts` reads the typed dates back from the table. Eval idea: seed the store
  tests from a recorded run instead of hand-written rows, so capture and mining meet in one test.

## F-22 Rule R1 as built, and the runtime's own retries (T052, T058), 2026-10-19

- **What**: a deviation whose new result is `technical_error` or `timeout` waits for R1. `pnpm
  model:replay` now runs R1 first: the latest execution of the failing step is walked twice in
  fresh replay runs with the inputs it typed (`pendingErrorReplays`), and `classify` decides with
  their step results (`resolveErrorReplays`): any success → `flaky`, derived (deviation
  explained); all fail → `deterministic_error` for a person (deviation open). A replay that never
  reached the step counts as no result; with none the deviation keeps waiting. R1 and boundary
  tests share one budget (R1 first: two runs per deviation).
- **Context**: R1 runs first in `classify`, so its rule context is built from the deviation alone
  (`sameEpochAndAudience` true, no build change); the other fields matter only to later rules.
- **Overlap with spec 030**: the runtime already re-opens a page showing a 5xx or a short
  technical-error text twice before observing it (`transient.ts`, SC-17). A flaky page is usually
  absorbed there and never becomes a deviation; R1 sees the errors that survived those re-opens,
  so `flaky` will be rare and mostly mean "fails in bursts". Not changed: the BA's documentation
  depends on error pages not becoming screens.
- **Scenario**: `deterministic-error` built (the vehicle form answers 500 when the model is
  "Błąd"; a short error body, so the soft-error detector reads it). Flaky not built: a random 20 %
  failure is not a deterministic gate, and the re-opens absorb it anyway.
- **Test**: `error-replay.e2e.test.ts` (a good and a failing run make the deviation, two replays
  fail, `deterministic_error` R1 for a person, nothing waits afterwards); `error-replays.test.ts`
  (plan, flaky derived, diverged replays keep waiting).

## F-23 Bug: R6 looked only at the version an action went missing in (T052, T058), 2026-10-19

- **What**: an action goes missing only after two runs in a row miss it (`absentRunsForMissing`),
  so its `missing_action` deviation lands one or more model versions after the change. R6 read
  the change from that version alone, which broke both of its derived answers (found by reading
  the code while building the scenarios):
  - **Removed by a release**: "build changed?" compared the screen's last two visits. Both are
    after the release, so the builds are equal and the answer was "removed, a person decides".
  - **Renamed in place**: "a new action connects the same screens?" looked only at this version's
    deviations. The renamed button appeared one version earlier, so the answer was "removed, a
    person decides" here too.
- **Fixed**: a missing action's reference visit is the latest visit of a page version that still
  shows its element key (`state_components.element_keys`). The new-action check also takes the
  screen's `new_action` deviations of earlier versions (an action with another element key whose
  transition reaches a target the missing one reached).
- **Also**: a rename is one change. When R6 derives `replaces`, the new element's open
  `new_action` deviations are set `explained` too, so the What changed page does not show it under
  "needs you" next to the derived fact (the hypothesis still points at the missing action only).
- **Scenarios built**: `removed-link` (a release drops the home page's "Przedłuż polisę" shortcut;
  the menu's links were not used, they are global) and `renamed-button` (the vehicle form's
  "Dalej" becomes "Przejdź dalej", same release).
- **Test**: `absence.e2e.test.ts`, both scenarios end to end on replay runs (removed → `removed`
  R6 derived; renamed → `replaces` R6 derived).

## F-24 Bug: one element, two action classes, once it was seen and then pressed (T034, T051), 2026-10-19

- **What**: an element only seen on a page gets the placeholder kind `click`; once pressed, its
  class takes the kind the press recorded (a form's button: `submit`). The reconciler then stopped
  producing the `click` class, but the store kept its row (stale, still `active`), and the next
  version reported the `submit` class as a **new action**. Every first press of a button an
  earlier run had only seen raised a deviation nobody can explain (it went to "needs you").
  Found by the renamed-button test, which saw two `new_action` rows for one button.
- **Fixed**: `deviationsBetween` reports a new action only for an element (screen + element key)
  the previous version did not have under any kind; the writer folds the placeholder row into the
  real class (deviations and entity refs move to it, the row goes unless a transition hangs on it).
- **Design note**: classes are keyed (screen, element key, kind) as design § 6.5 says; kind is
  really a property of the element, and the placeholder exists only because presence carries no
  kind. Capturing each action's kind with its element key (the issued action knows it) would
  remove the placeholder; not done.
- **Test**: `interpret.test.ts` "an element seen before under another kind is not a new action";
  `absence.e2e.test.ts` checks one `submit` class for the renamed button.

## F-25 Decision drift as built: regression rounds without a new column (T063, T066), 2026-10-19

- **What**: design § 11.6 reruns a confirmed rule's regression suite on a new build epoch of its
  decision screen, weekly, or by `pnpm model:regress`. **Built:** `queueRegressions` copies the
  rule's passed boundary tests as new `hypothesis_tests` rows when the screen's latest visit shows
  another build set than at the last round (or for every confirmed rule with `--regress`). A
  regression test is a test row created after the rule's confirmation, so no `purpose` column was
  added. A confirmed rule is never refuted by a replay (the lifecycle forbids it): its failed
  regression test becomes one `rule_mismatch` deviation per rule (`recordRuleMismatches`), R8
  replays the failing test once (`pendingMismatchReplays`, `resolveRuleMismatch`): reproduced →
  `decision_drift`, derived, and the rule is superseded with the drift's key as the reason; not
  reproduced → `flaky`. `replayPortal` runs R1, R8, then the tests, then R8 again for mismatches
  the round found.
- **Not done**: the weekly schedule (no scheduler in the repo; `pnpm model:regress` by hand);
  re-mining after a drift (run `pnpm model:mine`: the new epoch's executions form a new table,
  three replay rows may say "needs data"); a rule superseded by drift is not linked to its
  successor rule (`superseded_by` stays empty until re-mining writes one).
- **Scenario `rule-drift`**: a release raises the minimum driver age to 21 in the date field's
  `max` (the browser refuses the submit; the server still says 18, so the scenario is client-side
  only). A real drift in the backend would show the same way at the decision point.
- **Test fixture note**: replays start from recorded absolute URLs, so the e2e test restarts the
  reference portal on the same port for the release (the Deployment test uses a fresh port and
  only navigates). On a real portal the origin does not move.
- **Test**: `regressions.test.ts` (queue on release / `--regress`, a passing round keeps the rule,
  the drift to 21 superseded via R8, a non-reproducing mismatch is flaky); `rule-drift.e2e.test.ts`
  end to end on the reference portal.

## F-26 Bug: a form whose fields each sit in a paragraph collapsed to one field (T013), 2026-10-19

- **What**: F-02 made "a subtree holding more than text" row-like, so it collapses when it repeats.
  A form that wraps each field in its own paragraph (`<p><label/><input/></p>`, the reference
  portal's own pattern) is a run of equal subtrees: with two or more fields of the same type, they
  collapsed into one nameless row and the field names left identity. Sections 1, 2, 4 and 5 of
  the numbered-sections scenario (different forms, all text fields) were one state. The
  Deployment test passed only because its new field sat next to fields of other types: a text
  field added next to another text field would not have been seen.
- **Fixed**: siblings join a repeated run only when their form fields (textbox, combobox,
  checkbox, radio, spinbutton, slider, switch, searchbox, listbox) carry the same names. Driver
  rows that each ask for a name and a year still collapse; product cards (no fields) still collapse.
- **Test**: `structure.test.ts` "a form whose fields each sit in a paragraph keeps its fields";
  "rows that ask for the same fields still collapse"; `model-structure.e2e.test.ts`.
- **Snapshots updated on purpose** (diffs read): the reference portal's fingerprint snapshot
  changes for exactly its five pages with forms (`/porownanie`, `/porownanie/wynik`,
  `/kalkulator/pojazd`, `/kontakt`, `/logowanie`), the 19 screens stay distinct; the pipeline golden
  trace changes only cluster ids (named after the fingerprint), every similarity and decision equal.

## F-27 Form field names are structure; identity parameters need them (T013, T033), 2026-10-19

- **What**: the structure component (`state_components.structure_hash`) was roles and levels
  only. Parameter roles (design § 6.4) call a parameter `identity` when its values' structures
  never overlap, so two sections that ask for different things in the same shape (two text
  fields: name and surname, e-mail and phone) overlapped, `/sekcja/:param` stayed `data`, and the
  shared layout put both forms into one screen by MinHash similarity. **Changed:** the structure
  text names form fields (masked), as the MinHash shingles already did; item text stays out, so a
  product id is still `data`. All structure hashes of pages with forms changed (data is disposable).
- **Also seen**: identity needs each value seen twice (by design); one scan of six sections gives
  `data`. The τ calibration (T037) and pair labels remain the answer for different forms on the
  same route without a parameter.
- **Test**: `model-structure.e2e.test.ts`: six sections over two scans are six screens
  (`/sekcja/1` … `/sekcja/6`, `path:2` identity); driver rows stay one screen with `query:n` data.

## F-28 τ calibration as built (T037), 2026-10-19

- **What**: design § 6.1 calibrates τ from a person's pair labels. **Built:** clone and near
  duplicate count as "same screen", distinct as not; once each side has `labelsToCalibrate` (30)
  labels, the sweep (0.50–0.99, step 0.01) picks the τ with the best F1 for "same screen", ties to
  the higher τ (it merges less; a wrong merge hides a screen, a wrong split only shows it twice).
  The reconciler then clusters with it automatically and writes it on the model version
  (`threshold`); before that the default 0.9. Labels also stay must-link / cannot-link
  constraints, as before.
- **Queue**: unlabelled pairs of page versions on one route template within 0.05 of τ, nearest
  first, each with the model's current answer (one screen or two). `pnpm model:pairs` prints it;
  `pnpm model:decide label` answers. The queue compares every pair of a route (fine for the
  reference portal; a route with hundreds of versions wants the LSH candidates instead).
- **Owner question**: switch to the calibrated τ automatically (built), or show it and let a
  person accept it?
- **Test**: `calibration.test.ts` (waits for labels, perfect separation picks the higher τ,
  overlap picks the best F1, queue order); `model-calibration.test.ts` (route pairs, label drops
  a pair, default τ until enough labels).

## F-29 Tables renamed to the design's names (T110), 2026-10-20

- **What**: owner answer 2 (2026-10-20) reverses F-06. Migration **0032_transitions_observations**
  renames `edges` → `transitions` and `page_visits` → `observations`, and every column naming them:
  `edge_id` → `transition_id` (network calls, observations, trace steps, probe outcomes, entity
  refs), `from_visit_id` → `from_observation_id`, `page_visit_id` → `observation_id`,
  `first_/last_seen_edge_id` → `first_/last_seen_transition_id`, `first_/last_visit_id` →
  `first_/last_observation_id`. The evidence and mark kinds `edge` / `page_visit` became
  `transition` / `observation` (both tables rebuilt, rows mapped), and so did the BA's
  `get_evidence` kind, `get_run_evidence` kinds (`transitions`, `observations`), `list_runs`
  counts, `about_ref` kinds, data-item sightings, the plan's `target_transition_id`, the trace
  phase `record_observation` and event `observation`, and `finish_run`'s coverage key
  `item_pages_visited` (was `item_page_visits`, so a grep for the old table name stays clean).
  Zod `Transition`, `TransitionStatus`, `Observation`, `ObservationVia`; Kysely
  `TransitionsTable`, `ObservationsTable`; dashboard `Transition`, `Observation`.
- **Naming rule applied** ("only when the same term would mean two things, rename the other
  side"): the crawler's network drain type `Observation` became `NetworkObservation`, and the BA
  access matrix's local `Observation` became `ScreenSighting`. "Edges" of drawn graphs (the
  Map, Leiden's boundary graph, the miner) keep the word: a line in a picture, not the table.
- **Kept on purpose**: migrations 0001–0031 and their tests (history), the roadmap and old specs.
- **Snapshots updated on purpose** (diffs read): pipeline golden map/trace and trace golden
  change only the renamed names (`record_observation`, `observation`, `transition_id`,
  `same_as_transition_id`, `transitions`, `item_pages_visited`).
- **Test**: `db.test.ts` (0032 up, down, up on every round trip); `pnpm test:slow`; a grep for
  `page_visits|edge_id|FROM edges` over code returns only history.

## F-30 "Probe run" means the headless driver's run (T116), 2026-10-20

- **What**: owner answer 6 reverses F-20's naming. **The driver's runs** are `runs.mode = 'probe'`
  (`RunMode` gained `probe`): `start_run` takes `mode: 'probe'` exactly when it takes `replay
  {inputs}` (either alone is `SCHEMA_INVALID`); one replayed path inside such a run stays "a
  replay" (`replay_budget`). The dashboard's scan list calls them "Probe run". **Spec 032's run**
  becomes **form probing**: `start_run` / `request_scan` `probe_marked` → `form_probing`,
  `config_snapshot.choices.probe` → `choices.form_probing`, `RunState.isProbe` → `isFormProbing`,
  "probe scan/run" → "form-probing scan/run" in tools, the crawler and orchestrator prompts,
  `ba-practice`, docs and glossary (entry `form-probing-scan`, the headless driver's entry says
  "probe run"). The eval's condition `probe_scan` → `form_probing` (`--no-form-probing`); trial files
  written before keep `probe_scan` and are read under the new name (`EvalResult` preprocess), so the
  v1 history stays comparable.
- **Kept on purpose** (the designer's words, no second meaning): a *probe* (one try of the
  catalogue), the *Probe* mark and `probe_marks`, `probe_form`, `probe_outcomes`, probe suites,
  `NO_PROBE_MARKS` / `PROBE_NOT_ASKED`, the "Probe forms" run type.
- **Not yet** (as before, F-20): one probe run per replay; the design's single run consuming
  planner marks within its budget waits for T075 / the prefix cache.
- **Test (F-30)**: `start-run.test.ts` "a probe run is mode probe with a replay, and only that";
  `results.test.ts` "reads a trial written before spec 039 T116"; the replay e2e tests start
  `mode: 'probe'`.

## F-31 Fingerprint profiles and the accepted τ as built (T111–T115), 2026-10-20

- **What** (owner answers 3 and 7): the rules of `structure.ts` / `fingerprint.ts` are a
  `FingerprintRules` profile (`row_roles`, `field_roles`, `named_roles`, `ignore_names_in`,
  `cluster_threshold`); the built-in `rows-v2` is exactly the behaviour before (every snapshot test
  unchanged). `portal.yaml` `fingerprint: { use, profiles }` (each `extends` a built-in or another
  profile); an unknown name or a cycle refuses the portal. The run's profile drives the level-1
  fingerprint, the components, the run's `FingerprintIndex` threshold and the seeded clusters.
  **`ignore_names_in`** means: inside such a container names count for nothing and any equal
  siblings collapse (not only row-like ones), so a menu that gains or loses a plain link is the
  same text; its shingles drop the names too.
- **Recorded (T112, migration 0033)**: `fingerprint_profiles (portal_id, id = name@<8 hex>,
  rules_json)`, `observations.fingerprint_profile`, `state_components.profile`,
  `model_versions.fingerprint_profile` (NULL = rows-v2, read as `LEGACY_PROFILE`). The reconciler
  clusters the states of **one** profile (asked, else the latest observation's) and writes it on
  the version; a different profile than the last version's makes a new version.
- **Re-fingerprint (T113)**: `pnpm model:refingerprint` recomputes `state_components` under a
  profile from `states.evidence_ref` and rebuilds the model; it refuses while a snapshot is gone.
  **Limit found:** a state keeps one snapshot (its first sighting), and pages that were one state
  under the capture profile share it, so a re-fingerprint can only merge screens, never split one;
  a profile finer than the capture's needs a new scan (said in `docs/portal-config.md`). `pnpm
  model:compare-fingerprints a b` clusters the stored snapshots under both and prints the screens
  merged or split differently (`comparePartitions` in `@pathfinder/model`).
- **Scenario (T114)**: `menu-link` adds "Zaloguj się" to the main menu of every page. The reference
  menu is a `<ul>` of `<li>`, so rows-v2 already collapses it: both rows-v2 and `no-menu` keep
  every screen (`menu-link.e2e.test.ts`). A menu of plain links or buttons (no list) is where the
  profiles differ (`profile.test.ts`, `refingerprint.test.ts`: rows-v2 two screens, no-menu one).
- **τ (T115, R-82)**: the reconciler clusters with the τ a person accepted for the portal and
  profile (`tau_acceptances`, latest wins; `pnpm model:decide … accept-tau`, refused until the
  labels calibrate one), else the profile's `cluster_threshold`. The calibration (F-28) is only a
  proposal now: `pnpm model:pairs` prints it with the τ in force. What changed shows τ, the profile
  and who accepted it; accepting from the page waits for the designer's pages (T100) and a chat
  service route. An acceptance moves the decision watermark, so the next reconcile writes a version.
- **Test**: `profile.test.ts`, `fingerprint-profiles.test.ts` (config), `model-calibration.test.ts`,
  `model-writer.test.ts` "clusters one fingerprint profile only", `refingerprint.test.ts`,
  `partitions.test.ts`, `menu-link.e2e.test.ts`, dashboard `test_changes.py` threshold test.
  Eval idea: run the reference-insurer trial under `no-menu` and compare screens with rows-v2.

## F-32 Process start, the trigger step and the v1 claim tables (T081, T076), 2026-10-20

- **Trigger (T081, R-77 (3))**: the crawler marks the `act` that enters the process with
  `trigger: true`; the server stores the step's ord in `processes.trigger_ord` (migration 0034,
  first mark wins). `get_process` / `list_processes` return it, and the process export starts the
  trace walk at the screen that step opened (`traceWalk` in `process-export/steps.ts`), before the
  "first contained screen" rule (F-15@034). A trace without the mark behaves as before.
- **Guidance (T076, R-77 (1))**: `ba-practice` pass 3 opens with "What a process is" (goal,
  trigger, own first screen, outcome; start, end, one process per goal); `ba.md` says the same in
  one rule; `record-kinds.md` limits `process contains screen`. Confirmed `decision_rule`
  hypotheses become business rules, confirmed `process_boundary` ones set the first or last
  contained screen. **Not done:** the `api_endpoint` row (R-77 (4)) needs the parked 038b branch.
- **v1 claim tables dropped (migration 0035)**: `reconciliations` and `rule_candidates` are gone,
  and with them the evidence kind `rule_candidate` (links citing one are dropped; store data is
  test data), `get_run_evidence` kind `rule_candidates`, the run counts, the chat route
  `POST /portals/{p}/reconciliations/{id}/confirm`, Review ▸ Differing states (nothing can be
  confirmed there now; it would wait in the Review count for ever) and the rule-candidate counts on
  the portal cards and the run header. `queries_differing.py` and the BA service
  `differing-states.ts` stay (SC-20 gate, the shared fixture); the processes and changes pages
  (T079/T100) may show the groups again, explained by hypotheses. The eval diagnostic
  `error_pages_as_steps` counts only `technical` states now; the owner's spec 033 verdicts
  (temporary) went with the table. Eval idea: count steps on states a confirmed `flaky` or
  `deterministic_error` hypothesis cites instead.
- **Test**: `process-export.test.ts` (trigger start), `trace-run.e2e.test.ts` (mark, second mark
  ignored), the migration round-trips in `db.test.ts`.
- **Eval check (T082, R-77 (2))**: the export-quality grader adds `export_wrong_start` and
  `export_wrong_end` (must be 0). The end accepts a step past `last_observable_route` that is in
  the ground truth's steps: P01 ends in a mutation, and the approved export rightly shows the
  purchase step. The approved reference export scores wrong start 1 (the home page, F-15@034),
  wrong end 0. Not run: the "several trials" part costs money and waits for the owner.

## F-41 The M1 capture gate (T023), 2026-10-20

- `captureInvariants` (store) lists the rows that break the plan's M1 rules: observations without
  a build (an `unknown` build counts as one), executed scan transitions outside a journey,
  journeys whose transitions are not numbered 1..n, fills and selects without their input
  attribute write, trace steps that pressed or typed without the transition they document.
- Gate `F-41@039` (last in `insurer.test.ts`) reads everything the insurer gates recorded (a map
  run with fills, a trace, a form-probing run) and expects no violation: it holds. The slow tier
  was green on the whole branch just before (e2e 70, gates 170, perf).
- **Not done**: the milestone tags (`v2.0.0-m1` …) were not set; tagging the feature branch is
  left to the owner (the plan merges 2.0 as one `v2.0.0`).
- Eval idea: run `captureInvariants` after every eval trial and count violations (must be 0).

## F-40 The similarity classifier as built (T090), 2026-10-20

- **Features** (`pairFeatures`, model): MinHash similarity, equal structure, content, overlay,
  calls and mounts hashes, and the Jaccard of the element keys (7, `PAIR_FEATURES`).
- **Training** (`pathfinder-miner classify`): a logistic regression (random_state 0) on the
  labelled pairs (`state_pair_labels`: clone and near-duplicate = one screen, distinct = two);
  every fifth pair by pair id is held out. It reports the held-out F1 of detecting distinct pairs
  for the classifier (P(same) < 0.5) and for τ (MinHash < τ), and the weights trained on all
  pairs. `pnpm model:classify` records it (migration 0038, `similarity_classifiers`).
- **Switch**: the reconciler clusters with the latest training's classifier when it beat τ
  (distance = 1 − P(same), merge below 0.5); otherwise with τ. A training moves the decision
  watermark, so the next reconcile writes a version. **Decision taken here**: the switch is
  automatic (FR-050 says "replaces τ when it beats it"), unlike τ, which a person accepts (T115);
  owner question whether a person should accept the classifier too.
- **M6 gate not run**: it needs real labels (the switchboard ground truth plus owner labels);
  `pnpm model:pairs` makes the queue. No tag set.
- **Test**: `test_classify.py` (miner), `classifier.test.ts` (model: features, clustering by the
  classifier), `similarity-classifier.test.ts` (store).

## F-39 The chat orchestrator and the model as built (T077), 2026-10-20

- New chat tools (`mcp-model-tools.ts`): `list_process_proposals` and `name_proposal` (the open
  grouping suggestions `pnpm model:propose` writes get the business name and a reason; the person
  still accepts them in Processes), `reconcile_model` (rebuild, no browser) and `model_actions`
  (error replays, rule tests and unexplored processes waiting, with the command the owner runs).
  Changes and hypotheses are read with the BA server's `list_deviations` / `get_hypothesis`
  (already in the orchestrator's tools since T055), so the chat has no copy of them.
- **Decision**: probe runs are not started from the chat. They drive a browser and spend a replay
  budget, and the chat service is not run on this branch; the assistant proposes the command.
  Starting them as a chat action (a button the owner presses) is an owner question for T100.
- **Test**: `mcp-chat.test.ts` (contract list, naming, model actions, reconcile).

## F-38 The model in the process export as built (T078), 2026-10-20

- `processModelFacts` (store) gives a process's model version, its triggers (screen pressed on,
  element, times), outcomes and trace variants of its instances, the bound of its latest
  exploration, and the decision rules on its screens in an exported status (supported, confirmed)
  as DMN XML. The process export adds a README section "The process in the portal model", a
  `model` block in `process.json` and `rules/<H-key>.dmn` per rule. A PROC record's export reads
  its own process (`doc_records.process_id`); a PRC export the process itself.
- **Not done**: "contracts by schema hash" (CONTRACTS.md still groups per endpoint and attempt).
- **Test**: `process-facts.test.ts` (store; `addRule` split out of `withRule` so the process seed
  can carry the rule).

## F-37 Exploring a process as built (T075), 2026-10-20

- `explorationPlan` (store) turns the stopping rule into replays: depth-1 gaps (an action class of
  a member screen a persona never pressed), depth-2 gaps (a class then one on its target, never
  back to back) and `randomWalks` (model, seeded, inside the process, from the start screen).
  Each replay starts from the first recorded way of that persona onto the screen (a journey's
  first page or a transition into it, `journeyPath`). Fill, select and check classes are left
  out: the driver types through autofill at the submit. Audiences are the personas whose
  journeys reached a member screen, else the process's persona.
- `exploreProcess` (mcp-server) runs them on the headless driver; a pass where every gap had a
  replay is recorded in `process_explorations` with the deviations the model found meanwhile and
  the bound sentence ("Explored to depth 2 plus N random walks on builds …"). `unexploredProcesses`
  (priority 6) lists processes with no pass on the current build epochs without new deviations;
  `pnpm model:explore <portal>` explores them all.
- **Not done**: the planner does not write priority-6 marks (no store planner exists yet for any
  priority); inputs are not sampled from observed values (autofill types the persona's test data);
  gaps no recorded journey leads to are only reported (`unreachable`, a focused map run).
  No browser test of `exploreProcess` yet (the store test covers the plan).
- **Test**: `exploration-dmn.test.ts` (walks), `process-exploration.test.ts` (plan, depth-1 gap of
  a second persona, priority 6).

## F-36 Anchors on entity_refs as built (T074), 2026-10-20

- **Migration 0037** adds `amendments.ref_id` (an `entity_refs` row: the model screen of the
  state the amendment was written on, and the anchor's element key) and backfills it for
  amendments on states that have a current screen. The chat service writes the anchor with every
  new amendment and a new one whenever a revision moves it (`amendment-revisions.ts`).
- **Review triggers** (`anchorReviews` in the model, `anchorReviewsOf` in the store): an anchored
  amendment needs a person only when a lineage row of the latest model version split, merged or
  retired its screen, or every action class on its element key is `not_seen_since`. A new member
  of the screen never triggers one. `reanchorAfterRun` (chat) uses this for anchored amendments
  and keeps the v1 fingerprint rule for those without an anchor. Lineage → `state_replaced`
  (via `state_ambiguous`), element → `element_removed`.
- **Limits**: an element that is not an action (a heading) has no action class, so its
  disappearance is not seen; "for every audience" is approximated by the action class status
  (the design's `action_coverage` table does not exist). v1's polymorphic `target_id` /
  `about_ref` columns are not dropped yet (design § 15 lists them; a wider refactor).
- **Test**: `anchors.test.ts` (model, store). No chat-level test of the model path yet (the
  existing reanchor tests run on stores without a model).

## F-35 Process instances as built (T073), 2026-10-20

- `processInstances` (model) walks each journey: a **trigger** is a non-global transition from a
  screen outside the process into its start screen; the walk ends with `error` (a
  `business_error` result), `abandoned` (global navigation), `exited` (a non-global move to a
  screen outside the process), or, when the journey ends, `completed` on a terminal member (no
  non-global model transition leads from it to another member) else `incomplete`. A journey can
  enter twice; each entry is an instance. `traceVariants` counts the distinct screen sequences.
- **Shape of a process** (store, `process-instances.ts`): the current model screens of A's
  states (latest A revision), the start screen = `start_screen_id`, else A's first screen.
  Archived processes and processes without A are skipped. Written on every reconcile that writes
  a version (`reconcilePortalModel` returns `instances`); trace variants are read with
  `processTraceVariants(portal, PRC key)` (screen keys).
- **Not done here**: `process_triggers` rows and `correlation_id` on instances (correlation ids
  are still computed on read, F-19); a journey that starts on the start screen by URL has no
  trigger transition and is not an instance (the schema needs a trigger) — a deep link into a
  process is an owner question.
- **Test**: `instances.test.ts` (model), `process-instances.test.ts` (store, on the threshold
  seed: a minor exits at the refusal page, an adult completes).

## F-34 One process concept as built (T070), 2026-10-20

- **Migration 0036** adds `correlation_ids`, `process_instances`, `process_triggers`,
  `process_explorations`, `ba_processes.start_screen_id` / `boundary_hypothesis_id` (the design's
  `screens` are `model_screens`), `doc_records.process_id` with a unique index per process and
  two triggers (insert, and an update of `kind` or `process_id`; an update of `latest_rev` does
  not fire, so records written before 0036 keep working), and renames `process_variants` /
  `process_variant_revisions` to `process_models` / `process_model_revisions`. The `variant_id`
  columns, the UI's "variant" wording and the `/variants/A` routes stay until the designer's
  pages (T100); the eval score `process_variants` (step variants) is a different thing and keeps
  its name. 0037 was not needed.
- **PROC ↔ PRC 1:1 in the BA path**: `create_record` for a `process` takes an optional
  `process_key` (a process a person accepted); without it the server opens a PRC for the record
  (source `new`, stage `scoped`, `record_key` set, no A yet). A process that has its record is
  refused (`PROCESS_DOCUMENTED`). "Open in Processes" builds A on the record's own process
  (`insertAsIs` in chat's `process-store.ts`), and the docs page offers it until A exists
  (`linked_process` needs an A). `processKeys` (portal export) no longer lists a documented PRC a
  second time.
- **Portal delete order**: Layer B now goes before the BA process tables (PROC records reference
  them). Dead error codes `GROUP_UNKNOWN` and `VERDICTS_INCOMPLETE` removed.
- **Test**: `ba-records.test.ts` (opened, linked, refused, the store trigger),
  `process-from-record.test.ts` (A built on the record's process), the migration round-trips.
  Bug class worth an eval: a BA that writes two PROC records for one process now gets
  `PROCESS_DOCUMENTED`; count those refusals per trial.

## F-33 Guard intersection as built (T064), 2026-10-20

- `guardConflicts` (`@pathfinder/model` `rules/guards.ts`) chains the decision rules screen by
  screen: from a decision point, each outcome screen leads to the decision points on it. Per path
  it keeps every combination of the rules that lead on (a disjunction per step), intersecting
  their conditions per attribute (numeric intervals with open or closed bounds, value sets);
  a path where no combination survives is a conflict. A path never re-enters a screen (a
  validation that stays on the page is not a path forward) and stops at its first conflict or at
  `MODEL_DEFAULTS.guardPathDepth` (6). Conditions it cannot read never conflict.
- **"Process paths"** are the model's decision-point chains, not a documented process's steps:
  process models (T070) do not exist yet. When they do, the chains can be cut to a process's
  screens.
- `writeGuardConflicts` (store) runs at the end of `pnpm model:mine` over the rules not refuted,
  rejected or superseded and writes one `ambiguous` hypothesis per new conflict (origin `rule`,
  R7, `needs_confirmation`, citing the rules on the path through `entity_refs`); the claim hash
  keeps it from being written twice. A person decides it (design § 10.3).
- **Test**: `guards.test.ts` (model), `rule-guards.test.ts` (store). Eval idea: an "overlapping
  rule" scenario where a later step's rule contradicts an earlier one; the grader counts the
  `ambiguous` hypotheses written.

## F-42 Bug: the M1 gate shipped without its eval-case entry (T023), 2026-10-21

- **Symptom**: `coverage.test.ts` ("gate ids name … indexed findings") failed on `F-41@039`.
  It runs in the gates project, so the commit hook's fast tier did not catch it, and the slow
  tier was not re-run after T023.
- **Fix**: spec 039's findings are indexed in `eval-cases.yaml` (F-01…F-42), and the spec is
  listed in `coverage.test.ts`. Every new spec 039 finding now needs its entry.
- **Test idea**: run `coverage.test.ts` in the fast tier; it is pure and needs no estate.

## F-43 Differing states removed; SC-20 proven on deviations (owner answer 3), 2026-10-21

- **What**: the owner chose to drop whatever was left of spec 033's differing states: the
  service `services/ba/differing-states.ts`, the dashboard's `queries_differing.py`, their shared
  fixture and tests, and the how-to-use row. Gate SC-20 (`scars-one-button-two-pages.test.ts`)
  now checks the portal model. The button that led to the offer and then to the sold-out page
  is one `target_mismatch` deviation, and every SC-19 probe outcome is a `decision_point`, never
  an unexplained mismatch.
- **Note**: R7 also makes SC-20's button a decision point, although no input differed. Rule
  mining finds no rule for it, so it stays with a person. The design's `nondeterministic` kind
  would say more. The idea: R7 asks for a replay with the same input first, and if the replay
  gets both targets, the kind is `nondeterministic`.
- **Test**: the SC-20 gate. Eval idea: count the SC-20-like deviations the BA explains as
  nondeterministic rather than as a rule.

## F-44 Owner answers 8, 10, 14 as built (migration 0039), 2026-10-21

- **8 (process models everywhere)**: in 2.0 "variant" means a screen variant (designer
  `12-v2-ux.md` § vocabulary). Under the naming rule, a process's A and B are **process models**
  in the columns (`model_id`, `model_rev`, `branched_from_model_id`, `left_/right_model_id`), the
  Zod and Pydantic models (`ProcessModel`, `ProcessModelRevision`), the chat API
  (`…/processes/{id}/models/{label}/…`, JSON key `model`), the dashboard (`?model=B`, status
  vocabulary `process_model`, the page words), the glossary (`process-model`,
  `live-process-model`) and how-to-use. "Variant" keeps three other senses: a persona's screen
  variant (Access), a probe-suite variant, and a process record's trace-run variants.
- **10 (deep links)**: `process_instances.trigger_kind` is `transition` or `deep_link`. A deep
  link is the first `navigate` observation of an `entry_url` journey (a typed URL starts a new
  journey). `checkpoint` (a `go_to_state` replay), `login` and `fresh_session` journeys are the
  crawler's way back to a page, so they never count. Observations are numbered per run and
  transitions per journey, so the deep link is placed before the journey's transitions (seq 0).
  A URL opened mid-walk away from the process ends it as `abandoned` (model; the store sends
  only first URLs). The process page and the export name the trigger "deep link".
- **14 (a person accepts the classifier)**: `similarity_classifiers.accepted_by/at`. The
  reconciler uses the latest accepted one. `pnpm model:decide … accept-classifier` refuses a
  training that did not beat τ, and a newer, worse training leaves the accepted one in force. The
  decision watermark follows `accepted_at`.
- **Test (F-44)**: `instances.test.ts` (model, deep links), `process-instances.test.ts` and
  `process-facts.test.ts` (store; the seed's j3/j6 now open the car page by URL),
  `similarity-classifier.test.ts`, `test_model_facts.py`, the migration round-trips. Eval idea:
  on a portal opened by URL, the grouping eval should count deep-link instances as entries, not
  as missing triggers.

## F-45 Typed references everywhere: owner answer 13 as built (migrations 0040–0041), 2026-10-21

- **0040**: `entity_refs` gains a column for every kind the BA cites (actions, forms, open
  questions, decisions, reviews, records, the trace's `processes` / `process_steps`, form steps),
  plus an `evidence_file`. An element key may go with a state (a screen region) as well as with a
  model screen (an anchor).
  - `doc_evidence_links` and `open_questions` hold a `ref_id` instead of `target_kind` /
    `target_id` / `region` and `about_ref`.
  - The view `doc_evidence` reads a link back in the BA's vocabulary. The BA tools still cite by
    kind and id, so their API is unchanged; `@pathfinder/store` `entity-refs.ts`
    (`insertEvidenceRef`, `addEvidenceLink`) is the one write path.
- **0041**:
  - An amendment and each of its revisions hold `ref_id`: a state, a state's element, or an
    evidence file. The 0037 model anchor is now `anchor_ref_id`. The views
    `amendments_with_target` and `amendment_revisions_with_target` read the target as the chat and
    the dashboard name it.
  - A mark names its target in a typed column (`form_step_id`, `state_id` or `transition_id`), so
    "one open mark per kind and target" stays a unique index.
  - A chat proposal names its `amendment_id` (NULL is a new amendment).
- **Deferred foreign keys**: the new `ref_id` foreign keys are `DEFERRABLE INITIALLY DEFERRED`.
  An open question cites a state through a ref and a ref can cite an open question, so a portal
  delete removes both inside its one transaction.
- **Gone as a result**:
  - The audit check `broken_link`, the export's "Broken evidence links" section (11.5; open
    questions are now 11.5) and the dashboard's "Broken link" status: a link can no longer point
    at nothing.
  - The fixtures' deliberately dangling links (REQ-002's gone form, the dashboard's
    `st-deleted`), and the two "store without process tables" tests: `entity_refs` references
    those tables, so such a store cannot exist.
  - Migrations 0040 and 0041 delete rows whose target was already gone, because v1 had no
    foreign key there; 2.0 store data is disposable.
- **Not moved**: `decision_log.subject_ref` and a few free-text references. They are log text, not
  links, and design § 15 does not list them.
- **Test**: the migration round-trips (db, probe-tables), `audit.test.ts` (a missing target is
  refused), the goldens regenerated (ids shift by one, since the fixture writes one more id per
  open question), the chat amendment, reanchor and proposal tests, and the dashboard fixtures (the
  test `insert()` helper writes refs for rows stated as kind and id). Eval idea: none. This is a
  storage change behind unchanged tool contracts, and the BA trials should score the same.

## F-46 Check runs and accepting τ from the pages: owner answers 5, 12, 19 as built, 2026-10-21

- **Check runs** (answers 12 and 19): the chat service's `check-runs.ts` starts
  `pnpm --dir apps/crawler model:replay|model:explore <portal> [PRC-…] --env <env>` in the
  background (detached, its output in `data/check-runs/<env>/<id>.log`). The lock file
  `<portal>.json` allows one check run per portal; a second start is refused (409
  `CHECK_RUN_BUSY`) while its process lives.
  - Started two ways: the dashboard's button (`POST /portals/{p}/check-runs`, signed with the
    reviewer; pressing it is the owner's yes), and the assistant's `start_check_run`. The tool
    needs `confirmed_by`, the owner's words; the orchestrator asks first and calls it only after a
    yes. `model_actions` now names the check runs waiting and the one running.
  - Buttons: "Explore now" in a process's "In the portal model" panel, and "Run the rule tests" on
    Rules. The check run's results reach the model on its next rebuild.
- **Accepting τ and the classifier** (answers 5 and 14): Settings ▸ Screen identity shows the τ in
  force (or the built-in default), the pair labels, and the latest classifier with its held-out
  F1 against τ's. Its buttons post to the chat service's `POST /portals/{p}/model/accept`
  (`acceptTau` / `acceptClassifier` in the store), which computes the calibration and refuses
  plainly when it is not ready. The CLI (`pnpm model:decide … accept-tau | accept-classifier`)
  does the same.
- **Not done**: the designer's "Same screen?" labelling page (G15); pairs are labelled with
  `pnpm model:pairs` / `model:decide … label` until it exists. A running check run is not shown
  on the pages beyond its note; `GET /portals/{p}/check-runs` answers it.
- **Test**: `check-runs.test.ts` (a fake spawn: the command and its environment, busy, a finished
  run frees the portal, refusals; the MCP tool with `confirmed_by`), `model-accept.test.ts`,
  `test_check_runs.py`, `test_settings_salvage.py`. Eval idea: in the orchestrator eval, an
  assistant that calls `start_check_run` without a yes from the owner in the transcript fails.

## F-47 Records cite hypotheses, rules go by the BR key: owner answer 18 (b), 2026-10-21

- **Decision** (Claude's pick until the owner says otherwise): a rule is called by its hypothesis
  key (H-nnnn) while it is only a hypothesis. Once a BA business rule record cites the hypothesis,
  the Rules list shows that record's BR key, and both keys open the rule page. The page says
  "Documented as BR-…", and the record's evidence links back to `/rules/<H-key>`.
- **Built**: the evidence target kind `hypothesis` (docs-model; run-bound exempt, never
  "observed"), with `lookupHypothesis` resolving by id or key within the portal. `entity_refs`
  `hypothesis` maps to `hypothesis_id`. Migration 0042 recreates the `doc_evidence` view with the
  hypothesis case. The ba-practice skill and the `target_id` description tell the BA to cite
  H-nnnn.
- **Seen on the way**: `rule-drift.e2e.test.ts` failed once under the full parallel mcp-server
  project and passed alone (load-sensitive, like the `serial` dashboard tests). It is watched in
  the close-out `pnpm test`, not changed here.
- **Test**: `evidence.test.ts` (resolves by key with a null run; unknown key is `UNKNOWN_REF`),
  `test_rules.py::test_a_documented_rule_goes_by_its_business_rule_key`. Eval idea: in a BA trial
  over a portal with confirmed mined rules, a business_rule record that restates a confirmed
  hypothesis without citing it counts as a miss (duplicate knowledge with no link).

## F-48 Changes and Before / after on today's read models (T100 step 5), 2026-10-21

- **Built** (owner answer 20: pages first): Changes as the designer's v2-02 and Before / after as
  v2-03, read-only.
  - **Range**: From / To pick model versions, not releases. Owner answer 17 rules out a release
    watch, and a model version is built after each scan.
  - **Release lanes** come from the latest model version's `build_epochs`: one lane per portal
    part, a rollout span where an epoch overlaps the previous one, dashed when the part has no
    marker, the scans under the lanes and the range as a bracket.
  - **The list** is grouped by process (the A head's screens), then screen; needs you first.
  - **Explanations** use the designer's words per hypothesis kind (Release, Flaky error,
    A/B test?, Part of a rename, Unexplained…).
  - **Before / after** compares the screen's variants, or its oldest and newest variant with the
    target before and after. What differs shows each side's latest visit: the release per part,
    the persona and the scan.
- **Changed on the way**:
  - The Decision rules and τ plates left Changes; they are on Rules and Settings ▸ Screen
    identity. The accepted-τ test moved to `test_identity.py`.
  - "Explained automatically" is now dashed `inferred`, not `ok`. The designer marks it as
    something a person can still overturn.
- **Seen on the way**:
  - The UI check failed the shared `picture.html` thumbnail with no picture (axe contrast and
    name mismatch). Before / after shows a plain line instead. The process pages still use the
    thumbnail: worth checking there (not changed here).
  - A segment group of three buttons overflowed at 390 px. `.mp-seg` now wraps.
  - `context_diff` on deviations is never written by the reconciler, so What differs reads the
    observations instead.
- **Not done**: Overturn (R-87), the decision bar on Before / after (decisions stay in Review and
  `pnpm model:decide`), Side by side / Overlay / Wireframe switch (one view: the recorded
  pictures), linked decisions ("Also settles"), bundles of many changes (×12), pagination for 500+
  changes.
- **Test**: `test_changes.py` (statuses and explanations, filters and range, grouping by process,
  release lanes with a rollout, Before / after with a differing release and Previous / Next, 404),
  `test_identity.py`; `ui:check` on the three pages at 1280 and 390: ok. Eval idea: none (a
  read-only page over the model).

## F-49 Review's 2.0 queue and tabs (T100 step 6), 2026-10-21

- **Built** (designer screens v2-04, v2-05, v2-16):
  - **Needs you** puts the portal model's groups first:
    - **Findings**: changes no rule explained, apart from rules and removals.
    - **Rules**: mined rules that are proposed, tested or broken, plus changes a rule decides.
    - **Removals**: actions gone without a release, with one **Confirm N** for the group (UX-R24).
    - **Processes**: open model proposals, decided on Processes.
    - Records, assumptions, differences, re-anchoring, proposals and suites follow.
  - **Explained automatically** lists the changes a rule explained (no Overturn: R-87).
  - **Decided** lists a person's confirmations and rejections, with their reasons as notes. A
    person is any event actor except the machine ones: reconciler, miner, replay, crawler,
    ba-agent.
  - The nav's Review count includes the four new groups.
- **Writes**: the chat service's `POST /portals/{p}/model/decide` takes `{keys, decision, by,
  reason}`. It decides all keys in one transaction: an unknown or refused key decides none and
  answers 409. The dashboard posts `/review/hypotheses/{portal}` signed with the reviewer. An
  empty reason on confirm becomes "Confirmed in Review." (the store requires one); a reject
  without a reason is refused before the call.
- **Changed on the way**: "All" shows only the groups with items. The empty ones are one line of
  links (v2-04); each group's own tab keeps its explanation. Two tests moved to the group tab.
- **Seen on the way**: a hypothesis with no events makes `decideHypothesis` throw `LifecycleError`,
  which reaches the HTTP layer as a 500, not a 409. Real hypotheses always have a `proposed`
  event, so only a bad fixture hits it. Worth turning into `ModelDecisionError` (not changed
  here).
- **Not done**: keyboard J/K/X/C/R on the queue, bulk selection beyond removals, Part and Age
  filters, linked decisions ("also settles"), Same screen? (v2-14, next), the Undo toast.
- **Test**: `test_review_queue.py` (groups and count, deciding a rule through the chat service,
  reject needs a reason, the tabs), `model-accept.test.ts` (decide: none decided when one key is
  unknown, reject two, empty reason and overturn refused); `ui:check` on the tabs at 1280 and 390:
  ok. Eval idea: none (a person's decisions).
