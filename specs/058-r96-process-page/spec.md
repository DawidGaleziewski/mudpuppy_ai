# Spec 058: one process in React (R-96, step 9)

**Branch:** `feature/058-r96-process-page` · **Owner (2026-10-23):** "Proceed work as long as you
can without my help". Step 8 moved the Processes list; this step moves one process (designer screen
05, v2-10) except the to-be draft editor, which is the next step.

## What this step builds

- **FR-001 The API** `GET /api/portals/{p}/processes/{key}` (`model`, `step`) over
  `queries_processes`, `queries_process_doc` and `queries_model_facts` (`web/api_process.py` over
  `queries_app_process.py`): the head (key, name, persona, stage mapped, live per environment,
  screens, its PROC record, archived), the models (label, kind, revision, an open draft), the model
  shown (A by default until a to-be design starts), its steps, A's documentation per step (picture,
  records by kind with their status, amendments, re-anchors), what is still open, the sign-off and
  whether A changed since, the stages to set, the screens that can be added to A; what the portal
  model knows (triggers, outcomes, explored, checked, rules) and the paths; the selected step. 404
  for an unknown process.
- **FR-002 The writes**, as every console write: `processes/{id}/archive` (`base_rev`),
  `processes/{id}/stage` (`stage`, `base_rev`: sign-off is the move to as-is documented),
  `processes/{id}/models` (`from`: a new to-be model, its page answered), `processes/{id}/models/A/edit`
  (`base_rev`, `state_ids`: A's screens in order, a signed revision), and
  `/api/portals/{p}/check-runs` (`kind` explore, `process_key`).
- **FR-003 The page** `/app/portals/:portal/processes/:key`: the head with Compare, History and
  Documentation (htmx until they move) and Archive; the archived notice with Restore; the model
  switch and "Start a to-be design" / "+ Process model from …"; In the portal model with Explore
  now; Paths; As-is documentation with Mark as-is documented / Sign off and Set stage; A's steps as
  documentation with their pictures and records, Select, ↑ ↓ Remove and Add a screen; the selected
  step's documentation (A) or what it is built from and its annotations (a to-be model, read only).
  The list links each process here.

## Not in this step

- The to-be draft editor (edit, add, merge, annotate, save, discard, rebase), Compare, History and
  the documentation export: htmx until the next steps.

## Validation

- [x] `pnpm typecheck && pnpm lint && pnpm test` in `apps/web` (73 tests: the head, facts, paths
      and A as documentation; a step moved down as a signed revision after a confirm; the sign-off
      and a step selected through the address; an unknown process); `pnpm build`;
      `pnpm build-storybook`.
- [x] Dashboard: ruff and the whole suite; `tests/test_api_process.py` (the default model, a
      to-be model's head and what its steps are built from, A's documentation and addable screens,
      404; the head writes' signed bodies, 422 for a bad stage and an empty A).
- [x] `pnpm --dir apps/dashboard ui:check` at 1280 and 390 px on reference-insurer-local PRC-001
      (A with five documented steps, and step 2 selected): all pass.

## Close-out review: feature/058-r96-process-page (2026-10-23)

No SQL in routers (G-15); `default_model` and `CHECK_RUNS` moved to shared modules rather than a
router importing a router (G-13); no `any`, suppressions, `className` or `style` in pages.

| # | File:line | Guideline | Finding | Change | Size | Outcome |
|---|---|---|---|---|---|---|
| 1 | `web/api_process.py` route | G-04 | Six parameters (PLR0913). | `ProcessQuery` model (`model`, `step`, `env`) as the dashboard's page queries | small | fixed |
| 2 | `apps/web/CLAUDE.md` Layout | G-30 | `api-process.ts` and the process pages not listed. | Added | small | fixed |
| 3 | `ProcessSteps.tsx` (308 lines) | G-05 | Three concerns in one file: as-is documentation, the steps, the selected step. | Split when the to-be editor joins it (spec 059) | large | deferred to spec 059 |
| 4 | `Process.tsx`, `ProcessSteps.tsx` | G-05 | The record page's address built twice. | One `docHref` in `api-process.ts` | small | fixed |

Process note: the reviewer first fixed #1 with a script edit (CLAUDE.md asks for the Edit tool);
the change was redone with the Edit tool as a query model.
