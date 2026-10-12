# Tasks: Capture everything + R-28 leftovers (spec 019, R-37, R-38, R-45)

**Input**: `specs/019-capture-everything/` (spec.md, plan.md, research.md, data-model.md,
contracts/). Branch `feature/019-r45-r37-r38-capture-everything`.

**Model tags**: `[opus]` judgment, capture heuristics, pipeline order, reviews, eval runs and
verdicts; `[sonnet]` code-touching but well specified; `[haiku]` exact text edits. The owner did not
ask for a model split this time (2026-10-11): Claude does every task inline; the tags stay for the
record.

**Rules**: Edit tool only, re-read after editing; log every bug or slip in `findings.md` with a
test/eval idea; slow tier (`pnpm test:slow`) before committing any group that touches
`crawler/src/**`, `mcp-server/src/runtime/**`, `gates/**` or `apps/proving-ground/**`; ports
4200/4201 free before gates. Commit per group with the task ids.

`[P]` = can run in parallel with the other `[P]` tasks of its phase (different files).

## Phase 1: Setup

- [x] T001 [opus] Branch, spec, plan, research, data model, contracts, quickstart, tasks;
  `.specify/feature.json` → `specs/019-capture-everything`.
- [x] T002 [haiku] `findings.md` (F-01: the research-time slip, a doc edited by a script); roadmap
  R-37, R-38, R-45 → `in progress` with the spec link.

## Phase 2: Foundations

- [x] T003 [sonnet] Migration `0012_page_visits.{up,down}.sql` (`page_visits` table, indexes;
  `network_calls.url`), `db-types.ts`, regenerated `data/schema/schema.sql`, store data-model doc
  (G-16, db-admin conventions); up/down round-trip test. (As built: also `PORTAL_TABLES` /
  `DELETE_ORDER` in `portal-data.ts`, the dashboard read model `PageVisit` + `NetworkCall.url`.)
- [x] T004 [sonnet] [P] Zod `HopKind`, `NavigationHop`, `PageVisitVia`, `PageVisit` in
  `core/src/schemas/page-visit.ts`, exported; unit test.
- [x] T005 [sonnet] [P] Portal `scope.client_redirect_wait_ms` (0..30000, default 5000); config test.
  (As built: narrowed like `mfe_wait_ms` in `safety/src/scope.ts`.)
- [x] T006 [opus] [P] `fingerprint`: `normalizeUrl` strips `;…` path parameters per segment (LO-24);
  (As built: stripped where the template splits segments, `normalizeUrl` itself unchanged: it has no
  other caller and its contract is RFC normalisation.)
  `parseUrlParams(url)` in `url-params.ts` (query, path, fragment query; repeats and valueless
  kept; order kept); unit tests incl. `;jsessionid=`, `?a=1&a=2&flag`, `#/x?nr=1`, encoded values.

## Phase 3: Capture (US1, US2)

- [x] T007 [opus] `crawler/src/navigation-recorder.ts`: main-frame document requests with redirect
  chains (`http` + status), `framenavigated` without a document request (`same_document`), reload
  via the navigation timing type, meta refresh vs script by the previous document's refresh target;
  `begin(startUrl)` / `drain()`; browser unit test on a small local page set.
- [x] T008 [opus] `crawler/src/client-redirect.ts`: probe a meta refresh (delay, target), wait for an
  in-flight or announced main-frame navigation bounded by `client_redirect_wait_ms`, up to 5 hops;
  never throws; browser unit test (meta 1 s, script replace, long meta not followed, loop bounded).
- [x] T009 [opus] Session wiring: the recorder attached beside `NetworkRecorder`; settle step follows
  client redirects (through `navigationPolicy`; out-of-scope → hop `blocked` with reason) before
  observing; pipeline step `record_visit` (`pipeline/visits.ts`, G-18) writes `page_visits` via
  `services/page-visits.ts`, for navigate, act, re-login; `via` and `edge_id`; golden order test
  updated (`pipeline-golden.e2e.test.ts`).
- [x] T010 [sonnet] `NetworkRecorder`: verbatim `url` on every call (masked with `pii_scrub`), stored
  in `network_calls.url`; document POST `req_schema` → `{content_type, fields}` (F-08); readers
  (BA summary, evaluator, dashboard API view) accept both shapes; unit test with a field named
  `content_type`.
- [x] T011 [sonnet] Gates: LO-21 asserts the shop chain's `http` hops (301, 302) on the visit; LO-22
  asserts `meta_refresh` then `script` hops and loses its `setTimeout`; LO-23 promoted (old and new
  policy URL → one state, no "Proszę czekać" state); LO-24 promoted (template without the sid, visit
  URL with it). Catalogue rows LO-23/LO-24 rewritten in `docs/legacy-obstacles.md`.
  (As built T007–T011: hop kind `navigate` added for the step's own load; the recorder learns meta
  refresh targets from an init script; `BrowserSession` takes one parts object (G-04); the slow
  tier: gates 140/140, e2e 55/56 with the F-04 flake.)

## Phase 4: Frame mounts (US3, R-45 item 1)

- [x] T012 [opus] `waitForMountsIn(page, frames, maxMs)` over the page and every same-origin in-scope
  frame within one deadline; `MountWait.frames`; `mountReports` names the frame; settle uses it.
