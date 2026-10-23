# 19 · Console answers, 23 Oct evening (specs 054, 056 · F-01@061, F-01@064 · R-95, R-96)

Answers to the 13 questions from building the React console: the four already asked (Q1–Q4) and the nine new ones
(Q5–Q13). One file per question, numbered like the questions: the decision, why, the markup, React notes, what to change,
and how to check it. Every visual answer is a class in the design system now, with a live demo.

| # | Question | Answer | New parts | Screens changed |
|---|---|---|---|---|
| 1 | [Recorded map edges](01-recorded-map-edges.md) (spec 054) | Answered in round 2: tree ash 2 px · **off the tree** 1 px solid with an arrowhead, one line per page pair, a chip past six · **other scans'** long dash, layer off | `.sy-edge--tree`, `--offtree`, `--others`, `.sy-edge-arrow` | — |
| 2 | [Phase bar for Trace](02-trace-phase-bar.md) (spec 056) | One bar of the scan's time cut into phases (data from the backend); each phase is a button that filters the trace. Working · **Waiting for you** (the only orange) · Quiet (dashed) · running and failed ends | `.sy-phasebar` (`__track`, `__phase[data-kind][data-state]`, `__btn`, `__name`, `__time`, `__axis`, `__key`) | — |
| 3 | [Fit on open](03-fit-on-open.md) (F-01@061) | Not 50 %: open **readable** (never below 80 %, scrolled to the start page); the Fit button still fits everything and draws an **overview** under 50 % | `.sy-graph--overview` | — |
| 4 | [Add a persona](04-add-persona.md) (R-95) | A **command card you edit** (`persona.add`), not a catalogue component. Credentials only by vault reference; new ones through the vault dialog | `.sy-cmd__form`, `__wide`, `__data`, `[data-edited]` · command `persona.add` | — |
| 5 | [Before / after](05-before-after.md) (F-01@064) | **Not here**: `.sy-mark--gone`, a box (things that float) or a line (inserted regions). **Overlay**: the after's picture over the before's at 50 %, marks at full strength, a slider. **Phones**: only the first and last date; elsewhere ticks ≥ 64 px apart | `.sy-mark--gone[data-shape]`, `.sy-compare--overlay`, `__stack`, `__under`, `__over`, `__mix` | v2-03 |
| 6 | [Release range label](06-release-range-label.md) | Yes, room above the lanes was meant (it was a page-local margin). Now inside the timeline's own box; aligns to an end when the range touches it | `.sy-releases--ranged`, `__range[data-label]` | v2-02 |
| 7 | [Decision table facts](07-table-facts.md) | No caption style. Facts **above** the table, outside the caption, `aria-describedby`; the caption only names the table | `.sy-facts--table` | v2-11, v2-12 |
| 8 | [Drawer height](08-drawer-height.md) | Yes, your fix is the intent, now in the CSS: sticky, one window high, the log scrolls; stacked under 1024 px with the log capped | `.sy-drawer` (sticky), `--sy-header-h`, `.sy-drawer--static` | 02 (v1) |
| 9 | [Disabled segment](09-disabled-segment.md) | Yes: keep "This page", `aria-disabled="true"` plus a reason line | `.sy-seg > [aria-disabled]` | — |
| 10 | [Recorded screen page](10-recorded-screen-page.md) | Don't rebuild it: `/states/{id}` → 301 to the Screen page with the **recording dialog**; amendments, inputs (probes), reached-at and persona compare move onto the Screen page | `.sy-dialog__main`, `.sy-dialog__aside` | — |
| 11 | [Full chat page](11-full-chat-page.md) | None in 2.0. Drawer + Workbench Chat. Step tracker retired (a Get started list on a new portal's Home); credentials → Settings vault + persona card; scope → Processes ▸ New process / Move screens | — | — |
| 12 | [Composer scan line](12-composer-scan-line.md) | One grammar: status · AI scan / Check run · 13-char id · progress · pages · queued · where or when; "no new step for 9 min" after 2 min | — | — |
| 13 | [A2UI catalogue](13-a2ui-catalogue.md) (R-96) | A2UI **v0.9.1**. A generated catalog (15 + View + CommandCard); components carry ids, the server owns the data model; stage 1 compiles view specs to A2UI | `workbench/a2ui/` (catalog, streams, check) | — |

Decisions **D-53…D-64** in `../02-design-decisions.md`; requirements **FE-V19…FE-V30** in `../07-requirements.md` §A.

## Where to see it

- **Live, with markup:** `design-system/components.html` → section **2.2** (`#c-22`: phase bar, zoom, before / after,
  timeline, table facts, drawer, recording dialog, scan line); `design-system/genui-components.html#g-persona` (the persona
  card, its done state and the vault dialog).
- **Screens:** `v2-02-changes.html` (ranged timeline), `v2-03-change-detail.html` (Not here line), `v2-11-rules.html` and
  `v2-12-rule-detail.html` (facts above the table), `02-screen-with-assistant.html` (drawer one window high).
- **Screenshots:** `screenshots/answers/22-*.png`.

## What changed in the package

| File | Change |
|---|---|
| `design-system/css/salvage.css` | Section "2.2 · Console answers" (Q2, Q3, Q5–Q10), responsive rules (1199, 1023, 639 px) and forced colours |
| `design-system/css/genui.css` | Section "2.2 · A command card you can edit" (Q4) |
| `workbench/tools/gen_wb_schema.py` → `schema/*`, `examples/*`, `a2ui/*` | `persona.add`, `personaName`, `vaultRef`; `scan.start` takes any persona name; the A2UI catalog and streams |
| `workbench/a2ui/check.py`, `workbench/reference/tests/test_a2ui.py`, `test_catalogue.py` | A2UI checks; persona contract tests (all reference tests and evals pass) |
| `docs/12-v2-ux.md` §6, §7.1 | Not here and overlay classes; facts above the table |
| `docs/16-genui-components.md` §5.12, `14-workbench.md` | The editable command card and `persona.add` |
| `docs/18-design-answers/09-a2ui-carry-over.md` | Points to v0.9.1 |

## Taking it into the React console

1. Copy `salvage.css` and `genui.css` over yours (round 3 contains rounds 1 and 2).
2. Replace the workarounds: inline "Not here" and overlay styles (Q5), the extra margin above the timeline (Q6), your
   drawer height rules (Q8), the text-only Whole yard (Q9).
3. Build the new parts: phase bar (Q2), readable open + overview (Q3), editable CommandCard (Q4), recording dialog and the
   `/states` redirect (Q10), the scan line words (Q12).
4. Take the regenerated contract from `workbench/schema/` (persona.add).
5. Run `ui:check`, the contract tests and `python3 workbench/a2ui/check.py`.
