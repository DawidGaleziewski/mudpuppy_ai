# Spec 073: Console bugs from the owner's UI review (R-103)

**Branch:** `feature/073-r103-console-bugs` · **Source:** `user_input/review/2_ui_dislikes.md`
(2026-10-24, items 1–10), roadmap R-103 (1)–(11). The design questions from the same review
(`user_input/review/3_designer_questions_round4.md`, Q1–Q9) wait for the designer: where a part
below meets one of them, only what the design already settles is built.

## Why

The owner's hand review of the React console found things the design or the owner had already
settled that the console gets wrong: a failed scan start ends Done with another scan's id, the
Start card scans as another persona than proposed, the portal picker and Prev / Next were lost in
the React port, every nav click remounts the frame, Back loses your place, the canvases can't be
zoomed with the wheel, diagrams have no frame, the live view waits for the model, and tag lists
stretch full width.

## What this builds

- **FR-001 A failed start is failed (R-103 (1)).** A confirmed `scan.start` / `scan.resume`
  whose crawler turn ended without a run ends `failed` with the crawler's own message (the failed
  `start_run`'s error when there was one) and an `error_ref`; it never takes a later command's
  run. A command's `run_id` is the run its own workflow step followed. Regression test: portal
  down → failed, no run; start again → only the second command has the run.
- **FR-002 The Start card's persona (R-103 (2)).** The card preselects the persona the assistant
  proposed (`args.persona`) when the portal has it; else the newest scan's, else `guest`, else the
  first. Confirm sends it, so the run's `persona_id` is the one shown. `confirmed_by` is the
  dashboard's reviewer name (D-1).
- **FR-003 Portal picker (R-103 (3), FE-N01/FE-N02).** A header menu after the wordmark: the
  portals as links (the current one marked), then All portals and + New portal. Switching keeps
  the section (a detail page falls back to its list) and `?store=`; the store follows the portal.
  All portals keeps the full side nav for the last-used portal.
- **FR-004 Prev / Next between screens (R-103 (4)).** The Screens list hands its list to the
  Screen page (filter and order kept); the Screen page shows ← Prev · n of N · Next → in the page
  head's actions, as on a Docs record, with J / K.
- **FR-005 One frame (R-103 (5)).** `Shell` renders once in a layout route around `<Outlet />`;
  pages hand up `current`, `portal` and the assistant context. The loading state uses the
  designer's `.sy-state__title.sy-caret`.
- **FR-006 Loose screens into an existing process (R-103 (6)).** Drag a loose screen onto a
  process, or a keyboard menu "Add to process…" on each loose screen; it adds the screen as the
  process's last step.
- **FR-007 Back keeps your place (R-103 (7)).** Scroll is restored on Back / Forward (POP) and
  set to the top on PUSH; crumbs to a list keep the address the list was opened with.
- **FR-008 Canvases (R-103 (8)).** One zoom/pan hook for Graph and Diagram: Ctrl / ⌘ + wheel and
  pinch zoom at the pointer, Fit off on zoom or pan, no text selection on the canvas.
- **FR-009 Diagram in the map's frame (R-103 (9)).** Diagram sits in `.sy-graphview` with the zoom
  bar on the capability map, process maps and a scan's Process tab; process-map step labels no
  longer render "Unsupported markdown: list".
- **FR-010 Live card at once (R-103 (10)).** When a `scan.start` command ends `done` with a run,
  the server adds the LiveMap card to that turn from the run (data lane, no model).
- **FR-011 Tags (R-103 (11)).** Tag lists are wrapped in `Tags` (`.sy-tags`) on Portals ▸ Other
  environments and wherever a bare tag list sits in a column.

## Decisions taken while building

- **D-1 (owner to review) `confirmed_by` is the computer's login name.** The reviewer's name
  defaults to `getpass.getuser()` ("unknown" without one), still with nothing to set at a start
  (owner 2026-10-18); `MUDPUPPY_REVIEWER` overrides it. It also signs reviews and process edits.
