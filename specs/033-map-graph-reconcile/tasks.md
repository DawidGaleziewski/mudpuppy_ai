# Tasks: Map graph and differing states (spec 033)

Branch `feature/033-r69-map-graph-and-reconcile`. Model tags per the owner's rule
(`[opus]` design-heavy, `[sonnet]` pattern work, `[haiku]` docs and small edits).

## Phase 1: setup

- [x] T001 [haiku] refresh the design package from `user_input/graph_handler/mudpuppy-salvage-yard (2).zip`: `docs/design/salvage-yard/` (screens 12–16, docs 10–11, screenshots) and `static/salvage/css/salvage.css` (additions only, R10); `find-old-styles.sh` stays 0

## Phase 2: US1 the map (P1)

- [x] T002 [opus] `map_layout.py`: pure layout (depth by breadth first from start screens, discovery tree, layers, barycenter order, positions, route families over 150 nodes, "opened by address" layer); unit tests on small graphs (tree, cycle, two seeds, unreachable, 300 nodes)
- [x] T003 [sonnet] `queries_map.py`: nodes (screens, states with kinds and form steps, scans with personas, queued counts, blocked items, Probe marks), edges (tree, link, failed, blocked), filters scan/persona/layers; tests on a seeded store. Changed while building: queued, failed and blocked items are chips on their page's node, as screen 12 draws them, not nodes of their own (half the width)
- [x] T004 [sonnet] `web/map.py` + `salvage/map.html` + partials: page head, Scans · Map tabs, filter bar, graph (`sy-graph`, `sy-node`, `sy-edge`), list view, legend; nav and Scans page link; route tests (no portal, empty portal, filters, unknown values)
- [x] T005 [sonnet] `static/js/map.js`: aria-pressed selection, htmx inspector load, arrow keys to connected nodes, Enter, zoom (−, fit, +); no inline handlers
- [x] T006 [sonnet] perf test: 300-screen fixture under 4 s (`perf` marker); ui:check at 1280 and 390 on `/map` and `/map?view=list`

## Phase 3: US2 inspector and Probe marks (P1)

- [x] T007 [sonnet] inspector partial `/fragments/map/node/{screen_id}`: states, scans, transitions, blocked reasons, probe outcomes; Probe mark form on form-step nodes; `web/states.py` probe-mark `back` (only `/map…`); tests (marked node shows the tag, `back` ignored for other paths, chat service down)

## Phase 4: US3 differing states (P2)

- [x] T008 [sonnet] db-admin: migration 0025 `reconciliations` (data-model), Zod in `docs-model` (verdicts, hypotheses, proposal), store types, portal export/delete, dashboard read model, schema.sql
- [x] T009 [opus] `services/ba/differing-states.ts`: group rules R7 (action, route, replay) with evidence (scans, persona, first/last, HTTP status, frequency, reproduced); unit tests on a fixture store (temporary 503, persona variant, validation explained by kind, form steps explained, unexplained second state). Replay groups not built (F-01: the trace masks their state ids); routes with a parameter skipped (F-02)
- [x] T010 [sonnet] BA tools `list_differing_states`, `propose_verdicts` (G-14: shapes in `ba-tools/index.ts`, logic in `services/ba/reconcile.ts`, allowlist, `ba` agent tools); errors `GROUP_UNKNOWN`, `VERDICTS_INCOMPLETE`; tests
- [x] T011 [sonnet] scar SC-20 (a page that answers 503 on its first visit, then the form; and a persona-dependent page) + gate `scars-differing.test.ts` (SC-005: groups found, none for SC-19's steps). Built as one button that leads to the offer and to a sold-out page on alternate presses: a 503 on a page load is retried by the crawler (SC-17) and never becomes an outcome; the persona and temporary cases are covered by the unit fixture
- [x] T012 [haiku] BA guidance: `.claude/agents/ba.md` and `ba-practice` skill (hypothesis order, verdicts, documentation rules FR-016; call `list_differing_states` before documenting a process)

## Phase 5: US4 confirm in Review (P2)

- [x] T013 [sonnet] chat route `POST /portals/{p}/reconciliations/{id}/confirm` (`reconciliations.ts`, `api-reconciliations.ts`, wired in `api.ts`/`main.ts`); tests (200, 404, 409, 400)
- [x] T014 [sonnet] Review kind "Differing states": `queries_reconcile.py`, `partials/review_differing.html` (screen 16 layout), confirm route forwarding with `PATHFINDER_REVIEWER`; tests
- [x] T015 [sonnet] eval check `no_error_page_as_step` (SC-007) in the eval graders with a unit test. Built as the BA shape diagnostic `error_pages_as_steps` (`evals/graders/code/ba-shapes.ts`, printed with every BA eval; must be 0)

## Phase 6: close-out

- [x] T016 [haiku] docs: `docs/how-to-use.md` (the map, differing states), package CLAUDE.md files, glossary (Map, Differing states, Verdict) + `pathfinder-glossary --write`
- [x] T017 [opus] live check on the five test portals (map pages, one BA reconciliation session), slow tier, full test pass, code-reviewer, fix or defer. The first BA session's proposals were all refused (F-07, fixed); the second left three proposals for the owner in Review
- [x] T018 [haiku] roadmap R-69 row, spec status, findings, changelog, merge
