# Spec 078: The designer's round 4, navigation and canvases (R-106)

**Branch:** `feature/078-r106-designer-round4` · **Source:** `docs/design/salvage-yard/docs/20-navigation-and-canvases/`
(2026-10-24, tasks T-01…T-14; decisions D-65…D-78, requirements FE-V31…FE-V45), taken in with b198452b. The owner,
2026-10-24: "lets proceed … added new answers from designer". Unblocks R-102 (4), (6), R-103 (6) and the start card of
R-104 (1).

## Why

The owner's UI review (`user_input/review/2_ui_dislikes.md`) found that one cannot step back after a link between
sections, pictures can't be paged or sorted into processes, canvases select text and don't zoom with the wheel, the
capability diagram is unreadable, pages blink and jump while loading, and the header wraps. The designer answered every
question as a task with markup, classes and acceptance checks.

## What this builds (one FR per designer task)

- **FR-001 Header (T-11, FE-V42, D-76).** The store joins the portal picker as its second half under one "Portal" label:
  the store's name in mono with a database mark; "read-only" only in its accessible name, title and menu. Its menu: the
  portal's stores (name, kind, read-only, "writes go through commands") and Data store settings; always a menu. On All
  portals the store half reads `per portal`, disabled. The assistant's status moves into the Ask button (square, sr-only
  "Assistant up."; down: ✕ and "Ask · down"). `--sy-header-h` follows the measured header height. One header row from
  1180 px. R-102 (4).
- **FR-002 All portals nav (T-12, FE-V43, D-77).** On All portals the nav shows every section; the portal sections are
  `aria-disabled` without an `href`, described by "Pick a portal to open these." under Portal model. First visit: one
  portal → its Home; several → All portals; none → New portal. Returning: the last portal used.
- **FR-003 The loader (T-10, FE-V40, FE-V41, D-74, D-75).** `Loader` (`.sy-loader`, `--sm`, `--block`; three beads and
  what loads, `role="status"`), `Skeleton` (`.sy-skel`, rows of the final row height), `Reserve` (`.sy-reserve`).
  `QueryState` shows nothing for the first 300 ms, then the page's skeleton with the loader, kept at least 300 ms; a list
  that refetches keeps its rows dimmed (`aria-busy`) with "Updating". Errors take the skeleton's place. No plain
  "Reading …" or "Loading…" text left.
- **FR-004 Came from (T-01, FE-V31, D-65).** An in-app link to a detail page in another section carries `from` (address,
  kind, title) in the navigation state; the page head draws `.sy-backlink` "← {Kind} {title}" above the crumbs, back to the
  exact address (history back when it is the previous entry). From the page's own list there is no back link: the parent
  crumb carries the list's address and its filter in its label. Not after the nav, search or a typed address. At 390 px
  the back link replaces the crumbs (CSS).
