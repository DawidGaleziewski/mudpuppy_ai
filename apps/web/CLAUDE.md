# @mudpuppy/web

The MudPuppy console as a React single-page app (R-96; owner 2026-10-22: "whole app to be react
from now, no more htmx"). The Salvage Yard design system as React components, documented in
Storybook; pages over the dashboard's JSON API (`/api`, read-only on the store).

**All work here follows skill `mudpuppy-react-ui`.** Pages compose design-system components and
never style (lint refuses `className` and `style` in `src/pages` and `src/app`).

## Run

- `pnpm --dir apps/web dev` → http://127.0.0.1:5173/app/ (Vite; `/api` proxied to the dashboard
  on 8765, so start the dashboard too).
- `pnpm --dir apps/web build` → `dist/`, served by the dashboard at http://127.0.0.1:8765/app/.
- `pnpm --dir apps/web storybook` → http://127.0.0.1:6006 (every component, the rules, the tokens).
- `pnpm --dir apps/web ds:sync` after the designer changes `docs/design/salvage-yard/design-system/`.

## Layout

- `src/design-system/`: `components/` (one file per component, owning its `sy-` classes),
  `stories/` (a stories file per component, `Introduction.mdx`, `Rules.mdx`, `Tokens.mdx`),
  `assets/` (the designer's CSS and fonts, a copy: never edit), `index.ts` (the one import).
- `src/app/`: `App.tsx` (routes under `/app/`, the query client), `api.ts` (typed endpoints and
  TanStack Query hooks; one `api-<page>.ts` per page group, e.g. `api-recorded.ts`, `api-scan.ts`, `api-processes.ts`, `api-process.ts` for one process, whose page is
  `Process.tsx` with `ProcessFacts.tsx`, `ProcessAsIs.tsx` (A's sign-off and stage),
  `ProcessSteps.tsx`, `SelectedStep.tsx` and `ProcessEditor.tsx` (the to-be draft bar); the draft
  is `stepOps.ts` (pure step operations) and `useDraft.ts` (each one autosaved, no ask first; Save,
  Discard and Rebase ask); `api-process-compare.ts` is the process's Compare and History data
  (`ProcessCompare.tsx`: step diff and change spec; `ProcessHistory.tsx`: which model runs where,
  every revision, Mark live and Restore); `api-review.ts` is the Review page's data and writes
  (`Review.tsx`: tabs, kinds and filters; `ReviewRows.tsx`: a group's rows, alike sets and the
  selection decided at once; `ReviewDetail.tsx`: the selected item, its decision or a record's
  review; an `Ask` may carry `undo`, the ask a decision's Undo opens; spec 063 adds
  `ReviewItems.tsx`: a difference, an amendment to re-anchor, a proposal (before → after);
  `ReviewSuite.tsx`: a probe suite edited and approved; `useReviewKeys.ts`: the single keys
  J/K/C/R/U/? and the switch that turns them off; Before / after adds Esc));
  `api-changes.ts` is What changed (`Changes.tsx`: range, release lanes, filters, the groups) and
  Before / after (`Change.tsx`: the sides as `Shot`s in three modes, what differs, the
  explanation with the decision bar through Review's decide); `api-rules.ts` is Business rules
  (`Rules.tsx`: by status, Run the rule tests; `Rule.tsx`: wording and Reword, decision table,
  tests, history, the export); `api-docs.ts` is Docs (`Docs.tsx`: sections, records, pages) and
  `api-doc.ts` one record (`DocRecord.tsx`, its parts in `DocContent.tsx`) and a session (`DocSession.tsx`);
  `api-settings.ts` is Settings (`Settings.tsx`, the model's parts in `SettingsModel.tsx`),
  `api-write.ts` (`postJson`, the one mutation hook and every write), `ConfirmedWrite.tsx` (ask
  first, post, show the answer: every write goes through it; an `Ask` may carry `follow`, the
  link's word, and `onDone`, run after a recorded write), `ShownStatus.tsx` (a status as the
  API maps it), `SectionPaging.tsx` (a scan section's filters and cursor pager, kept in the page
  address; `api-scan-tabs.ts` and `api-scan-trace.ts` are its data), `scanLinks.ts` (every scan
  section's address), `Shell.tsx`, `QueryState.tsx`.
- The design system's `Diagram` draws Mermaid from the dashboard's vendored copy at
  `/static/vendor/mermaid.min.js` (Vite proxies `/static` in development); without it, the source
  shows as text.
- `src/pages/`: one file per page.
- `tests/`: Vitest + Testing Library (components, pages with a stubbed API, the design-system drift).

## Tests

- `pnpm typecheck && pnpm lint && pnpm test` before every commit; `pnpm build` and
  `pnpm build-storybook` before a merge.