- [x] T013 [sonnet] Proving ground: a bank page wrapping a same-origin frame whose app mounts late
  (import map + the estate's bundle delay); backend test; catalogue row LO-53; gate LO-53.

## Phase 5: Read side (US1, US2)

- [x] T014 [opus] `docs/src/param-inventory.ts`: `parameterInventory(visits, edges)` and entry URLs
  per state (bounds from data-model.md); unit tests on `data/fixtures/param-inventory.json`.
- [x] T015 [sonnet] BA: `services/ba/reads-urls.ts` with `page_visits` and `parameters` evidence
  kinds (paging, defaults, compact); `EvidenceTargetKind` + `data_item.seen_in.kind` gain
  `page_visit`; evidence link resolution for visits; tests.
- [x] T016 [sonnet] Export: per screen "Entry URLs" and "Parameters" in the structure chapter and the
  machine-readable export; golden export test updated.
- [x] T017 [haiku] `ba-practice`: a "URLs and parameters" pass (entry points, old/new schemes,
  redirects, parameters that select a variant, parameters that matter together, carried
  parameters) with one worked example; `record-kinds.md` `seen_in` kinds.

## Phase 6: BA write refusals (US4, R-45 item 2)

- [x] T018 [opus] `docs/src/record-kinds-text.ts`: `describeRecordKinds()` (one line per kind from the
  Zod content schemas, nested shapes, optional marks) and `describeRelations(fromKind?)` from
  `RELATION_RULES`; unit tests (every kind present; lines stable).
- [x] T019 [sonnet] `create_record` / `revise_record` descriptions end with the generated block;
  `SCHEMA_INVALID` carries `expected`; `RELATION_NOT_ALLOWED` carries `allowed_from_kind`; tests on
  the error bodies.
- [x] T020 [sonnet] Fast test: field names in `ba-practice/references/record-kinds.md` match the
  schemas; skill rule "an element without a visible label is left out of `elements`".
- [x] T021 [sonnet] Eval code grader `evals/graders/code/ba-writes.ts`: write calls and refusals by
  code from the BA transcript → `ba_write_refusals` in the trial scores; unit test on a transcript
  fixture (counts results, not calls; F-22).
  (As built T014–T021: the inventory fixture lives in `apps/crawler/tests/fixtures/params/`;
  `get_run_evidence` moved to `services/ba/run-evidence.ts` (reads.ts 621 → 464 lines, G-01);
  migration 0012 also rebuilds `doc_evidence_links` for the `page_visit` target kind; refusals are
  three checks `ba_write_calls`/`ba_write_refused`/`ba_write_refused_pct`, printed by code; on the
  promoted bank transcript the grader reads 33 of 85 refused (39 %), matching F-20.)

## Phase 7: Parameter case (US1)

- [x] T022 [sonnet] Proving ground `wyciag.do` (LO-52): `typ`/`okres` dependency with an error
  message, `tryb=druk` print layout, `konto` carried from `lista.do`, links from `menu.do`; backend
  tests; ground truth bank: screens, rules, parameters (YAML, G-34); catalogue row LO-52.
- [x] T023 [sonnet] Gate LO-52: visiting both links records every parameter and value in the
  inventory of the `wyciag.do` screen(s).
  (As built T012/T013/T022/T023: `waitForMountsIn` re-walks the frames on every poll; LO-53 was
  checked to fail with frame probing switched off; the late-mount case is `kursy.do` (S15); the
  print layout is rule R09, not a ground-truth screen (the GT test loads screens by route); bank
  ground truth grows from 13 to 15 screens and gains rules R08/R09, so bank `crawl_screens`
  totals change from 11 to 13 logged-in screens. Slow tier: gates 137/137 + coverage after F-06;
  e2e 55/56 with the F-05 flake.)

## Phase 8: Dashboard (US5, R-45 item 3; read side for US1/US2)

- [x] T024 [sonnet] `stores.py`: main + eval workspace stores (newest first), key resolution,
  fallback; picker in the layout; `?store=` kept on links; `?env=` still works; startup line prints
  the resolved store; tests with a fake eval workspace.
- [x] T025 [sonnet] Empty portal page names the stores that hold its runs (links); route test.
- [x] T026 [sonnet] `queries_urls.py` + state page "Reached under" (entry URLs, hops, parameter
  inventory); drift test for `page_visits`; route test; fixture shared with T014.
  (As built T024–T026: `Ctx` carries a `Store`; links keep `store=`, the older `env=` still
  resolves; an eval store shows an `[EVAL]` note; tests never see the machine's real eval
  workspaces (`PATHFINDER_EVAL_ROOT` set per test).)

## Phase 9: Validation and close-out

- [x] T027 [opus] Slow tier green; full `pnpm test` in `apps/crawler`, every app's suite.
  (As run: 1895 passed, 1 timing-dependent golden failure (an extra `limiter_wait`, F-11); every
  other suite passed, the dashboard on a rerun.)
- [x] T028 [opus] Evals one at a time (bank, insurer, shop, reference): SC-005 refusal rate, SC-006
  coverage, SC-008 parameter documentation; verdicts in `findings.md`; promote if better.
- [x] T029 [opus] `code-reviewer` on the branch (G-31); fix or defer findings.
- [ ] T030 [haiku] Glossary entries (page visit, navigation hop, parameter inventory, entry URL,
  eval workspace store) + `uv run pathfinder-glossary --write`; roadmap R-37/R-38/R-45 done; spec
  checkboxes; changelog; merge per the owner's go-ahead.
  (Done except the merge: glossary, roadmap rows at `review`, CHANGELOG under Unreleased, session
  dump `session_dump/2026-10-12-r37-r38-r45-capture-everything.md`.)
