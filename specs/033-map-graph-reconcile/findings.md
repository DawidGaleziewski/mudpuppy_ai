# Findings 033

Every bug, gap and slip found while building spec 033, with a test or eval idea (owner rule: log
every bug for evals).

| Id | Found | Symptom | Cause | Fix / status | Test or eval idea |
|---|---|---|---|---|---|
| F-01 | T009 2026-10-17 | Replay groups (FR-013 (c)) cannot be built: a `replay_diverged` event's `target_state`, `expected_step` and `seen_step` read `[token]` in `trace_spans.attrs_json` | the trace scrubber masks id-shaped values in event attributes (spec 005 FR-016), so the state ids are gone | open: replay groups not built (research R7 note); idea: record a divergence as a `decision_log` note with the ids, or keep state ids out of the scrubber's token rule | gate: a scar whose step 2 URL shows step 1 when opened directly; `list_differing_states` returns a `replay:` group |
| F-02 | T009 2026-10-17 live store | Route groups on scar-maker grouped unrelated scars under `/:param` and `/:param/:param` | a route template with a parameter holds different items by design (one per product, one per scar), so its several screens are no difference | fixed: routes with a parameter are skipped | unit `differing-states.test.ts` (`/p/:param` with two items makes no group) |
| F-03 | T003 2026-10-17 | The first map drew queued, failed and blocked items as nodes of their own; reference-insurer's map was twice as wide | the plan followed the design doc's "+38 queued" cluster node; screen 12 draws it as a chip on the page's node | fixed: chips on the node (FR-004 updated) | `test_map.py` (+2 queued on the form node) |
| F-04 | T004 2026-10-17 | ui:check failed: axe `label-content-name-mismatch` on deck nodes | the node's `aria-label` did not contain its visible chip text ("+12 queued" vs "12 queued") | fixed: no `aria-label`; the button's own text is its name | ui:check at 1280 and 390 on `/map` |
| F-07 | T017 live BA session on proving-ground-bank | All 7 `propose_verdicts` calls were refused `PII_SUSPECTED` ("looks like personal data"); nothing reached Review. The BA's verdicts themselves were sound (Archiwum → technical, a permanent 404; April/May statements → variant by input) | the PII check ran over the whole verdict list, and the masker turns a UUID state id into `[token]`; the unit fixture used short ids (`st-503`), so the tests never saw a real id | fixed: only the reasons are checked; the fixture's 503 state has a UUID | unit `reconcile-tools.test.ts` (proposal with a UUID state id stored); a fixture rule: ids in BA tool tests look like real ones |
| F-06 | 2026-10-17 (process) | Restarting the dashboard with `pkill -f "bin/pathfinder-dashboard"` also killed Claude's own shell (exit 144), twice | the pattern matched the shell's own command line, which contained it | process slip: stop servers by pid or by port, never with a pattern that appears in the same command | none (agent behaviour) |
| F-05 | T004 2026-10-17 | Long titles made nodes taller than the layout's row, so rows overlapped | the layout assumed 72 px; titles wrapped to four lines | fixed: node height fixed at 96 px (screen 12), title cut to one line with the full title on hover | screenshot check at 1280 |

## Close-out review: feature/033-r69-map-graph-and-reconcile (2026-10-17)

Scope: `git diff master..HEAD`, without `docs/design/salvage-yard/**` and data/schema snapshots.

| # | File:line | Guideline | Finding | Change | Size | Outcome |
| - | --------- | --------- | ------- | ------ | ---- | ------- |
| 1 | apps/crawler/packages/store/src/db-types.ts:457 | G-01/G-06 | file 757 lines (limit 400), +19 for the reconciliations table types | split table types by feature (same as spec 032 review row 3) | large | deferred → follow-up |
| 2 | apps/crawler/packages/mcp-server/src/ba-tools/index.ts:119 | G-02/G-06 | `registerBaTools` 209 lines; the branch added 29 (`list_differing_states`, `propose_verdicts`) | split registration per tool group (same as spec 032 review row 5) | large | deferred → follow-up |
| 3 | apps/chat/src/api.ts:111,145 | G-02/G-03/G-06 | `createApi` 220 lines, `route` 171 lines and complexity 62; the branch added 5 lines (confirm route) | route table per resource instead of one if-chain | large | deferred → follow-up |
| 4 | apps/dashboard/src/pathfinder_dashboard/web/map.py:47 | G-04 | `map_page` takes 8 parameters (ruff PLR0913): FastAPI query parameters | group the query parameters in one model (changes the route signature and its tests; same as spec 032 review 2 row 5) | large | deferred → follow-up |
| 5 | apps/crawler/packages/mcp-server/CLAUDE.md, apps/dashboard/CLAUDE.md | G-30 | 96 and 86 lines (about 60); this branch added 2 and 3 | move spec 032/033 notes to a doc and link it (same as spec 032 review row 6) | large | deferred → follow-up |

Other changed code checked and conformant: new files `differing-states.ts`, `reconcile.ts`, `reconciliations.ts`, `api-reconciliations.ts`, `ba-shapes.ts`, `map_layout.py`, `queries_map*.py`, `queries_reconcile.py`, `web/map.py` have no size, complexity, depth or param warnings (except row 4); no SQL in routers (G-15); the map page follows the page pattern (router, template, `queries_*`, `test_map.py`); migration 0025 has an up and a down file (G-16); no `any`, bare `throw new Error`, suppressions or sleeps in added lines (G-22, G-23, G-24, G-28).

Checks after fixes: typecheck ✓ lint ✓ test:fast ✓ (apps/chat typecheck, lint, test ✓; dashboard ruff + pytest -n auto ✓; slow tier and gates not run)
Summary: 5 findings, 0 fixed, 5 deferred, 0 rejected.
