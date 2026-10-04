# Tasks: Screenshots and Wireframes as Documentation Evidence

**Input**: Design documents from `specs/008-screenshots-wireframes/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: included. The constitution requires Vitest tests for the pure packages, and the
quickstart lists the automated checks.

**Model tags**: `[opus]` = design-heavy or subtle (capture timing, key rule, determinism, BA
validation, autofill); `[sonnet]` = mechanical (migration, schemas, templates, docs).

TS paths are relative to `apps/crawler/packages/` unless they start with `apps/`, `data/`,
`docs/`, `specs/` or `.claude/`.

## Format: `[ID] [P?] [Story] [model] Description`

---

## Phase 1: Setup

- [X] T001 [sonnet] Create package `@pathfinder/wireframe` (`wireframe/package.json`, `tsconfig.json`, `src/index.ts` exporting `GENERATOR_VERSION = '1'`), register it in `apps/crawler/pnpm-workspace.yaml` / tsconfig references and the vitest config, and depend on `yaml`.
- [X] T002 [P] [sonnet] Add `pngjs` (+ `@types/pngjs`) to `docs/package.json`; run `pnpm install` in `apps/crawler`.

---

## Phase 2: Foundational (blocks all stories)

- [X] T003 [sonnet] Use the db-admin agent to write migration `data/migrations/0006_screenshots_wireframes.{up,down}.sql` per data-model.md: `states.screenshot_ref TEXT NULL`, `states.layout_ref TEXT NULL`; new STRICT table `state_wireframes(state_id TEXT PK → states(id), generator_version TEXT NOT NULL, svg_ref TEXT NOT NULL, excalidraw_ref TEXT NOT NULL, created_at TEXT NOT NULL)`; rebuild `doc_evidence_links` with `'screen_region'` added to the `target_kind` CHECK, new `region TEXT NULL`, `CHECK ((target_kind = 'screen_region') = (region IS NOT NULL))`, and the two indexes recreated. The down migration turns `screen_region` rows into `state` rows (region moved into `note`). Regenerate `data/schema/schema.sql` and update `data/README.md` (evidence now also holds png/svg/excalidraw/layout json).
- [X] T004 [sonnet] Update `core/src/db-types.ts` (`states.screenshot_ref`, `states.layout_ref`, `StateWireframesTable`, `doc_evidence_links.region`) and `core/src/schemas/evidence-link.ts` (`'screen_region'` in `EvidenceTargetKind`; `region: string | null`, refined so that it is non-null iff `target_kind === 'screen_region'`); update `core` schema tests.
- [X] T005 [opus] Evidence store in `core/src/evidence.ts`: add `storeBinary(bytes: Uint8Array, ext)` (sha256 of the bytes, atomic write once); make `storeText`/`storeJson` store content as given (no masking; `storeJson` keeps canonical JSON, and its optional `scrub` stays for callers that want it); update `core/src/evidence.test.ts`.
- [X] T006 [opus] Element-key rule in `core/src/element-key.ts`: `parseAriaYaml(yaml) → AriaNode[]` and `elementKeys(nodes) → KeyedElement[]` exactly as in contracts/element-key.md (KEYED_ROLES, pre-order, `role "name"`, `#n` suffix after the quote, 80-character name cut, 400 cap); export from `core/src/index.ts`. Add golden fixtures `core/test/fixtures/element-keys/{basic,duplicates,nested-landmarks,regex-name,unnamed}.{yaml,keys.txt}` and `core/src/element-key.test.ts`.
- [X] T007 [opus] Layout in `core/src/layout.ts`: Zod `Layout` (version 1, viewport, page, cut, elements `{key, role, name, box|null}`) and `buildLayout(jsonTree, { scrollX, scrollY, viewport, pageHeight, cut, mask? })`. It converts boxes to rounded page coordinates and nulls zero-size boxes and boxes below the cut. Keys come from `elementKeys` over the JSON tree (role `text` nodes dropped; names masked first when `mask` is given). Add `core/src/layout.test.ts`, including a check that YAML keys and JSON keys are identical for the fixture pages.
- [X] T008 [sonnet] Portal config `pii_scrub: boolean` (default `false`) in `config/src/portal-schema.ts` and the effective config; document it in `portals/README.md` (or the portal schema doc) and the config tests.

