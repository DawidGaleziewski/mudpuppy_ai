# Findings 040 (MudPuppy 2.1)

Bugs, slips and design deviations found while building, each with a test or eval idea
(`log-every-bug-for-evals`). Newest last.

## F-01 A column with REFERENCES cannot be dropped (T010), 2026-10-22

- **What**: migration 0046's down step failed on `ALTER TABLE … DROP COLUMN undoes` while the
  column had `REFERENCES hypothesis_events(id)` (SQLite refuses to drop a foreign-key column).
- **Fix**: `undoes` keeps a CHECK but no REFERENCES; the store checks the link in `undoDecision`.
- **Test idea**: the migration round-trip test (up, down, up) already caught it; keep it for every
  migration that adds a column.

## F-02 Test assertion matched an element on every page (T010), 2026-10-22

- **What**: a dashboard test asserted `sy-toast` for the Undo toast, but the stale-connection toast
  is on every page, so it passed without the Undo toast.
- **Fix**: assert the Undo form's action (`/review/undo/`) instead.
- **Test idea**: assert on what only the new part has (its action, its id), never on a shared class.

## F-03 "Changed" and "Replaced" from one lifecycle status (T014), 2026-10-22

- **Built**: Rules show Changed (superseded with no newer rule: decision drift found by R8, mine it
  again) and Replaced (superseded with `superseded_by` set). The export says "changed: it no
  longer holds…" and adds "- Changed:", "- Decided:" and "- Undone:" lines from the lifecycle, a
  person's Reword in place of the mined sentence ("- Reworded:", "- As mined:"), and Copy Markdown.
- **Deviation**: nothing sets `hypotheses.superseded_by` yet, so every superseded rule is Changed
  until mining links the new rule to the old one (left for R-90). A Changed rule is not in Review:
  `superseded` is final, the action is to mine again, not to decide. "Evidence:" (a case) is still
  missing from the export.
- **Test**: store `rule-export.test.ts` (reword, history lines, changed vs replaced); dashboard
  `test_rules.py` (Reword through the chat service, wordings newest first, Changed / Replaced).

## F-04 As of by TEMP views (T015), 2026-10-22

- **Built**: `?as_of=<seq>` on Processes, Screens, Map and Rules. The connection gets TEMP views
  named like the tables (SQLite resolves an unqualified name to the temp schema first), cut at the
  version's `built_at`: every read model runs unchanged. A screen's status as of then comes from
  its lineage, a process's revision and name from its revisions, a proposal's decision from
  `decided_at`. Header menu (Now + each version with its releases and last scan), banner with Back
  to now, links keep `as_of`, posts carrying it are refused (409) and disabled by `as-of.js`.
- **Deviation**: an action's or link's status is kept only for its last change
  (`status_model_version`): before that version it shows as active, which may be wrong for a link
  that was retired, revived and retired again. Docs is not As of (FR-001 names four pages); exports
  and downloads show now (the export command reads the store itself). Releases per part in the
  menu are the version's new build epochs, not every part's release in force.
- **Bug found while building**: `PRAGMA query_only` also refuses TEMP views, so they are created
  before it is set (`db.connect(shadow=…)`); the file stays `mode=ro`.
- **Test**: `test_as_of.py` (views, versions, a page in the past, refused post, Review ignores it).
  Eval idea: a gate that runs a page now and As of every version and compares counts with the
  versions' `stats_json`.

## F-05 Also settles links findings to Same screen? only (T023), 2026-10-22

- **Built**: a finding whose hypothesis says a new page version is a variant (Release, Persona,
  A/B test) lists that version's open and conflicting Same screen? pairs under Also settles;
  confirming it answers each pair "Same screen" with the confirm's reason and the key it came
  with. The same decision bar on Before / after does not carry them (only Review does).
