# 18 · Design answers, 23 Oct (specs 052, 053 · R-94 (3) · D-9)

Answers to the seven open questions from the React console and the Workbench, plus the filmstrip fix (F-15 a). Every answer
is a class or a rule in the design system now, so nothing needs to stay inline or be invented. One file per question:
what was decided, why, the markup, a React sketch, what to change, and how to check it.

| # | Question | Answer | New parts | Blocks step 5? |
|---|---|---|---|---|
| 1 | [Picture: zoom button](01-picture-zoom-button.md) | A naked button with an always-visible corner icon; "Enlarge" on hover, focus and touch; marker ring with a steel gap | `.sy-thumb-btn` (`__hint`, `__word`) | No |
| 2 | [Picture: wide dialog](02-wide-picture-dialog.md) | `min(1280px, 100vw − 32px)`; tall pictures fit to width and scroll inside; "Whole page" shrinks to fit; full screen under 640 px | `.sy-dialog--wide`, `.sy-dialog__figure[data-fit]`, `.sy-dialog__close` | No |
| 3 | [One variant stretches](03-variants-layout.md) | Not intended. Variants are a list (`auto-fill`); a lone variant gets a picture-left layout. `.sy-compare` stays for before / after | `.sy-variants`, `.sy-variant` (`__head`, `__pic`, `__body`) | No |
| 4 | [Zoom bar and graph height](04-graph-zoom-bar-and-height.md) | Bar floats top-right, sticky under the header; height = natural, capped at the viewport below the header (520 px when embedded); phones: list first, graph full screen | `.sy-graphview` (`--embedded`), `.sy-graph__zoom`, `.sy-graph__zoom-level` | **Yes**, take it with step 5 |
| 5 | [Record ids](05-record-ids.md) | All 13 prefixes, three or more digits | contract: `recordId`, `ruleId`, `changeId`, `findingId` | No |
| 6 | [Full scan ids](06-scan-ids.md) | Full UUID in data; 13-character short form on screen (first two groups = start time); full id on hover, Copy, the scan page; time labels on timelines | contract: `scanId`, `eventRef`; `.sy-id` (`--full`, `__copy`) | No |
| 7 | [Beta chip contrast](07-beta-chip-contrast.md) | Chips on the selected nav item take its ink: 14.7:1 | one rule | No |
| F-15 a | [Names from visible text](08-filmstrip-and-node-names.md) | No `aria-label` on filmstrip items and map nodes; extras in sr-only spans | markup rule | No |
| — | [A2UI carry-over](09-a2ui-carry-over.md) | What moves into the A2UI catalog, what the server keeps | — | — |

Decisions D-44…D-51 in `../02-design-decisions.md`; requirements FE-V11…FE-V17 in `../07-requirements.md` §A.

## Where to see it

- **Live, with markup:** `design-system/components.html` → section "2.1" (`#c-21`).
- **In screens:** `screens/v2-07-screen-detail.html` (variants with picture buttons), `screens/v2-08-map.html` (graph view and
  zoom bar, Map page and embedded excerpt), `screens/wb-01-inline-live.html` (scan id with Copy in the side sheet). Every
  screen now shows scan ids in the 13-character form.
- **Screenshots:** `screenshots/screens/` (refreshed), `screenshots/system/components.png`.

## What changed in the package

| File | Change |
|---|---|
| `design-system/css/salvage.css` | Sections "2.1 · …" for Q1, Q2, Q3, Q4, Q6, Q7; responsive rules at 1199 px, 639 px and on touch |
| `workbench/tools/gen_wb_schema.py` → `workbench/schema/*`, `workbench/examples/*` | Q5 and Q6 patterns; full scan ids in every example; new examples `valid/chat-records-long-ids.json`, `invalid/short-scan-id.json`, `invalid/unknown-record.json` |
| `workbench/reference/` | Full scan ids (`short_id()` for display); tests and evals pass |
| `screens/*`, `docs/*`, `design-system/*.html` | Scan ids in the short form; full ids in JSON, URLs and API paths; filmstrip and node names (F-15 a) |
| `docs/13-v2-fixtures.md` | The fixture's full scan ids |

## Taking it into the React console

1. Copy `design-system/css/salvage.css` (and `genui.css` if you use the Workbench) over your copy. Nothing else in the CSS
   changed, so this is safe on its own.
2. Replace the inline styles named in each answer (`Picture.tsx:23-25`, `Graph.tsx:98-117`, `Screen.tsx:66`).
3. Take the regenerated contract from `workbench/schema/` into `packages/workbench-contract` (or run the generator).
4. Add `shortScanId()` and the Copy button (Q6).
5. Run `ui:check` and the contract tests.
