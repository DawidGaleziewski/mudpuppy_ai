# MudPuppy · design round 4, as tasks (24 Oct 2026)

Answers to "Designer questions, round 4: console navigation and canvases" (Q1–Q9), plus the owner's request of the same
day: **a loader that fits the design system, required wherever content loads, and pages that don't jump.** Written as
**14 tasks** you can pick up one by one. Lay this over rounds 1–3; the CSS here contains all four.

**Start here:** `docs/20-navigation-and-canvases/README.md`: questions → tasks, the task table, the order of work. Each
`T-xx` file has the decision, why, markup and classes, React notes and acceptance checks. The same list as a spreadsheet:
`docs/20-navigation-and-canvases/tasks.csv`.

| Task | Size | Short answer |
|---|---|---|
| T-01 Came from (Q1) | M | `← {Kind} {title}` above the crumbs, back to the exact address; one step; from its own list the parent crumb keeps the list's state |
| T-02 Previous / Next (Q4) | S | A pager in the head's actions, `← Previous · 4 of 37 · Next →`, J / K, only when opened from a list |
| T-03 Pictures in lists (Q4) | S | A picture per row in Screens (96 / 72 dense / 64 phone px), "No picture" with its reason |
| T-04 The picture dialog browses its list (Q2) | M | ← → / J K through the list, Shift ← → variants, X tick, A Add to process |
| T-05 Sorting, Add to process (Q2) | L | In no process as a grid with a selection bar; "Add to process ▾" everywhere; adding is a scope change, A stays observed-only |
| T-06 Merge two processes (Q3) | M | Same persona only; one absorbs the other; A rebuilt; Undo 10 s, Split back later |
| T-07 How a canvas moves (Q6) | L | Engage to zoom: drag pans, the wheel zooms only after a click in, Esc releases; replaces D-47's wheel rule |
| T-08 Full screen (Q5, Q6) | S | `.sy-dialog--full`, same zoom and position in and out |
| T-09 Diagram (Q5) | M | Mermaid inside the graph frame with our theme; capability map as a List first |
| T-10 The loader; no blink (Q7) | M | `.sy-loader`: three weld beads + what loads. Head at once; nothing under 300 ms; then a skeleton at the final size |
| T-11 Header store (Q8) | S | The store joins the portal picker; the assistant's status moves into Ask; one header row from 1180 px |
| T-12 All portals nav (Q8) | S | Every section; the portal ones disabled with "Pick a portal to open these." |
| T-13 Didn't start (Q9) | S | The failed card, "Didn't start · Created: nothing", the cause quoted; the live map placed at once at `scan.started` |
| T-14 Layout stability everywhere | L | **FE-V45:** reserve the final size wherever content loads, the loader after 300 ms, **CLS ≤ 0.05** per route, a Playwright check |

## See it

- **Live, with markup:** `design-system/components.html` → section **2.3** (`#c-23`), and
  `design-system/genui-components.html#g-start`.
- **Try the loading rule:** `design-system/loading-lab.html`. Press "Load: slow (1.2 s)": the left pane is today (it jumps, the
  shift is measured), the right pane is the rule (0.000).
- **Screens, new:** `screens/v2-17-screen-from-process.html` (came from + pager), `v2-18-loose-screens.html` (sorting grid,
  selection bar, Add to process), `v2-19-picture-browse.html` (the dialog browsing the list), `v2-20-merge-processes.html`,
  `v2-21-capabilities.html` (List), `v2-22-capabilities-diagram.html` (Diagram, engaged), `v2-23-loading-screens.html`
  (a list loading), `v2-24-loading-screen.html` (a page loading part by part).
- **Screens, changed:** `v2-06-screens.html` (pictures), `v2-15-all-portals.html` (disabled sections), and the header on
  every `v2-*` and `wb-*` screen. Their links to v1 pages and the start page work only in the full package.
- **Screenshots:** `screenshots/answers/23-*.png` (each part at 1280 and 390, five in forced colours, the start card),
  `screenshots/screens/` (the new and changed screens), `screenshots/system/loading-lab.png`.

## What's in the folder

| Folder | What |
|---|---|
| `docs/20-navigation-and-canvases/` | README, T-01…T-14, `tasks.csv` |
| `docs/` | Decisions **D-65…D-78** (`02`; D-47's wheel rule replaced by D-71), requirements **FE-V31…FE-V45** and the new header order in FE-N01 (`07`), the 2.3 parts (`04`), hooks and JS duties (`05`), screens (`06`), QA (`09`), add to process and merge with their API (`10`), moving around and loading (`12`), didn't start (`14`, `16`), console loader vs the assistant's skeleton (`15`); notes in `18-design-answers/04` and `19-console-answers/03` |
| `design-system/` | Full CSS (`salvage.css` section "2.3", tokens comment), fonts, both component pages, the loading lab |
| `screens/` | All `v2-*` and `wb-*` screens (new header), 8 of them new |
| `patches/` | Diffs against round 3: `salvage.css`, `tokens.css`, all docs, one screen's header (`v2-01`), `v2-06`, `v2-15`, `SKILL.md` |
| `skill/mudpuppy-salvage-ui/` | The UI skill with the 2.3 parts, the loading rule and the CLS check; references re-synced (incl. `20-…`) |

## Order of work

1. T-11, T-12 (the shell, with R-103) → 2. T-10 (the loader) → 3. T-01, T-02 → 4. T-03 → T-04 → T-05 → T-06 →
5. T-07 → T-08 → T-09 → 6. T-13 → 7. T-14 last, then in CI for good.

## Checks run

No page-level overflow at 1280 on any `v2-*` / `wb-*` screen or the component pages (and none at 390 on
`components.html`); no unknown `sy-` classes, no duplicate ids, no broken ARIA references; header one row at 1280 and
1200; the loading lab measures about 0.015–0.03 shift per slow load today (depending on the window) and 0.000 with the rule. `genui.css` and the Workbench contract
are unchanged in this round. The full package (`mudpuppy-salvage-yard.zip`) has everything applied.
