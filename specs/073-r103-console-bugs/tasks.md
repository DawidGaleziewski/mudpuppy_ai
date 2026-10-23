# Tasks: spec 073 (R-103)

## Phase 1: Workbench commands (FR-001, FR-002, FR-010)

- [x] T001 A confirmed start ends `failed` when its crawler turn ended with no run (the step
  recorder's failure, the crawler's `start_run` error when known, `error_ref`); a command's run is
  its own step's run, never a later command's (regression test: down → failed, start again)
- [x] T002 The Start card preselects the proposed persona (`args.persona`); `confirmed_by` (D-1)
- [x] T003 Live card at once: a `scan.start` done with a run adds the LiveMap card to its turn
  from the run (data lane, no model)

## Phase 2: frame and navigation (FR-003, FR-005, FR-007)

- [x] T010 One frame: `Shell` once in a layout route; pages hand up `current`, `portal`, context;
  the caret loading state
- [x] T011 Portal picker in the header (FE-N01/FE-N02); All portals keeps the nav; e2e-style test
  "switch on Processes → still on Processes"
- [x] T012 Back keeps your place: scroll restored on POP, top on PUSH; crumbs keep the list's address

## Phase 3: screens and processes (FR-004, FR-006, FR-011)

- [x] T020 Prev / Next between screens over the list it was opened from (J / K)
- [ ] T021 Loose screens into an existing process: drag onto a process, and a menu for the keyboard
  **Deferred:** what it writes when the process's A is observed-only (a to-be draft, a scope
  change, a suggestion for the next scan) is round 4 Q2.3, open for the designer and the owner
- [x] T022 Tag lists in `Tags` (Portals ▸ Other environments; the other bare lists)

## Phase 4: canvases (FR-008, FR-009)

- [x] T030 One zoom/pan hook: Ctrl / ⌘ + wheel and pinch at the pointer, Fit off on zoom or pan,
  no text selection on the canvas (Graph)
- [x] T031 Diagram in `.sy-graphview` with the zoom bar (capability map, process maps, Process tab);
  step labels without "Unsupported markdown: list"

## Close-out

- [x] T040 `ui:check` 1280/390 on changed pages; findings.md (an eval or test idea per part)
- [x] T041 code-reviewer, roadmap, glossary, changelog, merge
