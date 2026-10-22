# Tasks 040 (MudPuppy 2.1: R-93, R-91, R-75)

Tags per task (`model-split-per-task`). One commit per task group, ids in the message. Designer
references: `docs/design/salvage-yard/docs/12-v2-ux.md` (§), screens `v2-xx`. Spec 039 notes:
`specs/039-mudpuppy-2-portal-model/findings.md` F-48…F-55, `ux-gaps.md` G-numbers.

## Housekeeping

- [x] T001 [haiku] Roadmap: Generative UI POC renumbered R-92 (two rows were R-91), R-93 added, R-91 / R-93 / R-75 `in progress (spec 040)`; constitution names `model:mine` (R-91 (9))

## Review (12-v2-ux § 5)

- [x] T010 [opus] Undo (FR-004): an undo event that reverts a person's last decision (lifecycle, migration, store, chat route `model/undo`), toast "Confirmed · Undo" on Review
- [x] T011 [sonnet] Groups and bulk (FR-003, G5): same kind + explanation + release form a group, one checkbox, "Confirm 12", one reason for a bulk reject, one Undo for the group
- [x] T012 [sonnet] Keyboard (FR-005) J/K/Enter/X/C/R/M/U/`?` with a key bar, and remembered reasons (FR-006). No `M`: model items have no comment action. Checked in Chromium 2026-10-22 (J/K/X/?//, no page errors) and ui:check on every T010–T023 page at 1280 and 390
- [x] T013 [sonnet] Filters with counts: kind, part, age

## Rules, Changes, Screens, Map (G2, G4, G6, G9, G10)

- [x] T014 [opus] Rule statuses in the designer's words and Reword (FR-007), the reworded sentence in the export; Rules Copy Markdown and history lines (F-55). Evidence line still missing (F-03)
- [x] T015 [opus] As of (FR-001, G2) on Screens, Map, Processes, Rules (TEMP views, F-04)
- [x] T016 [sonnet] Changes for a from–to range (FR-002, G4): default since the previous release, From a date or a scan, a release on the lane starts the range
- [x] T017 [sonnet] Variant why (FR-008, G9), Screens filters and sort (F-51), per-release coverage (FR-009, G10)
- [x] T018 [sonnet] Before / after: decision bar, Side by side / Overlay / Wireframe, the changed region marked (§ 6, F-48). Marked only for changes on one element (its layout box); a new variant has none
- [x] T019 [sonnet] Map: edge labels and process triggers / outcomes on the overlay (F-52). Labels are rule conditions; a replaced link's old route is not labelled
- [x] T020 [sonnet] All portals v2-15 and the Portals plate (F-50). Review stays per portal (designer's default); All portals shows a preview, not a cross-portal inbox
- [x] T021 [sonnet] Settings: edit Hints from the page, Budgets (F-54). Chat `PUT /portals/{p}/hints`; Budgets are checks per scan and probes per step / scan. "Minutes per check run" has no setting yet; no "test it" for the marker
- [x] T022 [sonnet] Same screen? τ-nearest queue (F-53): conflicts, then same-route pairs within 0.05 of τ nearest first, then the variants
- [x] T023 [opus] Linked decisions, Also settles (§ 5.5): variant findings settle their Same screen? pairs; the process-suggestion link is not built (F-05)

## Backend (R-91)

- [x] T030 [opus] The reconciler calls the miner when present (039 T062): `mineRules` + `uvMiner`; the MCP server's run end and `pnpm model:reconcile` mine a new model version; the chat's `reconcile_model` tool does not (F-07)
- [x] T031 [sonnet] Export: API contracts by schema hash (039 T078): CONTRACTS.md lists an endpoint's response contracts by schema hash when it changed shape; openapi.yaml says how many
- [x] T032 [opus] Headless driver prefix cache and checkpoint starts (039 T021): a prefix cache per `model:replay` call (persona, inputs, prefix) starts later replays at the address reached, checked by state; R1 error replays keep their whole path; starts from the spec 034 checkpoints table are not used (F-08)
- [x] T033 [opus] Planner marks for probe and exploration runs (039 T054, T075): `writePlannerMarks` after each rebuild and replay round; replays mark them used; people's mark readers filter `origin = 'person'` (F-09)
- [x] T034 [opus] A person's proposal edits as constraints of the next `model:propose` (039 T072): communities alike a dismissed proposal (80 % or one screen more or less) or mostly inside a kept process are not proposed; the script says why
- [x] T035 [opus] Boundary tests as probe-suite rows a person reviews (039 T063, no schedule: Q-3): `proposeBoundarySuites`, one open suite per rule after mining; approving writes it into traces.yaml
- [x] T036 [opus] Scenario gates: Not visited, Flaky, Overlapping rule, Threshold rule (039 T041, T066): flaky-page, threshold-rule, not-visited as e2e scenario tests; a release now reaches unvisited screens (F-10); overlapping-rule waits for R-88 (F-11)

## Evals

- [x] T040 [sonnet] Scar-maker baseline (R-75): crawler-only trials on 2.0, promote; R-50 check (two trials 54.3 %, baseline promoted; R-50 passes, F-12)
- [x] T041 [sonnet] One reference-insurer trial against the v2 baseline (rules 70.6 %, export_ears regressed to 54.5 % by BA variance, F-12)

## Close-out

- [x] T050 [haiku] Glossary entries for new UI words; `uv run pathfinder-glossary --write`: as-of, review-undo, also-settles, planner-mark, response-contract new; decision-rule, boundary-test, portal-hints updated
- [x] T051 [opus] `code-reviewer`; fix or defer (deferred → R-90): 9 findings, 3 fixed (agent notes, `review.py` under 400 lines), 6 deferred to R-90
- [x] T052 [opus] Close-out suites (`CLAUDE.md`): crawler `pnpm test` 2489 passed, one wall-clock check in `trace-map-run.e2e` failed under the load of the other suites running beside it and passed twice alone, `test:perf` passed; chat 311 + e2e 5, workflow 29, dashboard parallel + serial, proving-ground backend: all passed
- [x] T053 [sonnet] CHANGELOG 2.1.0, roadmap, merge, tag v2.1.0, push, session dump