**Checkpoint**: run `pnpm typecheck && pnpm lint && pnpm test` and commit (T001–T008).

---

## Phase 3: User Story 1 – See what each screen looks like (P1) 🎯 MVP

**Goal**: every new state has a screenshot and layout, shown in the dashboard.
**Independent test**: map the reference portal; a state page and an SCR record show the matching screenshot.

- [X] T009 [opus] [US1] `crawler/src/capture.ts`: `captureVisuals(page, { maxHeight = 10000, mask? }) → { png: Buffer, layout: Layout }`. It reads scroll position and size in the page, takes `page.screenshot({ type: 'png', fullPage: true, clip? })`, and calls `page.locator('body').ariaSnapshotJSON({ boxes: true })` then `buildLayout`. Export it from `crawler/src/index.ts`. Update the `observer.ts` doc comment (screenshots are captured since spec 008; FR-011 superseded).
- [X] T010 [opus] [US1] Pipeline in `mcp-server/src/runtime/pipeline.ts` (`record_state` phase): when `recordState` returns `created`, run `captureVisuals`, store the PNG with `storeBinary(..., 'png')` and the layout with `storeJson`, and update `states.screenshot_ref` / `layout_ref` (via `services/record-state.ts`). On failure, write a run-level warning plus a `capture_failed` trace event and continue (FR-009). Emit a `visuals_captured` trace event with byte size and element count. Never capture for a known state (FR-008).
- [X] T011 [opus] [US1] Integration test `mcp-server/tests/capture.test.ts` against the mock portal (plus `crawler/tests/capture.test.ts` on static pages): a new state gets both refs and the PNG decodes at persona width; revisiting the same state adds no new screenshot; a stubbed capture failure leaves the state recorded with a warning.
- [X] T012 [sonnet] [US1] Dashboard `GET /evidence/{ref}` in `apps/dashboard/src/pathfinder_dashboard/app.py` per contracts/dashboard-routes.md (regex `^[0-9a-f]{64}\.(png|svg|excalidraw)$`, content types, immutable cache, SVG CSP, `?download=`). Tests in `apps/dashboard/tests/test_evidence_route.py` cover refused yaml/json/traversal refs, 404 for a missing file and the headers.
- [X] T013 [sonnet] [US1] Pydantic `Layout` model in `apps/dashboard/src/pathfinder_dashboard/models.py`, mirroring data-model.md. Add a `load_layout(data_dir, ref)` helper that returns `None` for a missing or invalid file, never raising. Test it in `tests/test_layout.py`. The dashboard uses the keys stored in the layout as they are, with no Python copy of the key rule.
- [X] T014 [sonnet] [US1] Queries in `queries.py`: `get_state_visuals(conn, state_id)` (state row, screenshot_ref, layout loaded from evidence, wireframe refs, first-seen run, citing records), and add `screenshot_ref` plus wireframe refs to the run States section values. Models in `models.py`.
- [X] T015 [sonnet] [US1] Use the frontend-dev agent for the state page: `GET /states/{state_id}` with template `templates/state.html` (header, Screenshot/Wireframe tabs, "Show elements" overlay via `?elements=1`, downloads, "Cited by", fallback text) and the States table title link plus a thumbnail column in `templates/partials/states.html`. Console tokens; percentage-positioned `.hl` overlays in the dashboard CSS. Tests in `tests/test_state_page.py` (screenshot, wireframe fallback, unknown id 404).
- [X] T016 [sonnet] [US1] Record page Screens panel (state links only for now): `queries_docs.py` returns cited states with visuals for the current revision; new `templates/partials/docs/screens.html` included in the record body above Evidence; collapsed when there are more than 3 figures. Test in `tests/test_docs_screens.py`.

**Checkpoint**: run the checks and commit (T009–T016).

