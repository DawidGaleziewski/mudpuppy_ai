# Tasks: Crawler hardening, the "now" set (spec 015, R-28)

**Input**: `specs/015-crawler-hardening/` (spec.md, plan.md, research.md, data-model.md,
contracts/tool-results.md). Branch `feature/015-r28-crawler-hardening`.

**Model tags**: `[opus]` judgment, in-page detection, locator/frame resolution, fingerprint safety,
reviews, eval runs and verdicts; `[sonnet]` code-touching but well specified (schemas, migration,
recorder, field naming, gate promotions, units on given fixtures); `[haiku]` text edits from an
exact list (docs, catalogue rows, prompt lines, roadmap). Sonnet/Haiku run as background subagents
from a brief naming the exact files; they never stash, checkout, reset, add or commit, and format
only the files they touched. Opus reviews, runs the checks and commits per group.

**Rules**: Edit tool only, re-read after editing; log every bug or slip in `findings.md` with a
test/eval idea; slow tier (`pnpm test:slow`) before committing any group that touches
`crawler/src/**` or `mcp-server/src/runtime/**`; ports 4200/4201 free before gates.

`[P]` = can run in parallel with the other `[P]` tasks of its phase (different files).

## Phase 1: Setup

- [x] T001 [opus] Branch, spec, plan, research, data model, contract, quickstart, tasks;
  `.specify/feature.json` → `specs/015-crawler-hardening`.
