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
