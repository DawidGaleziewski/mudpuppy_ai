# Spec 059: the to-be draft editor in React (R-96, step 10)

**Branch:** `feature/059-r96-process-editor` · **Owner (2026-10-23):** "Proceed work as long as you
can without my help". Step 9 moved one process with a to-be model read only; this step lets a
person draw it (designer screen 05), as the htmx editor does.

## What this step builds

- **FR-001 The API.** A to-be model on `GET /api/portals/{p}/processes/{key}` shows the person's
  own draft when they have one (the head otherwise) and gains `editor`
  (`queries_app_process_editor.py`): whether the person may draw it, the draft (its base
  revision, when it was saved, how many changes are pending, whether someone saved first), the
  steps exactly as stored, each step's change against the model it was branched from, what it
  removed, and A's steps for reference.
- **FR-002 The writes**: `POST /api/portals/{p}/processes/{id}/models/{L}/draft` (`base_rev`,
  `steps`: the autosave, a PUT to the chat service), `…/discard` (DELETE), `…/save` (`base_rev`,
  `note`), `…/rebase`; `L` is a to-be label (never A). Signed, `{ok, message, href}` as every
  console write.
- **FR-003 The editor** on `/app/portals/:portal/processes/:key?model=B`: the draft bar (Draft of
  B rN+1, N changes since B rN, autosaved at, only you see it; Discard, Save as B rN+1), the
  conflict notice (Someone saved first: Compare your draft, Rebase), each step with its change
  and ↑ ↓ Merge →, + Add step (title, route), and for the selected step Change step, Add
  annotation and Remove step. The step operations are the htmx editor's, done in the page; the
  draft is saved after each one. `ProcessSteps.tsx` is split by concern (spec 058 finding #3).

## Decisions (for the owner to review)

- D-1: a step operation saves the person's draft without asking first, as the htmx editor does:
  the draft is theirs alone, nobody else sees it, and Discard undoes it. Save (a revision others
  see), Discard and Rebase ask first. Every other console write asks first (skill rule 8).

## Not in this step

- Compare (and the change spec) and History: htmx until the next step.

## Validation

- [x] `pnpm typecheck && pnpm lint && pnpm test` in `apps/web` (80 tests: the step operations as
      pure functions; a move autosaved at once with the draft's base revision; Save asking first;
      an annotation signed by the person; the conflict with Rebase and Compare); `pnpm build`;
      `pnpm build-storybook`.
- [x] Dashboard: ruff and the whole suite; `tests/test_api_process.py` (the person's draft, its
      pending changes and step changes, the head for someone without a draft, a conflict; the
      draft writes' methods and signed bodies, 404 on A and on an unknown operation).
- [x] `pnpm --dir apps/dashboard ui:check` at 1280 and 390 px: no store (local-dev, sandbox) has a
      to-be model yet, so the editor was not seen on real data; the A view of
      reference-insurer-local PRC-001 passes unchanged after the split.

## Close-out review: feature/059-r96-process-editor (2026-10-23)

Files and functions within G-01–G-04 (`Target`, `Shown` carry extra values); no SQL in routers and
the editor helpers shared from `queries_processes.py` (G-13, G-15); typed 404 for A, an unknown
label or operation (G-24); pages compose only; no ask-first gap beyond D-1.

| # | File:line | Guideline | Finding | Change | Size | Outcome |
|---|---|---|---|---|---|---|
| 1 | `apps/web/CLAUDE.md` Layout | G-30 | The new editor files and D-1 not in the notes. | Added | small | fixed |
| 2 | `ProcessSteps.tsx` `Draft`, `ProcessAsIs.tsx` `plural` | G-05 | Shared helpers exported from page files. | `Draft` in `app/useDraft.ts`, `plural` in `app/plural.ts` | small | fixed |