---

## Phase 4: User Story 2 – See where on the screen a record applies (P1)

**Goal**: the BA cites screen regions, and the dashboard highlights them.
**Independent test**: after a BA session, a DI record shows its field outlined on the screenshot.

- [X] T017 [opus] [US2] Docs-side resolution in `docs/src/evidence.ts` and `docs/src/audit.ts`: `screen_region` resolves like `state` (portal, run, confidence `observed`) and also checks that `region` is one of the state's element keys (from its YAML via `elementKeys`). The audit reports unknown keys. Tests in `docs/tests/evidence.test.ts` / `audit.test.ts`.
- [X] T018 [opus] [US2] BA write path in `mcp-server/src/services/ba/records.ts` and `ba-tools/index.ts`: the evidence item gains `region`; it is required for `screen_region` and refused otherwise (`SCHEMA_INVALID`, field `region`); an unknown key gives `UNKNOWN_REF` (the existing code) listing up to 10 closest keys; `run_id` defaults as for `state`; persist `region`. Tests in `mcp-server/tests/ba-screen-region.test.ts` on the fixture store (accept, unknown key, region on the wrong kind, state outside the session).
- [X] T019 [opus] [US2] BA read path in `mcp-server/src/services/ba/reads.ts`: `get_evidence(state)` adds `screenshot: bool`, `elements: [{key, role, name, box}]` and `elements_truncated` per contracts/ba-tools-delta.md; `get_record` shows `region` on links. Update the tool description in `ba-tools/index.ts`. Tests next to the existing reads tests.
- [X] T020 [sonnet] [US2] Fixture store support in `docs/src/testing/fixture-store.ts` / `doc-records.ts`: a state with a layout and screenshot blob, plus a sample `screen_region` link, so the docs, BA and dashboard tests can use them.
- [X] T021 [opus] [US2] BA skill and agent: `.claude/skills/ba-practice/` gets when to cite a `screen_region` (every DI cites its field; BR/REQ about a specific control cite it; SCR cites the state), how to read `elements` from `get_evidence`, and that keys are copied verbatim. Update the evidence-kinds list in `.claude/agents/ba.md`.
- [X] T022 [sonnet] [US2] Dashboard highlights: the Screens panel draws this revision's regions as numbered `.hl` outlines with a legend (key, note, "not visible on the screenshot" for null boxes), and the Evidence table shows `region`. `visuals.py` returns regions with boxes from the layout (built together with T016). Tests in `tests/test_visuals.py` (outline present, null-box legend).

**Checkpoint**: run the checks and commit (T017–T022).

---

## Phase 5: User Story 5 – Lower safety level on test environments (P1)

**Goal**: forms are filled and submitted off production; no scrubbing by default; production unchanged.
**Independent test**: map `reference-insurer` and reach the calculator result; `reference-insurer-readonly` sends no POST.

- [X] T023 [opus] [US5] `crawler/src/test-values.ts`: a pure `testValueFor(field: AutofillField, override?: string) → string | true | null` per research R9 (email `test@example.test`, tel `500000000`, number within min/max/step, date `2000-01-01`, text `Test` within maxlength/pattern where trivially satisfiable, select = first option that is not a placeholder, required checkbox `true`, radio = first, password `Test-Pass-1`, file → null/skip). Tests in `crawler/tests/test-values.test.ts`; the in-page part is `crawler/src/autofill.ts` (+ `evalOnElement`), tested in `crawler/tests/autofill.test.ts`.
- [X] T024 [opus] [US5] Map-mode autofill in `mcp-server/src/runtime/pipeline.ts` `actStep`: when `!rs.isTrace`, the portal environment is not production, and the target control submits a form (checked in the page: `el.form` and a submit type), fill the form's empty fields first (persona `trace_inputs` by label override `testValueFor`). Record a `form_autofill` trace event and a decision with the filled field names and values. Nothing changes on production (the env guard still refuses).
- [X] T025 [opus] [US5] Scrub flag plumbing (as built: snapshot and title only, see research R9): the pipeline masks the stored ARIA snapshot, the title and form fields, `network-recorder` shapes and agent notes only when `effective.portal.pii_scrub` is true. The fingerprint keeps using `maskText(snapshot)`. `inputValue` applies `isSyntheticInput` only when `pii_scrub` is true. Update affected tests (`pipeline`, `network-recorder`, `agent-notes`, `audit:pii` script expectations).
- [X] T026 [opus] [US5] Integration test `mcp-server/tests/autofill.test.ts` (+ `pii-scrub.test.ts`): a map run on `reference-insurer` (sandbox) reaches the states behind the contact form and the vehicle form through autofill and submit; a map run on `reference-insurer-readonly` (production) produces no POST in the reference portal's request log (SC-006).
- [X] T027 [sonnet] [US5] Mark spec 001 FR-011 superseded in `specs/001-crawler-map-mode/spec.md`, and mark finding I1 superseded in the `roadmap.md` notes and `specs/004-ba-documentation` where it is listed. Update the crawler agent prompt (`.claude/agents/crawler.md`): map mode may submit forms off production, and autofill fills them.

