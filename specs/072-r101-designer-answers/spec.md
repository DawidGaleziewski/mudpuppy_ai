# Spec 072: The designer's console answers, round 3 (R-101)

**Branch:** `feature/072-r101-designer-answers` · **Source:** `docs/design/salvage-yard/docs/19-console-answers/`
(2026-10-23 evening; decisions D-53…D-64, requirements FE-V19…FE-V30). The package's CSS came in
with R-100 (e1bcc9d), and Q10 (the recording dialog) and Q11 (no chat page) were built there.

## Why

The React console still has workarounds where the designer has now given a class: inline "Not
here" and overlay styles, a page-local margin above the release timeline, our own drawer height
rules, a text-only "Whole yard". Maps open unreadably small, the Trace tab has no picture of the
scan over time, the scan line's words differ from Home's, and a persona can only be added by
asking the assistant.

## What this builds

- **FR-001 Recorded map edges (Q1).** The recorded map draws first visits `sy-edge--tree`, moves
  off the tree `sy-edge--offtree` with an arrowhead (one line per page pair, `↩ 3×`; more than six
  into one page → a chip), other scans' moves `sy-edge--others` behind a layer that is off by
  default. The layout uses tree edges only. `--retired` and `--unseen` are not used on this map.
- **FR-002 Trace phase bar (Q2).** The dashboard derives a scan's phases from its call spans:
  Start (start_run, login), Replay (go_to_state), Explore (navigate, act, frontier picks), Fill
  forms (act with a form step), Probe (probe_form); Waiting for you (a handoff) and Quiet (no call
  for 60 s or more, cut out of the phase it falls in). Each phase has name, start, end, kind, state
  (`done`, `running`, `failed`), first and last step. The Trace tab draws `PhaseBar` above the
  trace; pressing a phase filters the trace to its steps, `?phase=` keeps it, a status line says
  what is shown with Show all.
- **FR-003 Maps open readable (Q3).** A map opens at its fit zoom but never below 80 %, scrolled
  to the start page or `?sel=`; Fit fits everything at any zoom; under 50 % the graph is an
  overview (`sy-graph--overview`), and clicking a node there zooms to 100 % on it. Zoom steps 25 ·
  33 · 50 · 67 · 80 · 100 · 125 · 150 %.
- **FR-004 Add a persona (Q4, R-95).** `POST /api/portals/{portal}/personas` (name, about,
  credential as a vault reference, test data) and `DELETE …/{name}` while no scan used it, through
  the chat service like every write. Settings ▸ Personas gets an Add persona form. The Workbench's
  `CommandCard` gets an editable variant for `persona.add` (fields marked when changed, Confirm
  sends what is shown); the Start-a-scan card ends its persona list with "Add a persona…". No
  secret value is ever a field: credentials are vault references.
- **FR-005 Before / after (Q5).** `Shot` draws "Not here" as `sy-mark--gone` (box, or
  `data-shape="line"` for an inserted region) instead of inline styles; `Compare` gets an overlay
  mode (`sy-compare--overlay`, the after's picture over the before at a slider's mix, its marks
  at full strength); timeline axes thin their ticks to 64 px apart, keeping both ends.
- **FR-006 Ranged timeline (Q6).** `Releases` with a range adds `sy-releases--ranged` and the
  range's `data-label` (`start`, `end`); the inline label room goes.
- **FR-007 Facts above a decision table (Q7).** `DecisionTable` draws its facts as
  `sy-facts sy-facts--table` above the table, joined by `aria-describedby`; the caption only names
  the table.
- **FR-008 The drawer one window high (Q8).** The drawer's inline sticky and height go (the CSS
  has them); the log sticks to the bottom and offers "New messages ↓" when scrolled up.
- **FR-009 A disabled segment (Q9).** `Segmented` takes a disabled segment (`aria-disabled`, the
  click ignored, a reason by id); the drawer shows "This page" disabled with the reason line on
  pages without a page context.
- **FR-010 The scan line's grammar (Q12).** Every scan line reads status · AI scan / Check run ·
  13-character id · progress · pages · queued · where or when, "no new step for N min" (muted)
  after 2 min, and its link is "Open". Home's Last scan uses the same words without the status.
- **FR-011 Compare persona variants (Q10's rest).** The Screen page's Variants offer "Compare"
  between two variants, opening the before / after with the persona row in the context.

## Not in this spec

- **Q13 (the A2UI v0.9.1 catalogue)** is the brief for R-96's Workbench spike, which waits for the
  owner; it stays on R-96.
- Q10's dialog, `/states` redirect, Amendments and Inputs tabs, and Q11 were built in R-100.

## Acceptance

Each answer's own Acceptance section in `19-console-answers/`, plus: `pnpm typecheck && pnpm lint
&& pnpm test` in `apps/web`, the dashboard's and chat's suites, `ui:check` at 1280 and 390 on the
changed pages, `build-storybook`, and every new or changed component with its story.

## Decisions taken while building

- **A sign-in is one credential name `X`** (the contract's `vaultRef`), standing for the pair
  `X_LOGIN` / `X_PASSWORD` our personas sign in with (as `REF_INSURER_KLIENT` does for
  `klient.yaml`). A new name's values are stored through the vault as before; the card and the
  form never hold a value.
- **Test data are label → value** (the persona file's shape); the contract's route and state of a
  field are accepted and not kept.
- **A persona's "who this is"** is the persona file's top comment (the schema has no field).
- **Phases** come from the call spans: a handoff (captcha) followed by 10 s or more without a call
  is Waiting for you; 60 s or more without a call is Quiet; a work stretch under 3 steps between
  two of one other kind joins them.
- **"Not here" as a line** when the marked page is taller by the region's height (±15 %); else a box.
- **Compare with r1** opens the pair on Same screen? (side by side, what differs incl. persona)
  rather than a new page.

## Close-out review (code-reviewer, 2026-10-24)

| # | File | Guideline | Finding | Outcome |
| - | ---- | --------- | ------- | ------- |
| 1 | apps/dashboard/LAYOUT.md | G-30 | `scan_words.py` missing from the layout map | fixed |

Size and complexity (G-01–G-04), suppressions (G-19–G-23), layers (G-13, G-15), migration 0050
up/down and snapshot (G-16), tests for every new module (G-25–G-28): no findings.

## Leftovers

- Q13 (the A2UI v0.9.1 catalogue) stays on R-96 (the Workbench spike).
- The vault dialog inside the persona card (store a new credential's values from the card).
- A Compare frame of its own for two variants (today Same screen? hosts it).
- Off-tree arcs share one label height over the top row; many arcs' labels can overlap.
