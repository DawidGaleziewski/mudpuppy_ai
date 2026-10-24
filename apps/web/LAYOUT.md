# @mudpuppy/web: file map

What each file does, by page. The agent notes (`CLAUDE.md`) keep the rules; this file keeps the
map (G-30; moved out of `CLAUDE.md` in spec 074).

## Design system (`src/design-system/`)

- `components/`: one file per component, owning its `sy-` classes; `components/zoom.tsx` is the
  zoom bar and pointer zoom that `Graph` and `Diagram` share; `State` is a region's loading,
  empty or failed state.
- `stories/`: a stories file per component, `Introduction.mdx`, `Rules.mdx`, `Tokens.mdx`.
- `assets/`: the designer's CSS and fonts, a copy (never edit; `pnpm ds:sync`).
- `index.ts`: the one import.
- `Diagram` draws Mermaid from the vendored copy in `public/vendor/` (served at
  `/app/vendor/mermaid.min.js`); without it, the source shows as text.

## The app (`src/app/`)

- `App.tsx`: routes under `/app/`, the query client, the scroll on a move.
- `api.ts`: typed endpoints and TanStack Query hooks; one `api-<page>.ts` per page group.
- Processes: `api-processes.ts`; `api-process.ts` for one process, whose page is `Process.tsx`
  with `ProcessFacts.tsx`, `ProcessAsIs.tsx` (A's sign-off and stage), `ProcessSteps.tsx`,
  `SelectedStep.tsx` and `ProcessEditor.tsx` (the to-be draft bar); the draft is `stepOps.ts`
  (pure step operations) and `useDraft.ts` (each one autosaved, no ask first; Save, Discard and
  Rebase ask); `api-process-compare.ts` is the process's Compare and History data
  (`ProcessCompare.tsx`: step diff and change spec; `ProcessHistory.tsx`: which model runs where,
  every revision, Mark live and Restore).
- Review: `api-review.ts` (`Review.tsx`: tabs, kinds and filters; `ReviewRows.tsx`: a group's
  rows, alike sets and the selection decided at once; `ReviewDetail.tsx`: the selected item, its
  decision or a record's review; an `Ask` may carry `undo`, the ask a decision's Undo opens;
  `ReviewItems.tsx`: a difference, an amendment to re-anchor, a proposal (before → after);
  `ReviewSuite.tsx`: a probe suite edited and approved; `useReviewKeys.ts`: the single keys
  J/K/C/R/U/? and the switch that turns them off; Before / after adds Esc).
- What changed: `api-changes.ts` (`Changes.tsx`: range, release lanes, filters, the groups) and
  Before / after (`Change.tsx`: the sides as `Shot`s in three modes, what differs, the
  explanation with the decision bar through Review's decide).
- Rules: `api-rules.ts` (`Rules.tsx`: by status, Run the rule tests; `Rule.tsx`: wording and
  Reword, decision table, tests, history, the export).
- Docs: `api-docs.ts` (`Docs.tsx`: sections, records, pages); `api-doc.ts` one record
  (`DocRecord.tsx`, its parts in `DocContent.tsx`) and a session (`DocSession.tsx`).
- Settings: `api-settings.ts` (`Settings.tsx`, `SettingsModel.tsx`, `PersonaForm.tsx`).
- Screens: `api-screens.ts`; `ScreenNeighbours.tsx` (Prev / Next between screens over the list
  they came from).
- Scans: `SectionPaging.tsx` (a scan section's filters and cursor pager, kept in the page
  address; `api-scan-tabs.ts` and `api-scan-trace.ts` are its data), `scanLinks.ts` (every scan
  section's address).
- The assistant: `api-assistant.ts` the drawer (`AssistantDrawer.tsx`, `AssistantParts.tsx`;
  `Shell` opens it, pages pass `context`; `assistant-context.ts` lets a page ask it, as
  `HomeAssistant.tsx` does).
- Writes: `api-write.ts` (`postJson`, the one mutation hook and every write),
  `ConfirmedWrite.tsx` (ask first, post, show the answer: every write goes through it; an `Ask`
  may carry `follow`, the link's word, and `onDone`, run after a recorded write).
- The frame: `Shell.tsx` (one frame around every page, spec 073; pages hand up their section,
  portal and context), `PortalMenu.tsx` (the header's portal picker), `StoreMenu.tsx` (the data
  store; the store follows the portal), `AsOfMenu.tsx` (As of; on one item only its versions),
  `QueryState.tsx` (loading and error), `ShownStatus.tsx` (a status as the API maps it).
- Links: `RouterAnchor.tsx` (`routerLink` for the design system's `LinkProvider`, `useGo` for
  moves made by code); `store.ts` and `asOf.ts` keep `?store=` and `?as_of=`;
  `listAddress.ts` (the query a list last had, for crumbs back to it).

## The live Workbench (`src/workbench-live/`, spec 075, the R-96 spike)

- `LiveWorkbench.tsx`: the page at `/app/portals/{p}/workbench/live` (loaded lazily: A2UI is
  its own chunk): the conversation with each turn's A2UI surface, the stage with the scan live.
- `useLiveWorkbench.ts`: the WebSocket (`LiveLink`: reconnect, heartbeat watchdog, a fresh
  snapshot after a lost `seq`), AG-UI frames into the state (JSON Patch) and the surfaces' data
  model (at the item, F-03); `protocol.ts`: the frames and the state's shape.
- `catalog.tsx` (the designer's catalog id and names), `catalog-scan.tsx` (LiveMap with the graph
  and route, ScanMeter, Narration, ErrorCard, PageDetail, PageMiniature), `catalog-cards.tsx`
  (View, CommandCard, Choice, the record cards), `PersonaCreator.tsx` (persona.add: a sign-in to
  the vault only), `context.ts` (the frame's state for the components).
- `placeholder.css`: grey boxes (owner 2026-10-24) until the designer's look; the only place in
  the app that styles outside the design system (spec 075 D-4).

## Pages and tests

- `src/pages/`: one file per page.
- `tests/`: Vitest + Testing Library (components, pages with a stubbed API, the design-system
  drift).
