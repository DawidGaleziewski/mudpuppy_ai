# 20 · Navigation and canvases: round 4, as tasks (24 Oct)

Answers to "Designer questions, round 4: console navigation and canvases" (Q1–Q9, from the owner's review
`2_ui_dislikes.md` items 1–9), plus the owner's request the same day: **a loader that fits the design system, required
wherever content loads, and pages that don't jump.**

This round is written as **tasks** you can pick up one by one: each `T-xx` file has the decision, why, the markup and
classes, React notes, and acceptance checks. Every visual part is a class in `salvage.css` (section **2.3**) with a live
demo, and every new page is a screen.

## Questions → tasks

| Q | Question | Answer in one line | Task |
|---|---|---|---|
| 1 | Going back after a link between sections | One link above the crumbs, `← {Kind} {title}`, back to the exact address (tab, filter, page, scroll); one step, each page keeps its own; from the page's own list the parent crumb carries the list's state instead | [T-01](T-01-came-from.md) |
| 2.1–2.2 | The picture dialog: step through the list, tick | Opened from a list, ← → / J K move through **the list**; variants move to Shift+← → and a segmented control; the foot has the tick, the step number and Add to process; X ticks, A adds | [T-04](T-04-picture-dialog-browse.md) |
| 2.3–2.4 | Add to an existing process; a sorting mode | "Add to process ▾" on a row, the ticked set and in the dialog; adding is a **scope change** (A is rebuilt from observations, the screen shows "Not on the observed path yet"); **In no process** gets a grid view with a selection bar | [T-05](T-05-sorting-and-add-to-process.md) |
| 3 | Merging two saved processes | Same persona only; one absorbs the other; A rebuilt; the other's to-be survives as a draft "branched from another as-is"; Undo for 10 s, Split back from History | [T-06](T-06-merge-processes.md) |
| 4.1–4.3 | Previous / Next on the Screen page | A pager in the page head's actions: `← Previous · 4 of 37 · Next →`, the neighbour's title in its name, J / K, only when you came from a list; ends stay, disabled | [T-02](T-02-prev-next.md) |
| 4.4 | Pictures in the Screens list | A 96 px picture per row (72 px dense, 64 px phone), the latest recording of the main variant; "No picture" hatched with the reason | [T-03](T-03-pictures-in-lists.md) |
| 5 | A Diagram (Mermaid) component | The graph's own frame (zoom bar, full screen, engage); readable first, top-left; our Mermaid theme; the capability map opens as a **List** with Diagram as the second view | [T-09](T-09-diagram.md) |
| 6.1–6.4, 6.6 | How a canvas moves | **(c) engage to zoom**: drag pans (4 px threshold), the wheel scrolls the page until you click in; engaged, the wheel zooms smoothly at the pointer; Esc or a click outside leaves; buttons step 25…200 % | [T-07](T-07-canvas-movement.md) |
| 5.4, 6.5 | Full screen | `.sy-dialog--full`, the same canvas at the window's size, F to enter, Esc to leave; on a phone it is how a canvas opens | [T-08](T-08-full-screen.md) |
| 7 | Loading without a blink | Head at once; 0–300 ms keep the old page; from 300 ms a skeleton at the final size with the loader; at least 300 ms once shown; list refetch keeps old rows dimmed | [T-10](T-10-loading-and-layout-stability.md) |
| — | **The loader, everywhere content loads** (owner) | `.sy-loader`: three weld beads + what is loading; FE-V45: reserve the final size, CLS ≤ 0.05 per page, checked by a Playwright test | [T-10](T-10-loading-and-layout-stability.md), [T-14](T-14-layout-stability-everywhere.md) |
| 8.1 | Portal and data store side by side | The store joins the portal picker as its second half (`sandbox`, read-only in its name and menu); the assistant's status moves into Ask; the nav foot goes. One header row from 1180 px | [T-11](T-11-header-store.md) |
| 8.2 | The nav on All portals | Every section; Home, Changes, Review, Settings live; the portal sections disabled with "Pick a portal to open these." First visit: one portal → it; several → All portals | [T-12](T-12-all-portals-nav.md) |
| 9 | A command that fails before it starts | The failed state, **Didn't start**, "Created: nothing", the crawler's sentence quoted, Start again; bound to its own run id (30 s); the live map card placed by the server at `scan.started`, no generated mark | [T-13](T-13-command-failed-to-start.md) |

