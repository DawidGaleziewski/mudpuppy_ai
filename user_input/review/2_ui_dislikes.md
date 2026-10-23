# UI dislikes — 2026-10-24

What the owner doesn't like in the console (http://127.0.0.1:8765/app/, Workbench on), with the cause
of each item.

## Cause

- **Roadmap**: the work isn't finished yet, and the item is on `roadmap.md` (R-xx) or in a spec's leftovers.
- **Designer**: the UI follows the designer's guidelines (Salvage Yard, design answers), so the fix needs
  the designer.
- **AI decision**: neither of the above. Claude chose it during implementation, and it can be fixed directly.

## Sources checked

- `roadmap.md`, `specs/0xx-*/spec.md` + `tasks.md` (leftovers, open questions)
- `docs/design/salvage-yard/`, `.claude/skills/mudpuppy-salvage-ui/` (SKILL.md + references)
- `.claude/skills/mudpuppy-react-ui/`
- Designer packages in `user_input/` (`mudpuppy-salvage-yard*.zip`, `genui/`, `ux-package/`, `redesign/`)

## Items

| # | Page / place | What I don't like | Cause | Reference | Suggested fix |
|---|---|---|---|---|---|
| 1 | Header + side nav; Portals page `/app/` | The Portals page is good for a general status, but on it every other nav item disappears (only "Portals" is left). The header has a dropdown for the data store but none for the portal, so switching portals means going back to Portals and clicking a card. | **AI decision** (lost in the React port) | See [Item 1](#item-1-no-portal-picker-nav-empties-on-portals) | Add the designer's portal picker to the header and keep the full nav on All portals |
| 2 | Every page, on a nav click | A quick blink when changing nav tabs; it feels like there's no loader. | **AI decision** (mostly); the designer's console rules have a gap | See [Item 2](#item-2-blink-on-nav-change) | One persistent shell (layout route); keep the page's size while loading; the designer's caret loader |
| 3 | Processes ▸ "In no process" (new process from screens), picture dialog | The big-screen modal has no Previous / Next to step through the screens quickly, and no checkbox to mark the screen for the process from inside it. Overall: sorting screens into processes and lumping them together is too slow. | **Mixed**: designer gap (dialog) + **AI decision** (tick kept out of the dialog) + **AI omission** (drag onto an existing process) | See [Item 3](#item-3-sorting-screens-into-processes-is-slow) | Dialog steps through the list with a "In this process" tick; add loose screens to an existing process; ask the designer for the sorting flow |
| 4 | Screens ▸ one screen `/app/portals/{p}/screens/{key}` (and the list) | I want Previous / Next to the neighbouring screen of the list, for a quick overview. | **AI omission** (lost in the React port; owner asked for it in R-71 (b)) | See [Item 4](#item-4-no-previous--next-between-screens) | Prev / Next on the Screen page over the filtered list (J / K); thumbnails in the list |
| 5 | Whole console: any cross-link to a nested page (e.g. Screen → a process) | I can't go one step back to where I came from; I have to click Screens again and find the screen. | **Designer** (crumbs are the section tree by design) + **designer gap** (no "back to where you came from") + **AI decision** (Back loses scroll; crumbs drop the list's filter) | See [Item 5](#item-5-no-way-one-step-back) | "← Back to {where you came from}" on cross-links; restore scroll on Back; crumbs keep the list's filter |
| 6 | Docs ▸ Capabilities (capability map); also process maps in Docs records and a scan's Process tab | The diagram is unreadable. I want to zoom in and pan by dragging, maybe with the mouse "locked" into the diagram once I click in it. | **Designer gap** (Mermaid diagrams never designed) + **AI decision** (built as a flat picture; the map's zoom pattern not reused) | See [Item 6](#item-6-diagrams-cant-be-zoomed-or-panned) | One diagram viewer: the designer's graph-view frame (zoom bar, Fit), drag to pan, wheel zoom once engaged, full screen |
| 7 | Scans ▸ a scan ▸ Graph (same `Graph` as Screens ▸ Map and the recorded map) | There is a way to enlarge it (the zoom bar), but it isn't practical. I want zoom by scroll wheel and drag to pan like Figma. Dragging now selects text. | **Roadmap** (Ctrl + wheel zoom is a known R-96 leftover) + **designer gap** (no drag-to-pan) + **AI decision** (drag left to the browser, so it selects text) | See [Item 7](#item-7-graph-has-no-wheel-zoom-or-drag-to-pan) | Figma-style canvas: wheel / pinch zoom at the pointer, drag (or Space + drag) pans, no text selection |
| 8 | Workbench ▸ "Start a map scan" → Confirm | After Confirm I only get "Done · Started scan 01a16add-1e29 · Open in Scans". Where is the widget that shows what the scan is actually doing? It was in the requirements. | **Roadmap** (R-96, the reason R-96 exists: F-19, the spike not built yet) | See [Item 8](#item-8-no-live-view-after-confirm) | The live card appears from the run itself, not from the model's turn: R-96 spike |
| 9 | Workbench ▸ the command card of a scan that failed to start | When the portal server was off, the scan was shown as running although it was stuck. | **AI decision / bug** (verified in the store) | See [Item 9](#item-9-a-failed-start-shows-running-then-done-with-another-scans-id) | A failed start ends the command as failed with the crawler's message; never reuse a later run's id |
| 10 | Portals `/app/` ▸ "Other environments" plate | The yellow tags (marketsite, mudpuppy-dashboard, proving-ground-…) each stretch across the whole screen, one per line. Looks bad. | **AI decision / bug** | See [Item 10](#item-10-tags-stretched-to-full-width) | Wrap them in `<Tags>` (`.sy-tags`), as every designer mock does |

## Item 1: no portal picker; the nav empties on Portals

**What happens now** (`apps/web/src/app/Shell.tsx`)
- `navOf()` returns only `Portals` when the address names no portal, so `/app/` shows one nav item.
- The header shows the portal as plain mono text (`<Text mono>{portal}</Text>`), not a picker.
  `HeaderEnd` has `StoreMenu` (data store), As of, Ask the assistant and `?`, but no portal menu.

**What the designer specified**
- `docs/design/salvage-yard/docs/07-requirements.md` **FE-N01 (Must)**: "The header on every page has the
  wordmark, **portal picker**, search, assistant status, Ask the assistant and help, in that order."
- **FE-N02 (Must)**: "The portal picker is the project context; switching keeps the current section and
  loads its data for that portal." Switching happens on an explicit action: a menu of portal links, or a
  select plus "Switch" (WCAG 3.2.2). Its test: "switch portal on Processes → stays on Processes."
- `docs/04-design-system.md` (Portal picker row): "**All portals** and **+ New portal** are links in that
  menu". The Portals overview is reached from the picker, not by leaving the portal.
- `wireframes/01-IA.dc.html` SCR-002: "Portal picker › All portals; this portal's numbers on Home"
  ("Most work happens inside one portal").
- `screens/v2-15-all-portals.html`: the header has `Portal` and `As of` pickers, and the side nav keeps
  every section (Home, Changes, Review, Portal model ▸ Processes/Screens/Rules/Docs, Machine ▸
  Scans/Settings).
- Same in `.claude/skills/mudpuppy-salvage-ui/SKILL.md` (header line 109; anti-pattern line 218).

**Roadmap / SDD history**
- R-71 (spec 034, v1.0.38) built this on htmx: the store picker moved up "next to the portal picker in
  the header", the store list followed the portal, and "a portal switch lands on one" store.
- R-96 (specs 050–070) and R-100 (spec 071) ported the pages to React. Spec 071 **T024** ported
  "the header's parts the htmx frame had": the data-store menu, As of, stray-server warnings. The
  **portal picker was not ported**, and no task, finding or deferral mentions it.
- R-101 (designer round 3) and R-102 (R-100 leftovers) don't list it. R-102 (4) only notes the store label
  wrapping the header at 1280 px.
- The data store in the header is the owner's own call (R-71 (c)); the designer put it in the nav footer
  and Settings ▸ Data store. That one is not a defect.

**Verdict: AI decision.** It is not waiting on the roadmap, and it is not the designer's guideline. The
design says the opposite (a Must requirement). It was dropped in the htmx→React port without being
recorded.

**Suggested fix** (new roadmap item, or into R-102)
1. A `PortalMenu` in the header (menu button with portal links; the current one marked; "All portals" and
   "+ New portal" at the end), placed after the wordmark per FE-N01.
2. Switching keeps the section: `/app/portals/A/processes` → `/app/portals/B/processes`. A detail page
   (one record or screen) falls back to its list. `?store=` is kept, and the store follows the portal as
   R-71 (d) did.
3. On `/app/` (All portals), keep the full side nav, pointing at the last-used portal, instead of only
   "Portals".
4. e2e test from FE-N02: switch on Processes → still on Processes.

## Item 2: blink on nav change

**What happens now.** There is a loader, but it is the reason for the blink.
1. **The whole frame remounts on every click.** Each of the 34 pages wraps itself in `<Shell>`
   (`apps/web/src/pages/*`); `App.tsx` routes are flat (`{ path, element: <Screens /> }`) under one
   `<Outlet />`. A nav click swaps the page component, so React throws away the header, side nav,
   store/As of menus and assistant drawer, and builds them again. The frame that should stay still is
   redrawn too.
2. **The page collapses to one line, then grows back.** `app/QueryState.tsx` replaces the page's whole
   content with a single muted "Loading screens…" line while the first fetch runs (`isPending`), then
   the full page lands. Short page → long page in ~100–300 ms reads as a flash, and the scroll jumps to
   top (`useScrollOnMove`).
3. **First visit only.** The query client keeps defaults (`App.tsx:138`, only `retry: 1`), so a tab
   already visited shows cached data at once and refreshes behind. The blink is on each first visit, and
   again after a store or As of change (`useAsOfReset` resets every query).

**What the designer specified**
- `docs/design/salvage-yard/docs/04-design-system.md` § States: "Loading: `.sy-state__title.sy-caret`.
  Say what is being read and the counts so far. **No spinners.**" The React loader uses plain muted text,
  not the caret state the designer drew. That is a small deviation (AI).
- The **frame** is fixed by design: header "Same on every page" (04-design-system.md, Header row;
  FE-N01). A remounting shell isn't a designer decision.
- **Gap:** the designer's console rules say nothing about holding the page's size during a page load.
  Only the Workbench rules do: `15-genui-guidelines.md` § 8: "**Reserve the final size** while composing"
  vs "Show a spinner, a shimmer, or **a box that grows when content lands**"; `14-workbench.md` skeleton
  blocks `.sy-genskel`, "No shimmer; nothing moves". The same principle fits the console pages, but it
  isn't written for them.

**Roadmap / SDD history**
- R-100 (spec 071) was about speed between pages ("every click took forever"). It fixed full reloads
  (router links) and slow htmx pages, but kept the Shell-per-page structure from R-96 step 1 (spec 050).
  Nothing on R-101/R-102 covers it.
- `.claude/skills/mudpuppy-react-ui/SKILL.md` rule 6 ("every view has its states: loading, empty,
  error") is met on paper, which is why it never came up in review.

**Verdict: AI decision** for the remounting frame and the plain-text loader. The page-load behaviour (hold
the size, skeleton or not) is a **designer gap**: ask the designer to extend the Workbench rule to
console pages.

**Suggested fix**
1. One layout route: `Shell` rendered once in `Routed` around `<Outlet />`. Pages pass `current`,
   `portal` and assistant `context` up (a small context/hook) instead of wrapping themselves. The nav,
   header and drawer then never redraw on a click.
2. Loading keeps the page's frame: the page title and section header render at once (they don't need
   data), and only the body shows the loading state, as the designer's `.sy-state__title.sy-caret`
   ("Reading screens…"), with a min-height so the page doesn't collapse.
3. Optional: start the next page's query on nav hover/focus (`queryClient.prefetchQuery`), so most clicks
   land on cached data and no loader shows at all.
4. For the designer: a console-page loading rule (skeleton at final size, or hold the previous page
   until the next is ready, React `useTransition`).

## Item 3: sorting screens into processes is slow

**What happens now** (`apps/web/src/pages/NewProcess.tsx`, spec 057)
- "In no process" lists every loose screen as a 96 px thumbnail plus a checkbox with the route and title.
  Ticks become numbered steps on the right (↑ / ↓ to reorder), then "New process from these".
- The thumbnail opens the wide picture dialog (`design-system/components/Picture.tsx`). The help text
  says: "Open a picture to see the screen large; **it does not tick it.**"
- The dialog *can* step Previous / Next (`set` prop, ← / →), but only through one screen's variants.
  `NewProcess` passes no set, so each picture is a dead end: open, look, Esc, find the row, tick, open
  the next.
- Loose screens can only start a **new** process. There is no way to add them to an **existing**
  process, and Merge / Split exist only for the assistant's suggestions (`ProcessSuggestions.tsx`), not
  for saved processes.

**What the designer specified**
- `docs/18-design-answers/02-wide-picture-dialog.md` (D-45, FE-V12): Prev / Next and ← / → step
  "the previous / next **variant**". Nothing about stepping through a list of screens, or acting on the
  screen (tick, assign) from inside the dialog. That is a **gap**: the dialog was designed for viewing,
  not sorting.
- `docs/10-processes.md` § 2 and § 6.3: "select several loose screens in 'In no process' → **New process
  from these**". This is built.
- `screens/04-processes.html` (the "In no process" panel): "**Drag a screen onto a process**, or select
  several and choose 'New process from these'". The drag onto an existing process is **not built**. It
  isn't in spec 057, R-96's steps or R-101/R-102, and no deferral was recorded.
- `docs/07-requirements.md` FE-P08: "New process from these" from loose screens. Met.

**Roadmap / SDD history**
- R-96 step 8 (spec 057, v2.6.7): "a new process from screens ticked in walking order". Only the "new"
  half of the designer's panel was taken.
- The picture dialog came from the designer's answers in R-96 step 12 (spec 061), for variants only.
- Nothing open on the roadmap covers faster sorting.

**Verdict: mixed**
- No Prev / Next across the list: **designer gap**. The component already supports it, so it's a cheap
  fix that needs a design call.
- No tick inside the dialog: **AI decision** (the help text states it on purpose), on a point the
  designer left open.
- Can't add screens to an existing process ("lump together"): **AI omission**. The designer drew
  "Drag a screen onto a process", and the port dropped it without a record.

**Suggested fix**
1. The dialog steps through the list it was opened from: pass `set` = the loose screens, so
   Previous / Next and ← / → move to the next screen, with the position ("4 of 12").
2. A tick in the dialog's head: "In this process" (checked state mirrors the row; the step number shown
   when ticked). Then a person can go through all loose screens in one dialog: look → tick → → .
   A keyboard key for it (e.g. Space or T), like Review's J/K/C/R.
3. "Add to process ▾" on a loose screen (and on the ticked set): pick an existing process. It becomes a
   to-be draft / scope change of that process, because A stays observed-only (10-processes.md § 1). The
   designer's drag is the pointer path, the menu is the keyboard path.
4. Merge two saved processes (not only suggestions). This needs the designer: what happens to their A
   and B variants.
5. For the designer: a "sorting" mode for the In no process panel (bulk view, tick + assign from the
   dialog), since sorting many screens is the main job here.

## Item 4: no Previous / Next between screens

**What happens now**
- `apps/web/src/pages/Screens.tsx`: a table (Screen, Status, Variants · why) with filters and sort, and
  no pictures in the rows.
- `apps/web/src/pages/Screen.tsx`: one screen with its variants. Its picture dialog steps through
  **that screen's variants** only (`set`, line 79–99). No link to the previous / next screen of the list,
  so the overview means: open, back, open the next row.
- Elsewhere the React console has it: a Docs record (`DocRecord.tsx` `Neighbours`, spec 067), Review
  items (spec 062) and Before / after (spec 064, J / K).

**Owner's own request**
- `roadmap.md` **R-71 (b)** (2026-10-17): "Previous / Next on detail pages: while reviewing a **screen**,
  state, record or review item, '← Prev' and 'Next →' move to the neighbour in the list it was opened from
  (same filter and order), so the owner does not go back to the list for each one". Built on htmx in
  spec 034 (v1.0.38): "Prev/Next on **screen**, record and Review items".

**What the designer specified**
- The Screen detail mocks (`screens/v2-07-screen-detail.html`, `08-screen-detail.html`) have no Prev /
  Next between screens. The designer's J / K is for Review and Before / after (`docs/12-v2-ux.md` key
  table: "J / K: Next / previous item"). So the designer didn't ask for it, but didn't rule it out
  either. It's the owner's R-71 requirement.

**Roadmap / SDD history**
- R-96 step 3 (spec 052, v2.6.2) ported Screens without the R-71 (b) Prev / Next. No deferral recorded.
- R-100 (spec 071) **T025** then deleted the backend: "`neighbours.py` keeps only the Docs list (the
  **Screens and scan-states lists served deleted pages**)". The feature was treated as dead code, because
  the React page never called it.
- Not on R-101 / R-102.

**Verdict: AI omission.** An owner requirement (R-71 (b)) was lost in the port and then deleted as unused.
Nothing in the roadmap or the designer's work explains it.

**Suggested fix**
1. Screens list links each row with its list (`?list=` of filter + sort, the same mechanism as Docs'
   `neighbours.py`). The Screen page shows "← Prev · 4 of 37 · Next →" with J / K, keeping the filter.
   Restore the screens list in `neighbours.py` from spec 034.
2. A small picture in each list row (`Picture size="sm"`, like "In no process"), so the list itself is an
   overview. Same ask as item 1 of `1_review_basic.md` ("miniatures next to url").
3. Optional: the picture dialog opened from the list steps through the list's screens (as in item 3).

## Item 5: no way one step back

**What happens now**
- Every detail page has breadcrumbs (`design-system/components/PageHead.tsx`, used on 29 pages), but they
  are the **section tree**, not the way you came. Screen → click a process → the Process page says
  `Portals › {portal} › Processes › {key}`. The screen you came from isn't there, so getting back means
  Screens → find the screen again.
- The crumb back to a list is the bare list address (`…/screens`, `docsHref(portal)`, `rulesHref`), so
  the list's filter, sort and page are dropped, even though the list keeps them in the URL.
- The browser's Back button does go back (React Router history), but `useScrollOnMove()`
  (`app/App.tsx:49`) scrolls to the top on **every** path change, Back included. You land at the top of
  the long page or list, not where you were.
- The exceptions are Prev / Next on Docs records (`neighbours.py`) and Review items, which keep the list.

**What the designer specified**
- Crumbs are the section tree: `screens/v2-07-screen-detail.html` "Screens / Kalkulator OC/AC — dane
  kierowcy", `v2-10-process-detail.html` "Processes / Oblicz składkę OC/AC";
  `docs/04-design-system.md` § page head `.sy-pagehead > .sy-crumbs`. The React crumbs follow that, so
  this part is the **designer's** decision.
- **Gap:** the design has no rule for a cross-link (Screen → Process, Review → Rule, Changes → Screen,
  record → screen): no "Back to …", no "came from". The 2.0 design links the sections to each other
  heavily, but never says how to return.

**Roadmap / SDD history**
- R-71 (b) (owner, 2026-10-17) covered going back to the **list** (Prev / Next "so the owner does not go
  back to the list for each one"), not returning across sections.
- R-100 made links router links ("No a hrefs"), so Back is in-app, but the scroll reset was kept for
  every move. Nothing on R-101 / R-102.

**Verdict: mixed**
- Crumbs show the section, not your route: **designer** (as drawn), plus a **designer gap** for
  cross-links.
- Back loses your place, and the crumbs drop the list's filter: **AI decision**. Easy to fix without the
  designer.

**Suggested fix**
1. A cross-link carries where it came from (`?from=` with the page's address and title, or router
   `state`). The target page shows "← Back to *Kalkulator — dane kierowcy*" above the crumbs, and it goes
   back to that exact address (filter, tab, page). With no `from` (address typed or opened from the
   nav), nothing extra shows.
2. Scroll: restore the position on Back / Forward (React Router `<ScrollRestoration />`), and scroll to
   top only on a new move (PUSH).
3. Crumbs to a list keep the last filter of that list (the address it was opened from), the way Docs'
   Prev / Next carry `list=`.
4. Keyboard: `Alt+←` already works (browser). Optionally `Backspace`/`B` outside inputs, like Review's
   keys.
5. For the designer: a "came from" pattern for the page head (where it sits, its words, how it looks
   next to the crumbs), applied across the console.

## Item 6: diagrams can't be zoomed or panned

**What happens now**
- `apps/web/src/design-system/components/Diagram.tsx` (spec 056 FR-004): Mermaid renders the source to an
  SVG, and the component drops it inline in a `<figure>`, at whatever size the column gives it. There is
  no zoom, pan, drag, full-screen view or dialog. A large capability map is shrunk into the column until
  the labels can't be read.
- Used in three places: Docs ▸ Capabilities (`pages/Docs.tsx:193`), a process record's map
  (`DocContent.tsx:89`) and a scan's Process tab (`ScanProcess.tsx:73`).
- The **Graph** component (model map, recorded map) does have − / % / + / Fit (`Graph.tsx`, designer
  D-47), but Diagram doesn't reuse it.

**What the designer specified**
- **Mermaid diagrams were never designed.** No `Diagram` / Mermaid component in `docs/04-design-system.md`,
  `components.html` or the skill; "capability map" has no mock. A **gap**.
- The closest pattern is `docs/18-design-answers/04-graph-zoom-bar-and-height.md` (D-47, for the map
  Graph):
  - A frame `.sy-graphview` with a sticky zoom bar `.sy-graph__zoom`: − · level · + · Fit.
  - Height: natural, capped at the visible viewport; embedded 520 px.
  - Keys + / − / 0. **Ctrl + wheel (or pinch) zooms around the pointer; the wheel alone scrolls the graph
    box.** Fit turns off on zoom or pan.
  - Phone: full screen in `.sy-dialog--wide`.
  - It says nothing about **drag to pan**. The box only scrolls.
- Your "lock the mouse in when I click" is a known pattern (click or focus to engage, then the wheel
  zooms instead of scrolling the page, and Esc or a click outside releases it). The designer chose
  Ctrl + wheel instead, so the page scroll is never captured. That is a **designer call** to revisit.

**Roadmap / SDD history**
- Spec 056 (R-96 step 7) built Diagram for the scan's Process tab. Spec 066 (step 17) reused it for the
  capability map and screen navigation without asking how a big diagram should read.
- R-96 step 12 left for Graph: "Ctrl+wheel zoom, Fit off on pan" (and a phone full-screen dialog), still
  open. R-101 (Q3) is "maps open readable (≥ 80 %), Fit draws an overview under 50 %", for Graph only.
- Known Mermaid defect (spec 056): process-map step labels "1. kind: intent" render as "Unsupported
  markdown: list", which makes those maps harder to read too.

**Verdict: designer gap + AI decision.** Nobody designed big Mermaid diagrams. The AI shipped them as a
plain picture, in the narrow column, without reusing the zoom pattern the designer gave for maps.

**Suggested fix**
1. Diagram gets the designer's `.sy-graphview` frame: the sticky zoom bar (− · % · + · Fit), natural
   height capped at the viewport, and Fit on open only if it stays ≥ 50 % (R-101 Q3's rule).
2. Pan by dragging (pointer down + move; cursor `grab` / `grabbing`) and by the arrow keys. Zoom with
   Ctrl + wheel / pinch around the pointer, as D-47 says.
3. "Engaged" mode, your ask: a click in the diagram engages it (focus ring, hint "Wheel zooms · Esc to
   leave"), the plain wheel zooms while engaged, and Esc or a click outside releases it. Needs the designer,
   because it changes D-47's "wheel scrolls".
4. "Open full screen" (`.sy-dialog--wide`, full window) for big diagrams like the capability map, with the
   same controls.
5. Share one zoom/pan hook between Graph and Diagram, so the map and the diagrams act the same.
6. Fix the "Unsupported markdown: list" step labels (spec 056 finding).
7. For the designer: a Diagram (Mermaid) entry in the design system, and a decision on engage-to-zoom vs
   Ctrl + wheel.

## Item 7: graph has no wheel zoom or drag to pan

**What happens now** (`apps/web/src/design-system/components/Graph.tsx`, `pages/ScanGraph.tsx:257`)
- The graph is a scroll box (`.sy-graphview`, `embedded`, so capped at 520 px on the scan page) with the
  zoom bar − · % · + · Fit, the keys + / − / 0 and arrows between nodes, and overview under 50 % (a
  click on a node zooms to 100 % on it).
- **No wheel handler and no pointer handlers at all.** The wheel scrolls the box (or the page). A drag
  is left to the browser, so it selects the node labels' text instead of moving the canvas. Zoom only
  steps through fixed levels by button, around the box's corner, not the pointer.
- The same component draws Screens ▸ Map and the recorded map, so they behave the same.

**What the designer specified** (`docs/18-design-answers/04-graph-zoom-bar-and-height.md`, D-47; round 3
`19-console-answers/03-fit-on-open.md`)
- "**Ctrl + wheel (or pinch) zooms around the pointer; the wheel alone scrolls the graph box.**" "Fit
  turns off as soon as the person zooms **or pans**."
- Panning is only "the graph pans inside it" (the box's scroll). **No drag-to-pan, no grab cursor, no
  rule against text selection.** That is a gap.
- The Figma model you want (plain wheel = pan or zoom, drag = pan) differs from the designer's choice
  (wheel = scroll, Ctrl + wheel = zoom). Figma itself uses wheel = pan and Ctrl/⌘ + wheel = zoom, with
  Space + drag or middle-drag to pan. That is close to D-47 plus drag.

**Roadmap / SDD history**
- R-96 step 12 (spec 061, v2.6.11): "left: a phone's full-screen graph dialog, **Ctrl+wheel zoom, Fit
  off on pan**". Never picked up; it's only noted inside R-96's text, not as its own item.
- R-101 Q3 (maps open readable, Fit as overview) is built in spec 072 T010–T011 (current branch).
- Drag-to-pan is not on the roadmap.

**Verdict: mixed**
- Ctrl + wheel / pinch zoom at the pointer: **roadmap** (a designed and known leftover, not yet built).
- Drag to pan: **designer gap**.
- A drag selecting text: **AI decision** (no pointer handling, no `user-select: none` on the canvas).

**Suggested fix** (one canvas hook for Graph, also used by item 6's Diagram)
1. Zoom at the pointer: Ctrl/⌘ + wheel and trackpad pinch, smooth (not only the fixed steps). Fit turns
   off. The level shows in the bar.
2. Pan by drag on empty canvas: pointer down + move, cursor `grab` / `grabbing`, pointer capture,
   `user-select: none` on the canvas while dragging. A click without movement still selects a node.
   Space + drag anywhere, and middle-button drag.
3. Plain wheel: keep D-47 (scroll / pan the box), or switch to Figma's "wheel pans the canvas" once
   engaged (item 6, point 3). The designer chooses.
4. A full-screen button on the embedded scan graph (520 px is small for a long scan), also the phone
   dialog R-96 step 12 left.
5. For the designer: add drag-to-pan, the cursors and the no-selection rule to D-47.

## Item 8: no live view after Confirm

**What happens now** (checked 2026-10-23 22:25Z on `reference-insurer-local`, store `local-dev`)
- The scan **is running**: run `01a16add-1e29-…`, status `running`, 21 steps at the time of checking.
- The Workbench page model (`/api/workbench/portals/reference-insurer-local`) has `live: null`,
  `live_card: null`. The confirm turn ("[event] The person confirmed: Start a map scan…") has **no answer
  and no cards** yet.
- How the live view works today: `web/workbench_model.py` `live_of()` shows the live bar only for a
  **`LiveMap` card the model emitted** in a turn (`pages/WorkbenchCards.tsx` `LiveMap`: meter + filmstrip,
  "This card updates in place while the scan runs"). The command card itself only says "Done · Started
  scan … · Open in Scans" (`wb_render.py:331`).
- So the live view depends on the assistant finishing its turn and choosing to draw a LiveMap. On the
  first try it said "I can't show the live map yet because the scan doesn't have an id; I'll show it as
  soon as the run is recorded", and nothing came after.

**Where it is required**
- `roadmap.md` **R-96** (owner 2026-10-22: "They should update the UI live while they work"): "Found by the
  owner's hand try: **after Confirm no live card appeared, because the assistant runs the crawler inside
  its own turn and waits for the whole scan** (spec 043 F-19, D-5)". Planned: "first a spike (one slice end
  to end: **Start → Confirm → background crawler → live filmstrip and meter from shared state** → narration
  per step → the agent reacts to the stop)". Also D-10: "'**Watch in Workbench' opens the live view at
  once**".
- Designer: `docs/design/salvage-yard/docs/14-workbench.md` and `screens/wb-01-inline-live.html`
  (inline live card), `wb-03-split-live.html`; `docs/15-genui-guidelines.md` (scan events are "the data
  lane … No model involved").
- R-96's status: steps 1–21 moved the console to React. The "next: the Workbench gen UI (A2UI, WebSockets:
  the spike…)" **has not started**.

**Verdict: roadmap.** It's the known F-19 behaviour, and the fix is R-96's spike, which is still ahead.
It is not a designer issue: the designer drew the live card, and the data lane is meant to run with no
model involved.

**Suggested fix** (the R-96 spike, or a stop-gap before it)
- Stop-gap: when a `scan.start` command reaches `done` with a `run_id`, the server adds the LiveMap card
  to that turn itself (the data lane, no model), so the card shows at once and updates from the run.
  "Open in Scans" stays as a link.
- Proper: R-96, with the crawler in the background, shared state over WebSockets, and the model narrating
  beside the card, not gating it.

## Item 9: a failed start shows "running", then "done" with another scan's id

**What the store shows** (`data/db/local-dev.sqlite`, table `workbench_commands`)

| command | turn | confirmed | state | result | updated |
|---|---|---|---|---|---|
| `01a16ada-9f9c…` (1st try, portal off) | 1 | 22:21:25 | **done** | `run_id: 01a16add-1e29…` | 22:24:00.335 |
| `01a16adc-f4b6…` (2nd try, portal on) | 3 | 22:23:52 | done | `run_id: 01a16add-1e29…` | 22:24:00.335 |

- The first start failed before any run existed (robots.txt couldn't be read; the `runs` table has no row
  between `01a16624…` (23 Oct 00:24) and `01a16add…` (22:23:58)). Its command stayed non-final, shown
  as running, for ~2.5 minutes.
- When the second start recorded its run, **both** commands were set to `done` with the **same run id** at
  the same millisecond. The failed one now claims a scan it never started, and the failure (the crawler's
  robots message) isn't stored on it (`error_ref` empty).
- Also seen: `confirmed_by = unknown` on every command.
- Related mismatch: the assistant said "starting as **klient-premium**", but run `01a16add…` is recorded
  with persona **`guest`** (`runs.persona_id`).

**What the designer specified**
- `docs/16-genui-components.md` command card states: `running` (solid cyan, Confirm `aria-busy`) ends in a
  result or a failure. `docs/15-genui-guidelines.md`: failures say what broke and the next move. A command
  that failed must not end as Done.

**Roadmap / SDD history:** not on the roadmap. R-96's spike plans "the agent reacts to the stop", but not a
start that fails before a run exists.

**Verdict: AI decision / bug.** The command's end state is matched to "the next run that appears" instead
of to the start it made, and a start failure has no end state of its own.

**Suggested fix**
1. `scan.start` ends as `failed` with the crawler's message ("robots.txt could not be read …") and an
   `error_ref` when no run is created. The card shows the failure and "Start again".
2. A command's `run_id` comes only from its own start call, never from a later run.
3. Add a regression test: start with the portal down → command failed, no run; start again → only the
   second command carries the run.
4. Check the persona: the run should use the persona the assistant names (klient-premium), or the
   assistant must say guest.
5. Log both in the spec findings with an eval idea (owner rule: every bug feeds evals).

## Item 10: tags stretched to full width

**What happens now** (`apps/web/src/pages/Portals.tsx:86–97`, `Environment`)
- Each portal of another environment is a `<Tag size="sm">` placed **directly** in the `Plate`.
- `.sy-plate__body` is `display: flex; flex-direction: column` (`salvage.css:204`), and a column flex
  stretches its children, so every `.sy-tag` (an `inline-flex` label) becomes a full-width bar, one per
  line.

**What the designer specified**
- Tags are not meant to be full width. `.sy-tag` is an inline label (`height: 24px`, `sm` 22 px), and a set
  of tags always sits in **`.sy-tags`** (`salvage.css:366`: `inline-flex; flex-wrap: wrap; gap: 6px`). See
  `screens/08-screen-detail.html`, `02-screen-with-assistant.html`, `06-process-compare.html`,
  `13-screen-states.html` and `16-reconcile-states.html`. The design system exports a `Tags` component for
  exactly this (`design-system/components/Tag.tsx:32`).
- The designer's All portals mock (`v2-15-all-portals.html`) has no "Other environments" part at all. It
  was added on our side (R-100).

**Verdict: AI decision / bug.** The `<Tags>` wrapper is missing. It is not a design intent.

**Suggested fix:** wrap the list in `<Tags>…</Tags>`, so the tags sit side by side and wrap. Check the
other pages for the same slip (a bare `Tag` list inside a `Plate` or `Stack`). Optional: make each tag a
link that opens the portal in its store.