- **A command's run is its own step's run.** Settling follows the conversation's scan step that
  the confirm requested (the step recorder links it); "the portal's first run since the confirm"
  is gone. A start still open when a later one is confirmed fails, since the later one reuses
  the step.
- **The crawler's message** is the failed `start_run`'s error, passed from the ACP update
  (`tool_finished.error`) to the step recorder; the step's failure, the chat line and the
  command card say it.
- **One frame without touching 34 pages:** `ShellLayout` in the layout route draws the frame;
  a page's `<Shell current portal context>` now only hands those up (before paint), so pages
  kept their code. A new `State` component draws the designer's caret state; `QueryState` says
  "Reading the screens" in the page body only.
- **The portal picker is a menu of links** (like As of): `Portal: X`, the portals (the section
  kept, a detail page → its list, a scan's page → Scans, a past model version → Now), All
  portals, + New portal. `?store=` is kept by the router links. The last portal used is a
  per-viewer convenience in `localStorage`; All portals draws its nav (none when unknown).
- **For the designer (round 4 Q8):** the header's menus (Portal, As of, Data store) open inline
  as disclosures, so a long portal list pushes the header down (12 portals: about 690 px). A
  popup menu needs a class the library lacks; until then the menus stay disclosures.
- **Back keeps your place:** the scroll of each history entry is kept by its location key and
  restored on Back / Forward (retried while the page's data arrives); a new page opens at the
  top; a filter change keeps the scroll. Crumbs carry `rel="up"`, and the router link gives an
  up link the query its page last had (`listAddress.ts`, in memory; store and As of left out).
- **One zoom for every canvas** (`zoom.tsx`): the steps, the zoom bar and `usePointerZoom`
  (Ctrl / ⌘ + wheel, which is also a trackpad pinch, and a two-finger touch pinch, smooth and
  around the pointer; Fit off). No inline `user-select` or `touch-action` (the CSS guide allows
  layout only): a mousedown on the canvas's words is prevented instead, and the pinch uses
  cancelable touch events. Drag to pan, the wheel model and full screen wait for round 4 Q6.
- **Diagram reuses the map's frame:** `.sy-graphview` + zoom bar + `.sy-graph__canvas` sized
  by the SVG's viewBox, opening readable like the map; `embedded` in a record and a scan tab.
  The "Unsupported markdown: list" labels are fixed where they are drawn (`drawable` escapes
  the step number), not in the generator, which stays byte-identical with its TS twin and the
  spec 004 goldens.
- **Two causes of the persona mismatch:** the chat service took the last scan's persona over the
  proposed `args.persona`, and the card preselected the newest scan's persona; both now prefer
  the proposed one.

## Close-out review (code-reviewer, 2026-10-24)

| # | File | Guideline | Finding | Outcome |
| - | ---- | --------- | ------- | ------- |
| 1 | apps/web/CLAUDE.md | G-30 | The `src/app` map lacked `PortalMenu.tsx`, `listAddress.ts`, `ScreenNeighbours.tsx`, the design system's `State` and `components/zoom.tsx` | fixed |
| 2 | apps/web/CLAUDE.md | G-30 | About 66 lines against about 60: the page-by-page map is long | deferred to R-102 (8): move the map to `apps/web/LAYOUT.md`, as the other apps have |

Size and complexity (G-01–G-04; `Graph.tsx` shrank), layers (G-13, G-15), suppressions
(G-19–G-23), error typing (G-24), tests for the new logic (G-25–G-28): no findings. `ZoomBar`
and `usePointerZoom` are internal to `Graph` and `Diagram` (not exported, no story of their own).

## Not in this spec

- Round 4 Q1–Q9's open points (came-from Back links, the sorting dialog, merging saved processes,
  thumbnails in the Screens list, drag to pan and the wheel model, full-screen diagrams, the
  loading rule, the store menu's place and short form, the failed-to-start card's look).

## Acceptance

`pnpm typecheck && pnpm lint && pnpm test` in `apps/web` and `apps/chat`, the dashboard's suite,
`ui:check` at 1280 and 390 on the changed pages, `build-storybook`; each part has a test, and
each part's eval or test idea goes into `findings.md` (owner rule).