**Checkpoint**: run the checks and commit (T023–T027).

---

## Phase 6: User Story 3 – A uniform wireframe of every screen (P2)

**Goal**: deterministic SVG plus Excalidraw per state, shown as a fallback and downloadable.
**Independent test**: generate twice and get identical bytes; the Excalidraw file opens with the same layout.

- [X] T028 [opus] [US3] `wireframe/src/model.ts` + `layout.ts`: parse YAML with `parseAriaYaml` and `elementKeys` from core, and build a flat list of positioned primitives (box, text, line, frame) using the single-column flow and node table in contracts/wireframe-format.md (caps: 120 nodes, table 4×4, list 8, 60-character labels).
- [X] T029 [opus] [US3] `wireframe/src/svg.ts` and `excalidraw.ts` per contracts/wireframe-format.md (fixed palette, `data-key` groups, integer coordinates, fixed attribute order; Excalidraw ids and seeds from sha1 of key+part, `customData.key`, fixed key order). `renderWireframe` in `index.ts`.
- [X] T030 [opus] [US3] Golden tests `wireframe/tests/render.test.ts`: fixture snapshots (calculator-like form page, a long list page, nested landmarks, duplicates) to `.svg`/`.excalidraw` goldens, byte-identical on a second render, and an Excalidraw shape check (required element fields, valid JSON).
- [X] T031 [sonnet] [US3] Generate on state creation in `pipeline.ts`: render, then upsert `state_wireframes` with refs and `GENERATOR_VERSION` (via a `services/wireframes.ts` helper). Failure becomes a warning, never a failed state.
- [X] T032 [sonnet] [US3] CLI `apps/crawler/scripts/wireframes-build.ts` and script `wireframes:build <portal> --env <env> [--all]`: (re)generate wireframes for states with none or a stale `generator_version`, and print counts. Test it with the fixture store.
- [X] T033 [sonnet] [US3] Dashboard: the Wireframe tab and the no-screenshot fallback on the state page and the Screens panel use the `state_wireframes` refs; downloads use `/evidence/{ref}?download=<state title slug>`. Extend `tests/test_state_page.py`.

**Checkpoint**: run the checks and commit (T028–T033).

---

## Phase 7: User Story 4 – Pictures in the exported SRS (P2)

**Goal**: the export embeds screenshots, wireframes and highlight crops deterministically.
**Independent test**: two exports give an empty `diff -r`; images show in `03-screens.md` and under DI/BR records.