- [ ] T002 [haiku] `findings.md` (shape of spec 014's); roadmap R-28 → `in progress` with the spec
  link.

## Phase 2: Foundations (no behaviour change)

- [x] T003 [sonnet] [P] Migration `data/migrations/0011_page_composition.{up,down}.sql`
  (`state_observations.composition_json TEXT NULL`) through the `db-admin` agent: db-types, data
  snapshot, `data-model.md` of the store (G-16). (As built: `json_valid` check; Zod
  `StateObservation.composition_json`; spec 001 data-model updated.)
- [x] T004 [sonnet] [P] Zod `PageComposition` and the optional action fields (`found_by`, `frame`,
  `tag`, locator kind `path`), form/field fields (`kind`, `frame`, `submitted_via`,
  `name_source`), network `res_schema` `redirects`/`kind`, edge `options_shown`, in their owning
  model packages (G-09); old rows parse (tests with a pre-0011 row). (As built: `PageComposition`,
  `FoundBy`, `FieldNameSource` in `core/src/schemas/composition.ts`; TS types on `ActionRow`,
  `DomForm`, `LocatorKind`. The network and edge JSON fields are typed where T026/T029 write them.)
- [x] T005 [haiku] [P] Trace events `mfe_mount_timeout`, `frame_skipped`, `clickables_capped`.
  (As built: names in store's `EVENT_NAMES`, where event names live; no trace-schema change needed.)
- [x] T006 [sonnet] [P] Portal config `scope.mfe_wait_ms` (0..60000, default 10000) and
  `scope.frame_depth` (0..5, default 3) in `config/src/portal-schema.ts`; loader tests. (As built:
  `narrowScope` carries both, a persona restriction can lower them; Scope fixtures updated.)
- [x] T007 [opus] **Fingerprint stability lock** (SC-006). (As built: slow tier,
  `mcp-server/tests/fingerprint-stability.e2e.test.ts`: the reference portal's 19 static screens
  through the real pipeline, fingerprints in a snapshot written before any observer change;
  deterministic over three runs. Never update the snapshot to make a spec 015 change pass.)
- [x] T008 [opus] Review T003–T007, fast tier, commit T002–T008.

## Phase 3: US1 Click signals (LO-10) — P1, MVP

- [x] T009 [opus] [US1] `crawler/src/click-signals.ts`: init script wrapping
  `EventTarget.prototype.addEventListener` into a `WeakSet` (click, mousedown, mouseup,
  pointerdown, pointerup, touchstart); defensive, never throws into the page; installed by
  `session.ts` on the context before the first navigation. Small browser unit test. (As built:
  passed as source with the `__name` shim; checked under tsx too.)
- [x] T010 [opus] [US1] `crawler/src/clickables.ts`: in-page detector (signals `listener`,
  `inline`, `framework`, `cursor`, `tabindex`; skip elements with or inside a clickable role;
  innermost carrier; 5000-element cap) returning `{ name, found_by, tag, text, path, nth }`; the
  dedupe and naming as pure functions with fixture tests (R1). (As built: in-page helpers sent with
  `evalWithHelpers` (G-02); `locateClickable` for `act`.)
- [x] T011 [opus] [US1] `action-extractor.ts` + `locators.ts`: merge signal-found candidates after
  role-based ones (role `generic`), `text`/`path` locators (no classes, no ids), cap and
  `clickables_capped`; safety classification by name as for buttons (FR-002). Unit tests incl.
  LO-13/LO-14 shapes.
- [x] T012 [opus] [US1] `observer.ts` runs the detector; `mcp-server` `act.ts` resolves `text`/`path`
  locators (0 or >1 → existing `locator` error, FR-003); `found_by` in the page result (contract).
  (As built: `record-transition.ts` `ActionInput` takes the new fields, F-03.)
- [x] T013 [sonnet] [US1] Promote LO-10 in `gates/tests/shop.test.ts` to `gate()`; add the bank
  "Wykonaj" case (`/bank/przelew`) as a second LO-10 assertion. (As built: LO-10 and LO-34 act in
  runs of their own so LO-51's cart stays empty.)
- [x] T014 [opus] [US1] Review, T007 lock, fast + slow tier, commit T009–T014. (One commit with
  Phases 4, 6 (T024, T026), 8: the work landed together in the same files.)

## Phase 4: US3 + US2 Frames (LO-04, LO-02 iframe) — P1

- [x] T015 [opus] [US3] `crawler/src/frames.ts`: frame walk to `frame_depth`, frame paths, origin
  and scope check; pure frame-snapshot joining with fixture tests (a frame-less page is
  byte-identical: FR-005). (As built: `withFrameSnapshots` APPENDS `- iframe "<name|path>":`
  blocks after the top snapshot instead of splicing at the node: hidden iframes have no node, and
  the label never holds a URL so session ids cannot split states.)
- [x] T016 [opus] [US3] `observePage` per observed frame: ARIA, forms, test ids, clickables with
  `frame`; composition `frames`/`frames_skipped`; `frame_skipped` events; cross-origin
  out-of-scope frames give no actions (widget stays untouched). (As built: `page-candidates.ts`
  extracts per document; a `chrome-error:` frame is `failed`, F-06.)
- [x] T017 [opus] [US3] `act.ts` resolves the action's frame, then its locator inside it. (As
  built: by live frame path (`frameByPath`), not frame locators; settle already covers frame
  requests; `javascript:` postback links are clicked, not refused as URLs, F-05.)
- [x] T018 [sonnet] [US3] `record-state.ts` writes `composition_json` (pure `pageComposition`,
  unit-tested; mounts and loaders from the settle's mount wait).
- [x] T019 [sonnet] [US2] [US3] Promote LO-04 and LO-02 (iframe part) in `gates/tests/bank.test.ts`;
  add a case that an action inside the legacy content frame can be acted on (AS3.2) and one that
  the CAPTCHA widget frame yields no actions (LO-37 in `auth.test.ts`).
- [x] T020 [opus] Review, T007 lock, slow tier, commit (with T014).

## Phase 5: US2 Mount wait (LO-02) — P1

- [x] T021 [opus] [US2] `crawler/src/mounts.ts`: mount points + loaders probe; `stabilizer.ts`
  waits while a mount is empty and a script is in flight, bounded by `mfe_wait_ms`; composition
  `mounts`/`loaders`, bundle URLs from script requests; `mfe_mount_timeout` event and
  `mounts_pending` in the page result. (As built: the wait sits in mcp-server's `settle` step after
  the normal settle, then settles again; it waits only when a run-time loader is present and a
  mount is empty; bundles from the page's resource timings (scripts not named by a `<script src>`);
  top document only, frames' mounts not probed. `frames` count also in the page result.)
- [x] T022 [sonnet] [US2] A new gate case LO-02 "a slow micro-frontend bundle is waited for": the
  proving-ground shell with a delayed bundle (proving-ground test hook or query flag; if the
  estate needs a change, `apps/proving-ground` backend/web, with its own `uv run pytest`).
- [x] T023 [opus] Review, slow tier, commit T021–T023. (As built: the proving ground serves
  `/__test/bundle-delay?ms=` (cookie `pg_bundle_delay_ms`, test only); the gate widens the temp
  portal's `allowed_paths` for it.)

## Phase 6: US4 Fields and div forms (LO-11), US7 Document POST (LO-43) — P2

- [x] T024 [sonnet] [US4] [P] `crawler/src/forms.ts` (move `extractForms` out of `observer.ts`):
  naming order and `name_source` (R5), keep fields without `name`/`id`, `nearby_text` from the
  wrapper or the table row; browser unit tests on small fixtures (placeholder only, label in next
  cell, wrapped React-like inputs). (As built: a field with a `name`/`id` keeps it as its name, so
  recorded data stays stable; the label goes to a new `label`; `record-form.ts` takes both.)
- [x] T025 [opus] [US4] `div` form detection (container rule, submit-like names from config) and
  `submitted_via` linking in `record-page.ts` when its submit action ran. (As built: `forms.ts`
  `readDivForms`, container = nearest ancestor with a submit-like control, else body; names in
  code, not config; the ARIA extractor ignores div forms when joining `form` nodes. `submitted_via`
  is deferred: F-10.)
- [x] T026 [sonnet] [US7] [P] `network-recorder.ts`: document requests with a non-GET method,
  form-encoded/multipart body shape (names and value shapes, never file contents), redirect chain
  into `res_schema.redirects`, `kind: 'document'`; plain GET documents stay out (AS7.2). Unit tests.
  (As built: a submit probe reports multipart field names, since Chromium gives no post data with
  a file; the session awaits it before the first page. LO-11 and LO-43 promoted with it.)
- [x] T027 [sonnet] [US4] [US7] Promote LO-11 (`bank.test.ts`) and LO-43 (`insurer.test.ts`); add
  the insurer S08 "label in the next cell" assertion and the bank div-form `submitted_via` case.
- [x] T028 [opus] Review, slow tier, commit T024–T028. (As built: the legacy claim form's inputs have
  names, so the gate checks their `label` from the next cell; the checkout `div` form gate checks
  its fields; a placeholder without letters ("00-000") yields to the text next to the field.
  `submitted_via` deferred, F-10.)

## Phase 7: US5 Custom widgets (LO-18), US6 Shared state (LO-34) — P2

- [~] T029 [opus] [US5] `options_shown` on an act that opens a popup (new subtree, R6); check the shop
  category/sort dropdowns and the insurer date picker work through the generic loop; fix what the
  gates show. (As built: the generic loop works: the shop dropdowns are issued (LO-18 gate) and
  their options appear as actions of the opened state. `options_shown` on the edge is deferred
  (F-11): the options are already evidence as the next state's actions.)
- [x] T030 [sonnet] [US5] [US6] Promote LO-18 and LO-34 (`shop.test.ts`); new LO-18 case on the
  insurer date picker "Data rozpoczęcia" (`insurer.test.ts`): open, pick a day, value on the step.
- [x] T031 [opus] Review, slow tier, commit T029–T031. (The date picker opens and a day is picked
  through the generic loop: gate.)

## Phase 8: US8 Resumed depths (F-04@004) — P3

- [x] T032 [opus] [US8] Confirm the cause with the gap case, then rebuild `depthByState` (source
  depth) and `depthByUrl` in `browser-runtime.ts` (R9); promote F-04@004 in `findings.test.ts`;
  slow tier; commit T032. (As built: `frontier.depth` is the page's own depth, so the state depths
  were right; `depthByUrl`, which `navigate` reads, was never rebuilt: now from each action's
  `page_url`.)

## Phase 9: Agent, docs

- [x] T033 [haiku] [P] `.claude/agents/crawler.md`: the two lines of R10 (actions from click signals
  and frames are acted on as usual; one re-`navigate` after an empty mount).
- [x] T034 [haiku] [P] `docs/legacy-obstacles.md`: the eight rows' status → handled (with spec 015);
  package `CLAUDE.md` files of `crawler` and `mcp-server` list the new files (G-30).
- [x] T035 [haiku] [P] Glossary entries for "click signal", "signal-found action", "page
  composition", "mount point", "div form"; `uv run pathfinder-glossary --write` in
  `apps/dashboard`.
- [x] T036 [opus] Review T033–T035, commit. (Opus fixed the prompt placement, the catalogue
  status values and the package notes: F-12.)

## Phase 10: US9 Proof on the goal — P1

- [x] T037 [opus] [US9] Evals one at a time (quickstart §3): bank, shop, insurer, reference-insurer;
  port/process check after each; every result and cause in `findings.md`; promote improved
  baselines only.
- [x] T038 [opus] [US9] Verdicts SC-001–SC-006 in `findings.md` with the result files they rest on;
  gaps that stay open go back to the roadmap (R-35 or a new note).

## Phase 11: Close-out

- [x] T039 [opus] `pnpm test` (everything) in `apps/crawler` + every app's suite; `code-reviewer`
  agent on the branch (G-31), fix or defer its findings; `pnpm mutate` on the kernel if a pure
  kernel function changed (G-32).
- [x] T040 [haiku] Roadmap R-28 → done with commits; changelog skill (before merge).
- [ ] T041 [opus] Merge to master (squash), tag, push, delete the branch — after the user's go.

## Dependencies

- Phase 2 before everything. T007 (fingerprint lock) before T012, T016.
- US1 (Phase 3) before Phase 7 (LO-18/LO-34 are click-signal cases) and before the bank "Wykonaj"
  div form in T027.
- Phase 4 before Phase 5 (mount probe runs per frame).
- Phase 6 tasks T024 and T026 are independent of Phases 3–5; T025 needs T011 (submit-like
  clickables).
- Phase 8 is independent.
- Phase 10 after Phases 3–8.

## Split summary

| Model | Tasks |
| --- | --- |
| opus (23, reviews included) | T001, T007, T009–T012, T014–T017, T020, T021, T023, T025, T028, T029, T031, T032, T036–T039, T041 |
| sonnet (11) | T003, T004, T006, T013, T018, T019, T022, T024, T026, T027, T030 |
| haiku (6) | T002, T005, T033, T034, T035, T040 |