Decisions **D-65…D-78** in `../02-design-decisions.md` (D-71 replaces D-47's wheel rule); requirements **FE-V31…FE-V45**
in `../07-requirements.md` §A.

## Tasks

| Task | Title | Size | Depends on | Screens | Demo |
|---|---|---|---|---|---|
| T-01 | Came from | M | — | v2-17 | components `#c-23-nav` |
| T-02 | Previous / Next on a record page | S | T-01 | v2-17 | `#c-23-nav` |
| T-03 | Pictures in lists | S | T-10 | v2-06 (updated) | `#c-23-rowpic` |
| T-04 | The picture dialog browses its list | M | D-45 | v2-19 | `#c-23-browse` |
| T-05 | In no process: sorting and Add to process | L | T-03, T-04 | v2-18, v2-19 | `#c-23-sort` |
| T-06 | Merge two saved processes | M | T-05 | v2-20 | — |
| T-07 | How a canvas moves | L | — | v2-22 | `#c-23-canvas` |
| T-08 | Full screen | S | T-07 | — | `#c-23-canvas` |
| T-09 | Diagram (Mermaid) | M | T-07, T-08 | v2-21, v2-22 | `#c-23-diagram` |
| T-10 | The loader; loading a page without a blink | M | R-103 (shell) | v2-23, v2-24 | `#c-23-loading`, `loading-lab.html` |
| T-11 | Header: store on the portal picker | S | R-103 (header) | all v2-*, wb-* | `#c-23-header` |
| T-12 | All portals nav, first visit | S | T-11 | v2-15 (updated) | `#c-23-allportals` |
| T-13 | Failed to start; the live map at once | S | R-103 | — | genui-components `#g-start` |
| T-14 | Layout stability everywhere (FE-V45) | L | T-10 | v2-23, v2-24 | `loading-lab.html` |

The same list as a spreadsheet: [`tasks.csv`](tasks.csv) (id, title, size, depends, question, requirement, decision,
screens, demo, files).

## Order of work

1. **The shell** (with R-103): T-11 header, T-12 All portals. Small, and every page shows them.
2. **Loading**: T-10, the loader and the page rule. T-03 and T-14 build on its reserved sizes.
3. **Navigation**: T-01 came from, T-02 pager. They share one piece of router state (`from`, `list`).
4. **Pictures and sorting**: T-03 → T-04 → T-05 → T-06.
5. **Canvases**: T-07 → T-08 → T-09. T-07 changes every graph, so do it in one go.
6. **Workbench**: T-13.
7. **T-14 last and then always**: the CLS audit on every route, and the Playwright check in CI.

## Where to see it

- **Live, with markup:** `design-system/components.html` → section **2.3** (`#c-23`: came from and pager, pictures in
  rows, the dialog browsing a list, the sort grid, the selection bar and Add to process menu, the canvas engaged and full
  screen, the diagram, **the loader and skeletons**, the header with the store, All portals nav);
  `design-system/genui-components.html#g-start` (didn't start · starting · started · the live map card).
- **Try it:** `design-system/loading-lab.html`: the same slow load twice, today's way and the rule's way, with the layout
  shift measured live.
- **Screens (new):** `v2-17-screen-from-process.html` (came from + pager), `v2-18-loose-screens.html` (In no process,
  grid, ticked, Add to process open), `v2-19-picture-browse.html` (the dialog browsing the list), `v2-20-merge-processes.html`
  (merge dialog), `v2-21-capabilities.html` (List), `v2-22-capabilities-diagram.html` (Diagram, engaged),
  `v2-23-loading-screens.html` (the Screens list at 300 ms), `v2-24-loading-screen.html` (a Screen page loading part by part).
- **Screens (changed):** `v2-06-screens.html` (a picture per row), `v2-15-all-portals.html` (disabled sections), and the
  header on every `v2-*` and `wb-*` screen (the store, Ask with status, no nav foot).
- **Screenshots:** `screenshots/answers/23-*.png` (1280, 390, forced colours), `screenshots/screens/v2-1[5-9]*.png`,
  `v2-2*.png`.

## What changed in the package

| File | Change |
|---|---|
| `design-system/css/salvage.css` | Section "2.3 · Navigation and canvases": `.sy-backlink`, `.sy-pager`, `.sy-rowpic`, `.sy-thumb--row`, `--none`, `--loading`, `.sy-dialog__stepper` / `__pick` / `__step` / `__keys`, `.sy-sortgrid`, `.sy-pick`, `.sy-selbar`, `.sy-menu`, `.sy-graph--canvas` / `[data-engaged]` / `[data-panning]` / `__hint`, `.sy-dialog--full`, `.sy-graphview--full`, `--diagram`, `.sy-diagram`, **`.sy-loader`** (`--sm`, `--block`), `.sy-skel`, `.sy-reserve`, `[aria-busy]` dimming, `.sy-portal--store`, `.sy-store`, `.sy-nav__item[aria-disabled]`, `.sy-nav__note`; phone and forced-colour rules |
| `design-system/css/tokens.css` | `--sy-dur-pulse` also drives the loader's beads (comment only) |
| `design-system/components.html` | Section 2.3 demos |
| `design-system/genui-components.html` | `#g-start`: a command that didn't start; the live card placed by the server |
| `design-system/loading-lab.html` | New: today vs the rule, measured |
| `screens/*` | 8 new screens; v2-06 and v2-15 changed; the header on every v2-* and wb-* screen |
| `docs/02`, `07`, `04`, `05`, `06`, `09`, `10`, `12`, `14`, `15`, `16` | Decisions, requirements, parts, hooks, screens list, QA, processes (add, merge), console UX, Workbench start |
| `docs/18-design-answers/04-*.md`, `19-console-answers/03-*.md` | Notes: the wheel rule and fit-on-open now follow T-07 |
| `skill/` | SKILL.md: the 2.3 parts and the loading rule |

## Taking it into the React console

1. Copy `tokens.css`, `salvage.css` and `genui.css` over yours (this round contains rounds 1–3).
2. Work through the tasks in the order above; each has its acceptance checks.
3. Remove what this replaces: plain "Loading…" text and spinners, the wheel-zooms-always graph handler, the per-variant
   Previous / Next in the dialog when it is opened from a list, the "Assistant up" status in the header, the nav foot.
4. Add the CLS check (T-14) to CI with the 1 s API delay, and `ui:check` as before.
