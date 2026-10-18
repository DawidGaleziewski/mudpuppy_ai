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
