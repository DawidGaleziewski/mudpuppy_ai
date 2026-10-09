# Implementation Plan: Crawler hardening, the "now" set (R-28)

**Branch**: `feature/015-r28-crawler-hardening` | **Date**: 2026-10-09 | **Spec**: [spec.md](spec.md)

## Summary

Make the crawler see what real legacy portals are made of. Four mechanisms carry all eight gaps:

1. **Click signals** (R1, R2): an init script that notes click listeners, plus an in-page detector,
   turns role-less clickable elements into `generic` actions with `found_by` signals and stable
   text/path locators. Fixes LO-10 and, through the generic loop, LO-18 and LO-34.
2. **Frame walk** (R3): observation walks frames to depth 3 and splices same-origin/in-scope frame
   snapshots under their node; actions carry a frame path; `act` resolves through frame locators.
   Fixes LO-02 (wrapper iframe) and LO-04 (frameset). Pages without frames keep their fingerprint.
3. **Mount wait** (R4): settle waits, bounded, for empty micro-frontend mount points while a loader
   is still fetching; the observation records mounts, loaders and bundle URLs. Rest of LO-02.
4. **Capture gaps closed** (R5, R8, R9): fields named from any nearby source with `name_source`,
   `div` forms, document POSTs with their redirects, depths rebuilt on resume. LO-11, LO-43, F-04.

The goal measure is the eval (`crawl_screens`) on the four spec 014 baselines.

## Technical Context

**Language/Version**: TypeScript (strict), Node 22; Python 3.13 only for the proving ground (unchanged)
**Primary Dependencies**: Playwright 1.63 (library), Zod, Kysely + better-sqlite3, Vitest
**Storage**: SQLite; one migration `0011_page_composition` (nullable column), JSON fields extended
**Testing**: Vitest fast tier (pure + small browser units), slow tier (`*.e2e.test.ts`, gates on the
proving ground, ports 4200/4201), tier-2 eval (`pnpm eval`)
**Target Platform**: Linux (WSL2) dev box, headless Chromium
**Project Type**: monorepo apps (`apps/crawler` packages `crawler`, `mcp-server`, `config`, `store`,
`trace`, `gates`)
**Performance Goals**: observation of a page without frames or clickables no slower than +100 ms
(detector one DOM pass, capped at 5000 elements); mount wait only when a mount is empty
**Constraints**: fingerprints of frame-less pages unchanged (FR-005, SC-006); no new MCP tools; safety
classification unchanged for every new action; cross-origin out-of-scope frames never acted on
**Scale/Scope**: pages up to ~5000 elements; per-state action cap 200 stays

## Constitution Check

| Principle | Check | Status |
| --- | --- | --- |
| I Observed vs inferred | `found_by`, `name_source` let the BA label signal-found actions and nearby-text names `inferred` | pass |
| II Evidence | composition, frames, bundles and POST shapes are recorded with the observation/edge they come from | pass |
| III Role separation | detection is deterministic tool code; the one crawler agent only sees more actions; no BA change | pass |
| IV Replay | not touched | n/a |
| V Safety | new actions go through `classifyAction` and the action limits; widget/cross-origin frames get no actions; init script only observes (no page change) | pass |
| VI Human in the loop | not touched | n/a |
| VII Deterministic core | dedupe, naming, splicing, composition schema are pure functions with unit tests on saved fixtures; in-page code is thin and covered by small browser units | pass |
| Tech: Zod single source | `PageComposition`, new action/field fields are Zod schemas in the owning model package (G-09) | pass |
| Tech: storage | one reversible migration through `db-admin` (G-16) | pass |

Post-design re-check: pass (no violations, no complexity tracking needed).

## Project Structure

### Documentation (this feature)

```text
specs/015-crawler-hardening/
├── spec.md  plan.md  research.md  data-model.md  quickstart.md
├── contracts/tool-results.md
├── checklists/requirements.md
├── findings.md            # created on the first finding (FR-014)
└── tasks.md
```

### Source code

```text
apps/crawler/packages/
├── crawler/src/
│   ├── click-signals.ts      NEW  init script: listener WeakSet (installed per context)
│   ├── clickables.ts         NEW  in-page detector + pure dedupe/naming helpers
│   ├── frames.ts             NEW  frame walk, frame paths, snapshot splicing (pure splice)
│   ├── mounts.ts             NEW  mount point + loader probe
│   ├── forms.ts              NEW  extractForms moved out of observer.ts, field naming, div forms
│   ├── observer.ts           observePage = frames × (aria, forms, testIds, clickables) + composition
│   ├── action-extractor.ts   merges signal-found candidates; locators text/path + frame
│   ├── locators.ts           kinds `path`, frame prefix
│   ├── stabilizer.ts         mount wait condition
│   ├── session.ts            installs the init script on the context
│   └── network-recorder.ts   document POST + redirect chain
├── mcp-server/src/runtime/
│   ├── pipeline/act.ts       resolve frame + text/path locators (0 or >1 → existing locator error)
│   ├── pipeline/record-state.ts  writes composition_json
│   ├── pipeline/record-page.ts   div forms, submitted_via link, options_shown
│   └── browser-runtime.ts    resume depths (F-04)
├── config/src/portal-schema.ts   scope.mfe_wait_ms, scope.frame_depth
├── store/ (db-types) + data/migrations/0011_page_composition.{up,down}.sql
├── trace/                    events mfe_mount_timeout, frame_skipped, clickables_capped
└── gates/tests/              gap → gate for the eight cases; new LO-18 date-picker case on insurer
.claude/agents/crawler.md     two lines (R10)
docs/legacy-obstacles.md      status of the eight rows
```

**Structure Decision**: all work stays in `apps/crawler`; no new package. New in-page concerns get
their own files (G-05); `observer.ts` shrinks by moving `extractForms` out (G-06).

## Build order and why

1. Foundations: migration + schemas + trace events + config (no behaviour change).
2. **US1 click signals** first: it is the user's top priority and LO-18, LO-34 and part of LO-11
   (bank "Wykonaj") depend on it.
3. **US2/US3 frames** next: the bank legacy screens (F-05@014) sit behind them; LO-02 iframe and
   LO-04 frameset share the frame walk.
4. US2 mount wait.
5. US4 fields/div forms, US7 document POST (independent, parallel).
6. US5, US6: promote once US1 lands; fix what the gates show.
7. US8 resume depths (independent, any time).
8. US9 evals, findings, docs, close-out.

## Risks

- **Fingerprint drift** (SC-006): guarded by a stability test over stored reference-portal snapshots
  before any observer change lands.
- **Action floods** from `cursor: pointer` on whole tables: cap + grouping + `clickables_capped`.
- **Eval cost**: four evals ≈ an evening of quota; run one at a time and stop the chain on a limit.
- **Init script and pages that freeze `EventTarget.prototype`**: the wrapper is defensive (try, and
  never throws into page code); failure falls back to the other signals and is logged once.
