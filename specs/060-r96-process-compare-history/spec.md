# Spec 060: a process's Compare and History in React (R-96, step 11)

**Branch:** `feature/060-r96-process-compare-history` · **Owner (2026-10-23):** "Proceed work as
long as you can without my help". The last two process pages move (designer screens 06 and 07), so
a process lives in React whole; only its documentation export stays on htmx.

## What this step builds

- **FR-001 The API** over `process_views` (the htmx values, moved out of the router, G-13):
  - `GET /api/portals/{p}/processes/{key}/compare` (`left`, `right`): the step diff (each row's
    change mapped, the left steps it covers, the right step with its annotations, "2 steps into 1"
    for a merge), the counts, the person's draft standing in for its model on the right, and the
    change spec (the saved revision for the pair, else generated: every section as text).
  - `GET …/history`: which model revision is live in each environment and how we know, each
    model's revisions newest first (live where, latest, branched or restored from, restorable),
    the process's own revisions and the change specs; the person's drafts on an older revision.
- **FR-002 The writes**: `…/change-spec` (`left`, `right` as `{label, rev}`, every section,
  `base_rev`), `…/live` (`environment`, `label`, `reason`), `…/models/{L}/restore` (`rev`,
  `base_rev`); signed, `{ok, message, href}` as every console write.
- **FR-003 The pages** `/app/portals/:portal/processes/:key/compare` (Left and Right pickers, the
  legend of counts, the diff table, the change spec form: one field per section, lists one item
  per line, Save spec as rN and Export spec) and `…/history` (the conflict notice, Mark live per
  environment with a model and a reason, the revisions with View, Compare with A and Restore as
  rN, the process's revisions, the specs with Open in Compare). Every write asks first. The process
  page's Compare and History buttons link here.

## Not in this step

- The documentation export (`/processes/{key}/export`) and the spec's Markdown download stay on
  htmx (files, not pages).

## Validation

- [x] `pnpm typecheck && pnpm lint && pnpm test` in `apps/web` (82 tests: the diff with a merge
      and a note, the change spec saved after a confirm with lists split per line, the export
      link; Mark live and Restore after a confirm, the meta line); `pnpm build`;
      `pnpm build-storybook`.
- [x] Dashboard: ruff and the whole suite; `tests/test_api_process_compare.py` (the diff with the
      person's draft, generated sections, 404; live per environment, revisions with origin and
      restorable, conflicts; the three writes' signed bodies and 422s).
- [x] `pnpm --dir apps/dashboard ui:check` at 1280 and 390 px on Compare and History of
      reference-insurer-local PRC-001: all pass. Found on the way: a revision's machine note ("From
      the saved process scope") looked like a person's; only save and restore notes are notes now.

## Close-out review: feature/060-r96-process-compare-history (2026-10-23)

Files and functions within G-01–G-06; `compare_values` and `history_values` moved verbatim into
`process_views.py`, no router imports a router, no SQL in routers (G-13, G-15); plain 404/422
messages (G-24); pages compose only.

| # | File:line | Guideline | Finding | Change | Size | Outcome |
|---|---|---|---|---|---|---|
| 1 | `apps/web/CLAUDE.md` Layout | G-30 | `api-process-compare.ts` and the two pages not in the notes. | Added | small | fixed |
