# Spec 061: the designer's answers in the React console (R-96, step 12)

**Branch:** `feature/061-r96-design-answers` · **Owner (2026-10-23):** "ok sounds good. As per your
advice. Go for it … Proceed with what you can." The designer answered the open questions of specs
052–054 and R-94 (3) (`docs/design/salvage-yard/docs/18-design-answers/`, D-44…D-51, FE-V11…FE-V17).
This step takes them in before the Review page, so the pages already built stop carrying stand-ins
and the next pages copy the right parts.

## What this step builds

- **FR-001 The package:** the answers, the updated docs (02, 07, 13), CSS, screens, screenshots and
  the regenerated Workbench contract go into `docs/design/salvage-yard/`; `pnpm ds:sync` copies the
  CSS into `apps/web` (only the new "2.1" sections change; the patch applies cleanly to our copy).
- **FR-002 Picture (Q1, Q2):** the thumbnail is a `.sy-thumb-btn` with the corner badge and
  "Enlarge" (name: the picture's alt + ", enlarge"); no button without a picture. The dialog is
  `.sy-dialog--wide` with a `.sy-dialog__figure`: Fit width (scrolls inside) or Whole page
  (remembered for the session), a close button, the screenshot / wireframe switch kept, ← / → and
  Previous / Next between a screen's variants, "Open full size in a new tab", and "Picture not
  available" when the picture does not load. Focus goes back to the thumbnail on close.
- **FR-003 Variants (Q3):** a `Variants` / `Variant` pair in the design system (`.sy-variants`,
  head, picture, body); the Screen page's Variants tab uses it instead of `Compare`, and a lone
  variant says "One variant so far. …". `Compare` stays for before / after.
- **FR-004 Graph view (Q4):** `Graph` draws `.sy-graphview` (or `--embedded`, at most 520 px) with
  the floating `.sy-graph__zoom` toolbar: −, the level (resets to 100 %), +, Fit (`aria-pressed`
  while fitted); steps 50 · 67 · 80 · 100 · 125 · 150 %; +, − and 0 when focus is in the graph;
  opens fitted when the canvas is wider than the box. The inline 75vh goes. The model map uses the
  page view; the recorded map and the scan's graph the embedded one.
- **FR-005 Scan ids (Q6, D-9):** `shortScanId` (the first two groups; the third too when two ids in
  the same list share them) and a `ScanId` component (`.sy-id`, the full id in `title`, an optional
  Copy that says "Copied"; `full` on the scan's own page). Every scan id the React pages show goes
  through it; links, API calls and values keep the full id.
- **FR-006 The contract (Q5, Q6):** `packages/workbench-contract/workbench/` takes the regenerated
  folder (all 13 record prefixes with 3+ digits, full scan ids, `eventRef` on full ids). The htmx
  Workbench follows: the assistant gets and returns full scan ids, the short-id matching (F-05)
  goes, a RecordCard names its type (Requirement, Business rule, …).
- **FR-007 The beta chip (Q7):** comes with the CSS; no markup change.

## Not in this step

- The htmx pages keep their 8-character scan tags; they go as each page moves to React.
- The edge classes for the recorded map (a move off the tree, a move other scans made) and a phase
  bar for Trace: still with the designer (owner asked 2026-10-23).
- The release timeline's scan marks by start time (Q6): the React console has no release timeline
  yet.
- From Q4, left for a later step: on a phone, "Show the map" opening the graph full screen in the
  wide dialog (the maps already open as the list under 640 px); Ctrl + wheel and pinch zoom around
  the pointer; Fit turning off when the person pans (it turns off when they zoom).
- From Q2: the thumbnail stretched in the dialog while the large picture loads (the API gives one
  picture per view, the same file as the thumbnail, so nothing loads later).
- The 96 px small thumbnail keeps one layout-only inline width: the library's `.sy-thumb-btn` has
  no small size.

## Findings

- **F-01 Fit on open makes text tiny** (for the designer): the rule "open fitted when wider than
  the box" opens the reference portal's model map at 47 % and a scan's embedded graph at 34 %, where
  node text is too small to read. Built as specified; ask whether Fit should stop at 50 % (the
  lowest step) and scroll the rest.
- **F-02 Shared ids in fixtures**: the React test fixtures had two scan ids that share all but the
  last group (`…-7000-8000-00000000000{1,2}`), which a real UUIDv7 never does in its third group.
  `shortScanId` widens one group at a time up to the whole id, so it holds for both.

## Validation

- [x] `pnpm typecheck && pnpm lint && pnpm test` in `apps/web` (88 tests: the thumbnail button and
      its name, Fit width / Whole page kept for the session, Picture not available, ← / → through
      a set; a lone variant; the zoom bar's steps, keys, Fit pressed, embedded; `shortScanId`
      widening, the tag with the full id, Copy); `pnpm build`; `pnpm build-storybook`.
- [x] `pnpm typecheck && pnpm lint && pnpm test` in `packages/workbench-contract` (31) and
      `apps/chat` (349: full ids in the context, chips and commands; a prefix names no scan).
- [x] Dashboard: ruff and the whole suite (full ids bound and resolved, event refs on full ids,
      the short form on cards, the RecordCard type words); glossary entry `scan-id`.
- [x] `pnpm --dir apps/dashboard ui:check` at 1280 and 390 px on SC-0004 (three variants), SC-0001
      (one), the model map, One scan's path, a scan page, Scans and the portal home of
      reference-insurer-local: all pass.

## Close-out review: feature/061-r96-design-answers (2026-10-23)

Files and functions within G-01–G-06 (largest changed file `Graph.tsx`, 314 non-blank lines; no
function over 80 lines); no router imports a router, no SQL in routers (G-13, G-15); the old
short-id resolution deleted in chat and dashboard, not left beside the new one (G-20); new
components with stories and tests (G-25–G-27). The designer's copies (contract JSON, generator,
CSS, `docs/design/salvage-yard/**`) not reviewed.

| # | File:line | Guideline | Finding | Change | Size | Outcome |
|---|---|---|---|---|---|---|
| 1 | `apps/web/src/design-system/components/ScanId.tsx:87` | G-19 | The component's doc comment sat on the private `ShownProps`. | Moved onto `ScanId` | small | fixed |
| 2 | `apps/web/src/design-system/components/Graph.tsx:~160` | G-23 | The hooks-deps suppression had its reason on another line. | Reason after `--` on the same line | small | fixed |
| 3 | `apps/chat/agents/workbench.md:21,38` | G-19 / G-30 | The Workbench prompt still said scan ids have 8 characters; the contract now refuses them. | Bind whole ids, match a person's first characters to a listed scan, speak the first two groups | small | fixed (not run live: the golden prompts' live run is paid, D-8) |
| 4 | `apps/chat/src/workbench-context.ts:12-13` | G-20 | `EVENT_REF` repeats `SCAN_ID`'s pattern text. | none | large (not worth it) | deferred |

Summary: 4 findings; 3 fixed, 1 deferred.
