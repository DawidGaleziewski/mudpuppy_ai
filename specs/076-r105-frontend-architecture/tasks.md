# Tasks: spec 076 (R-105)

Plan: measure first, then change one concern at a time, each a commit with every suite green, so a
regression points at one step. The order puts the checks early, so later steps are held to them.

## Phase 0: baseline and rules

- [X] T001 Baseline: every suite (crawler `pnpm test`, chat + e2e, web, dashboard, workflow,
  proving ground) and both evals (crawler eval and grouping eval on reference-insurer, ≤ $10)
  → `baseline.md` ($8.01 spent; no regression)
- [X] T002 Skills `frontend-architecture` and `frontend-review`; the code-reviewer and frontend-dev
  agents load them; `mudpuppy-react-ui` points at them
- [X] T003 The review report `frontend-review.md` (measures, findings, state today and target,
  improvements, questions)

## Phase 1: the checks (so every later step is held to them)

- [X] T010 `pnpm lint:css` (stylelint: role tokens only, BEM / utility class names, our CSS only),
  `pnpm lint:dead` (knip), `pnpm lint:dup` (jscpd) in `apps/web`
- [X] T011 ESLint layer rules (atoms → molecules → organisms → templates → pages; pages and features
  import `design-system/index.ts` only)
- [X] T012 `.githooks/pre-commit` running the shared check script (web included), Claude Code's hook
  calling the same script; a red web check blocks the commit (tried once: a hex colour)

## Phase 2: dead code and DRY

- [X] T020 Remove what knip finds (unused exports, the unused dependency); htmx left in our code
  (comments, the old-styles script)
- [X] T021 Fold the duplicated blocks: the map canvas of `ScreensMap` / `RecordedMap`, the dialog
  of `Confirm` / `RecordingDialog` (a compound `Dialog`)

## Phase 3: styling

- [X] T030 `styles/utilities.css` from the token scales; `Box` with typed utility props; layout
  components on the utilities
- [X] T031 The live Workbench's placeholder CSS on role tokens and BEM classes in
  `design-system/styles/` (done by removing it: the live Workbench now composes design-system
  components only, so `placeholder.css` is gone and no new CSS was needed)

## Phase 4: atomic layers and compound components

- [X] T040 Move the components into `atoms/`, `molecules/`, `organisms/`, `layout/` (index.ts keeps
  every export); stories and tests follow
- [X] T041 Compound APIs where consumers arrange parts (`Plate`, `Dialog`) (`Dialog` is compound;
  `Plate` keeps its props, since every caller fills the same slots: title, actions, body, foot;
  see `frontend-review.md`)

## Phase 5: state

- [X] T050 RTK Query: the store, the base query (store, As of, `ApiError`), endpoints per domain,
  polling, mutations with tags; the streams update or invalidate the cache; TanStack Query removed
- [X] T051 React Hook Form + zod for the multi-field forms (persona, new portal, settings forms,
  new process, the live persona creator; also plan a scan and add an amendment)

## Phase 6: close-out

- [X] T060 Every suite and `ui:check` again; the code-reviewer with the new skills; roadmap,
  glossary, changelog, merge (crawler 2519 passed + perf; chat 380, e2e 8 / 8; web 223, build,
  Storybook; dashboard, workflow 29, proving ground green; `ui:check` ok on settings, new
  portal, plan a scan, processes, a process, compare, a screen and both Workbenches at 1280 and
  390 px; the review's findings in `frontend-review.md` § 6)