- **FR-005 Previous / Next (T-02, FE-V32, D-66).** `.sy-pager` in the page head's actions, "← Previous · n of N · Next →",
  ends disabled in place, J / K, the neighbour's title in the accessible name, replace navigation; only when the page was
  opened from a list (the list's ids in the navigation state). Screens list, a process's steps, In no process.
- **FR-006 Pictures in lists (T-03, FE-V33, D-67).** The Screens list's screen cell gets `.sy-rowpic`: the main variant's
  latest picture (72 px dense), a button that opens the dialog browsing the list; "no picture" hatched with its reason.
  Size reserved from the start.
- **FR-007 The picture dialog browses its list (T-04, FE-V34, D-68).** Opened from a list, ← → / J K step through the list,
  Shift ← → through the screen's variants (a segmented switch in the head); the foot has the pager and the list's name; a
  sortable list adds the tick (X) with its step number and Add to process (A). Esc returns focus to the last screen viewed.
- **FR-008 In no process and Add to process (T-05, FE-V35, D-69).** Processes ▸ tab In no process
  (`/processes/loose`): a grid of `.sy-pick` cards (Grid / List switch, sort by last seen, route), ticks with step numbers
  in tick order (X, Shift + click range), the selection bar `.sy-selbar` (count, New process from these, Add to process ▾,
  Clear), the New process panel. Add to process ▾ (`.sy-menu`: search past 8, last used, this persona's processes with
  their step count, `already in` disabled, New process from these…) on a card, the selection bar and the dialog. Adding is
  a scope change through the chat service (`POST …/processes/{id}/scope`): A gets a new revision "scope change"; a screen
  an observed move links to A's screens joins A's steps, one with no observed path stays in the scope as "Not on the
  observed path yet" with Explore from here. To-be models don't change. Toast with Undo (`DELETE` the same). R-103 (6).
- **FR-009 Merge two processes (T-06, FE-V36, D-70).** Same persona only (otherwise disabled with the reason). From the
  Processes list (tick exactly two) and the process page (Merge with…), one dialog: keep which, name, start, end, the
  server's dry-run facts, reason. The kept process keeps its key; A is rebuilt over the union (new A revision "merged
  scope"); the absorbed one's to-be models move over with the next letters, marked "branched from another as-is"; the
  absorbed process is archived as "Merged into …" and its address shows that. Undo for 10 s; Split back on the history
  event.
- **FR-010 How a canvas moves (T-07, FE-V37, D-71).** One `useCanvas` hook for Graph and Diagram: the canvas moves by
  transform inside an `overflow: hidden` box; at rest the wheel goes to the page, Ctrl/⌘ + wheel and pinch zoom at the
  pointer; engaged (click, drag or Tab focus) the wheel zooms smoothly at the pointer (10–400 %), `data-engaged` and the
  hint; drag pans from anywhere after 4 px (a shorter press selects a node), no text selection; Esc, a click outside or
  Tab out release; buttons and + / − / 0 step 25…200 %; the level shows the actual value.
- **FR-011 Full screen (T-08, FE-V38, D-72).** A Full screen button at the end of the zoom bar and F while engaged (not in
  the Workbench) open `.sy-dialog--full` with the same canvas, always engaged; zoom and position carry over both ways;
  Esc leaves and focus returns to the button.
- **FR-012 Diagram (T-09, FE-V39, D-73).** Diagram in the graph's frame (zoom bar, full screen, engage) with the designer's
  Mermaid theme and status classes; it opens readable (fit when ≥ 80 %, else 100 % at the top-left). The capability map
  opens as a List (an indented table of groups and capabilities) with Diagram as the second view.
- **FR-013 Didn't start (T-13, FE-V44, D-78).** A `scan.start` command that ends failed without a run shows "Didn't
  start", "Created: nothing", the crawler's sentence quoted under Why, the reference, Start again (the same command) and
  Check the address. The live map card placed by the server shows no generated mark and "placed by the server when the
  scan started", and a block loader "Waiting for the first page" before the first page.
- **FR-014 Layout stability (T-14, FE-V45).** Nav counts reserve their width; fonts preloaded; a Playwright check
  (`pnpm --dir apps/web cls:check`) that measures layout shift on every route with a 1 s API delay and fails above 0.05.

## Not in this spec

- Changes and Review **across portals** (T-12 "live, with a Portal column"): there is no cross-portal API; on All
  portals they are disabled with the reason like the other portal sections (D-1, for the owner; leftover).
- A 192 × 120 WebP thumbnail per screen (T-03 "Image file"): the dashboard has no image library; the rows show the
  recording at the row size (D-2; leftover).
- R-104 (1)'s look of the live Workbench's components: round 4 left `genui.css` unchanged.
- R-102 (3), R-102 (5): still waiting (a 2.0 screen's context; the vault in the persona card).

## Acceptance

Each designer task's acceptance checks (the `T-xx` files), as tests where a test can hold them; `pnpm check` in
`apps/web`, the chat and dashboard suites, `ui:check` at 1280 and 390, and the new CLS check.