- **Deviation**: the designer's third link, the process suggestion ("r3 as a variant of step 3"),
  is not built: suggestions are about scans, not page versions, and nothing ties one to a
  finding. Undo takes back the decision only; the Same screen? answers stay (a label has no undo
  of its own, it is replaced by the next answer). The reverse rule ("settled as different screens
  first turns the finding into a New screen") is not built.
- **Test**: `test_same_screen.py` (Also settles listed, the label sent with the reason).

## F-07 Mining after a rebuild (T030), 2026-10-22

- **Built**: `mineRules(raw, portal, miner)` runs the miner on every decision point of the latest
  model version and imports the answers; `uvMiner(root)` is the Python miner through `uv`, or
  null without apps/miner or `uv`, or with `PATHFINDER_MINER=off`. The MCP server (not the local
  client, so no test tier and no script needs Python) mines after a run's rebuild and counts
  `rules_mined` / `rules_ambiguous` on the `model_reconciled` trace event; `pnpm model:reconcile`
  mines too; `pnpm model:mine` uses the same code.
- **Deviation**: the chat's `reconcile_model` tool rebuilds without mining (it promises "a few
  seconds"; mining spawns `uv` per decision point). A miner failure is caught with the rebuild's
  and logged as `model:reconcile_failed`, so the message says "not rebuilt" when only mining
  failed: worth a separate rule id when the miner is in the field.
- **Test**: store `rule-miner-run.test.ts` (stub miner, once per point, off switch);
  mcp-server `run-services.test.ts` (the run end with a miner).

## F-08 Cheap starts for the headless driver (T032), 2026-10-22

- **Built**: every replay is its own probe run, so "identical prefixes run once" works across the
  replays of one `pnpm model:replay` call: after each step the driver notes the address the run
  observed the state under (`observations.url`), keyed by (portal, persona, start, inputs, prefix
  of element keys). A later plan with that prefix opens the address, and goes on from there only
  when the page is the same state; otherwise it starts over. The last step always runs.
  `stepsSaved` in the report.
- **Deviation**: R1 error replays do not use it (they ask whether an error comes back on the same
  way). Starts from spec 034's checkpoints (a recorded path or direct visit per state) are not
  used: plans carry element keys, not the states between them; that needs the plan builders in
  the store to carry the journey's states (R-90 or a later driver item). A page reached by a form
  post is usually not the same state when opened by address, so those prefixes fall back.
- **Test**: mcp-server `replay-prefix.test.ts` (a fake portal: second plan starts at /b; other
  inputs or a moved page start over); the three replay e2e files still pass.

## F-09 The planner's marks (T033), 2026-10-22

- **Built**: `plannerWork` reads the planner's input from the store (deviations waiting for a
  replay, hypotheses with tests not run, untested model transitions on documented screens,
  decision points with fewer than 5 rows for an outcome, processes not explored), `plan` orders
  it, `writePlannerMarks` writes `marks` (origin `planner`, kind `recheck`, priority, hypothesis,
  target: the screen's first page version or the transition) and replaces its open ones each
  pass. The MCP server's run end (count `planned` on `model_reconciled`), `pnpm model:reconcile`
  and each `model:replay` round write them; a replayed test uses its hypothesis's marks.
- **Bug prevented**: planner marks are kind `recheck`, which a person's Recheck scan, the chat's
  directed-scan check, the map inspector and Scans ▸ Plan next scan all read; each now filters
  `origin = 'person'` (8 readers). Test idea: a gate that writes planner marks and checks that a
  recheck scan refuses with "no Recheck marks".
- **Deviation**: priority 1 (confirmed rules on a new epoch) stays empty in the input:
  `queueRegressions` already turns it into waiting regression tests (priority 3). Probe runs
  still pick their work from the store's pending lists in the same order, not from the marks;
  the marks are the record and the dashboard can show them (not shown yet). Exploration runs do
  not mark theirs used: the next pass drops a process once it is explored.
- **Test**: store `planner-marks.test.ts`; golden snapshots updated for `planned: 0`.

## F-10 A release reached only the screens someone visited after it (T036), 2026-10-22

- **Bug**: the reconciler took a screen's current epoch from that screen's own latest visit
  (F-13@039 recorded it as a stricter reading). After a release, a screen nobody visited again
  kept its old epoch, so its links stayed `active` instead of `untested` ("not checked on the
  current release"); design § 6.7 says the latest epochs of the scopes on its members. The unit
  test "Not visited … stays untested" asserted `active` with a comment explaining why.
- **Fix**: the current epoch of a screen is built from the newest build seen anywhere in the
  portal for each scope its latest visit had. Found by the not-visited scenario test.
- **Test**: model `reconcile.test.ts` (now `untested`); mcp-server `not-visited.e2e.test.ts`
  (a release, two scans skipping home: home active, its links untested, no missing action, no
  `removed`). Eval idea: count `untested` links after a release in the reference trial.

## F-11 Scenario tests of T036, 2026-10-22

- **Built**: switchboard scenarios `flaky-page` (HTTP 500 on loads 2–4 of every five of the
  vehicle form's submit address) and `threshold-rule` (under 18 → an exit page of its own, the
  date field's `max` removed); e2e tests `flaky-page`, `threshold-rule`, `not-visited` (run-side,
  no injection, so not in `BUILT_SCENARIOS`). Like the other 2.0 scenarios they are mcp-server
  `*.e2e.test.ts` files (slow tier), not `gates` package cases.
- **Seen on the way**: the crawler re-opens a page twice after a passing error
  (`TRANSIENT_RETRIES`), so a flaky page reaches R1 only when three loads in a row fail; shorter
  outages never become findings. Worth knowing for the reference trial (no change made).
- **Bug found (T033)**: the unique index `ux_marks_open` is per portal, kind and target, not per
  origin: two planner items on one page, or a person's Recheck where the planner has one, failed
  with a constraint error (rule-drift e2e). Fixed: the planner keeps one mark per target, and
  migration 0047 puts `origin` into the index.
- **Not built**: `overlapping-rule` needs R5's repeated replays (R-88) to produce its
  `nondeterministic` hypothesis; left for R-88.

## F-12 The eval trials (T040, T041), 2026-10-22

- **Scar-maker (R-75)**: two crawler-only trials on 2.0, both 54.3 % (25 of 46 ground-truth
  screens, the same 21 missing: S21, S22, S26–S33, S35, S36, S38–S46), frontier empty at the
  end, $1.18 and $1.11. The first is the promoted baseline (`data/evals/scar-maker/baseline.json`).
  **R-50 check passes**: the model keeps `/sc01`…`/sc24` as separate screens (2.0's parameter
  roles); 4 screens remain under `/:param/:param`. The missing scars are pages the map never
  reached with the frontier empty, a crawler question for R-35, not identity.
- **Reference-insurer (T041)**: one trial against the v2 baseline, $6.59. Equal on every goal
  score but two: `rules` 70.6 % (12 of 17, baseline 41.2 %), and `export_ears` 54.5 % (baseline
  100 %), the one regression. EARS is written by the BA: in this trial 1 of 5 requirements and 4
  of 7 business rules have one. Spec 040 changed no BA prompt or tool, so this is the BA's
  run-to-run variance on one trial (more rule records, fewer with EARS); for R-89. Not promoted.
- **Spend**: $8.88 of the ~$20 allowed.

## F-06 Smaller deviations in T016–T022, 2026-10-22

- Changes: From by date compares with `built_at` (UTC strings); a date without a time means its
  start. A release span on the lane starts the range at its first observation.
- Before / after: the changed region needs the element's box in the state's layout; changes not
  about one element (a new variant, a target mismatch's both sides) have no mark. Overlay needs
  two screenshots.
- Map: edge labels are decision-rule conditions only; a replaced link's old route is not labelled.
- All portals: Review stays per portal, so the page shows a preview of three items across
  portals, not an inbox with a Portal column (designer's default for open question 1).
- Settings: "minutes per check run" has no setting in the portal schema yet; the release marker
  has no "test it" button (it needs a fetch of the portal).

## Close-out review: feature/040-r91-r93-r75-mudpuppy-2-1 (2026-10-22)

| # | File:line | Guideline | Finding | Change | Size | Outcome |
| - | --------- | --------- | ------- | ------ | ---- | ------- |
| 1 | apps/chat/CLAUDE.md:52 | G-30 | `PUT /portals/{p}/hints` (`setHints`), `model/undo` and `model/reword` not in the agent notes | added to the api-model entry | small | fixed |
| 2 | apps/crawler/packages/store/CLAUDE.md:32 | G-30 | `proposal-constraints.ts` (`proposalConstraints`, `blockedBy`) not listed | mentioned under `writeProposals` | small | fixed |
| 3 | apps/crawler/packages/store/src/process-proposals.ts:181 | G-04 | `writeProposals` grew a 6th, optional trailing `skipped` parameter | options object changes the signature and its 8 callers | large | deferred → follow-up |
| 4 | apps/dashboard/src/pathfinder_dashboard/web/review.py (423 lines, was 335) | G-01, G-06 | file crossed 400 lines with `review_undo`, `_also_settle`, `_model_call` | the two helpers moved to `web/views_review.py` (399 lines left) | small | fixed after the review |
| 5 | web/review.py:261, chat_client.py:80, queries_changes.py:292 | G-04 | new `_also_settle` (6 params), `model_call` (6), `range_from` (7, four optional) | context object or keyword-only changes callers across files | large | deferred → follow-up |
| 6 | apps/chat/src/api.ts:159, model/src/model/reconcile.ts:118, store/src/portal-data.ts:245 | G-02, G-03, G-06 | already-over-limit functions grew (hints route, newest-build map, `hypothesis_wordings` case) | split `route` per resource, `reconcile` per phase | large | deferred → follow-up |
| 7 | apps/dashboard/CLAUDE.md (139), mcp-server/CLAUDE.md (145), store/CLAUDE.md, chat/CLAUDE.md | G-30 | agent notes well over about 60 lines | prune per package | large | deferred → follow-up |
| 8 | apps/crawler/packages/store/src/db-types.ts:476 | G-01 | 1152 lines (new row types added) | split by table family | large | deferred (R-34 leftover) |
| 9 | web/changes.py:20, web/review.py:97,163, web/screens.py:25, web/overview.py:38-136 | G-04 | route handlers got more optional query parameters (`part`, `age`, `undo`, `from_*`) | one query-params dataclass per page | large | deferred → follow-up |

Checks after fixes: only Markdown agent notes edited, so no code check was needed. No lint warnings in new files; changed-line warnings are growth of already-large functions (rows 3, 6).
Summary: 9 findings, 2 fixed, 7 deferred, 0 rejected.