- [X] T034 [opus] [US4] `docs/src/render/images.ts`: `highlightCrop(png, regions[], padding = 120) → Uint8Array` with 3 px `#E8590C` outlines and numbered badges from a built-in 5×7 digit font, encoded by `pngjs` with `deflateLevel: 9` and `filterType: 4`; `screenFiles`/`highlightFiles`/`imageFiles` give the file list per contracts/srs-export-delta.md. Tests in `docs/tests/export-images.test.ts` (byte-stable crop, outline pixels).
- [X] T035 [opus] [US4] Export model plus writer: `loadExportModel` gains per-record visuals (screens of SCR records, regions with boxes from the layout, wireframe refs); `exportSrs` takes `evidenceRoot` and returns `Map<string, string | Uint8Array>`; `writeExport` creates subfolders and writes binaries in sorted order; `scripts/docs-export.ts` passes the evidence root.
- [X] T036 [sonnet] [US4] Chapters (as built: once, in the shared `recordBlock` via `visualLines` in `render/format.ts`, so every chapter gets them): SCR screenshot, wireframe, Excalidraw link, fallbacks; highlight images and legend for records with regions; the `front.ts` README line, and `records-json.ts` `visuals` (null when absent). Update the export golden tests in `docs/`.
- [X] T037 [opus] [US4] Determinism test `docs/tests/export-images.test.ts`: export the fixture store twice into temp dirs and compare file lists and bytes, and check that every Markdown image link resolves to an exported file.

**Checkpoint**: run the checks and commit (T034–T037).

---

## Phase 8: Polish and close-out

- [X] T038 [sonnet] Glossary: add or update `docs/glossary/glossary.yaml` entries for `screenshot`, `layout`, `element key`, `screen region`, `wireframe`, `form autofill`, `PII scrubbing` (now opt-in), and update `evidence` with the new kinds; run `uv run pathfinder-glossary --write` in `apps/dashboard`.
- [X] T039 [sonnet] Update the README files (root `README.md` — there is no `apps/crawler/README.md` — and `apps/dashboard/README.md`) with screenshots, wireframes, `wireframes:build` and the wipe procedure; the constitution's Sync Impact Report stays until commit, then is removed per its own note.
- [x] T040 [opus] Wipe and re-crawl per quickstart §0–§3: map `reference-insurer`, run a BA session, then check SC-001, SC-002 and SC-006 and record the numbers in `specs/008-screenshots-wireframes/quickstart.md` (validation notes). Log every bug in `findings.md`.
- [x] T041 [opus] Quickstart §4–§5: dashboard spot check of 20 region highlights (SC-003), an Excalidraw open check (SC-004) and export determinism plus a zip check (SC-005). Record the results. (SC-004 open check deferred by the user for later verification.)
- [X] T042 [opus] Run speckit-analyze over spec, plan and tasks; resolve the findings; record them in the roadmap notes.
- [x] T043 User review (SC-007), then close-out: tick validation, update roadmap/spec status, changelog (po agent, before merge), merge to master, delete the branch.

---

## Dependencies & Execution Order

- Setup (T001–T002), then Foundational (T003–T008), which blocks everything.
- US1 (T009–T016) is the MVP. US2 needs US1's capture (T010) and the dashboard panel (T016).
- US5 (T023–T027) depends only on Foundational (T005, T008) and can run in parallel with US1/US2.
- US3 (T028–T033) depends on T006. The dashboard part (T033) needs T015.
- US4 (T034–T037) needs US1–US3 data (T010, T018, T031).
- Polish comes after all stories. T040/T041 need a full build.

## Parallel Opportunities

- T002 ∥ T001. T006, T007 and T008 can run in parallel after T004/T005.
- In US1, T012 and T013 (dashboard) run in parallel with T009–T011 (crawler).
- US5 (T023–T026) can run in parallel with US1/US2. T028–T030 (wireframe package) can run in
  parallel with US1/US2.
- Sonnet tasks (T003, T004, T008, T012, T014–T016, T020, T022, T027, T031–T033, T036, T038,
  T039) can go to background Sonnet subagents. Opus reviews, runs checks and commits per group.

## Implementation Strategy

1. MVP: Setup, Foundational, then US1, which gives screenshots in the dashboard. Validate and
   commit.
2. US2 (regions) and US5 (safety level), which gives the BA value and states behind forms.
3. US3 (wireframes), then US4 (export).
4. Polish: re-crawl, measure, analyze, then the user review.
