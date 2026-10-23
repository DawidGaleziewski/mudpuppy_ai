# Tasks: spec 072 (R-101)

## Phase 1: design-system answers (FR-005–FR-009)

- [x] T001 `Shot`: "Not here" as `sy-mark--gone` (box, `shape: 'line'`); no inline gone style
  (the API's `gone`: a line when the marked page is taller by the region's height)
- [x] T002 `Compare` overlay mode (`__stack`, `__under`, `__over`, `__mix` slider); `thin()` for axis ticks
- [x] T003 `Releases`: `sy-releases--ranged` + `data-label`; LABEL_ROOM gone
- [x] T004 `DecisionTable`: `sy-facts--table` above, `aria-describedby`, caption names only
- [x] T005 Drawer: CSS height (inline rules gone), stick-to-bottom log with "New messages ↓"
- [x] T006 `Segmented`: disabled segment with a reason; the drawer's "This page" disabled
- [x] T007 Stories and tests for T001–T006

## Phase 2: maps (FR-001, FR-003)

- [x] T010 `Graph`: open readable (80 % floor, scroll to start or `sel`), overview under 50 %, new steps
- [x] T011 Recorded map: tree / off-tree (arrow, counts, chip) / other scans' edges and layer
  (`map_edges.py`; the layout stays the discovery tree; pages only other scans reached: "Not reached")

## Phase 3: Trace phase bar (FR-002)

- [x] T020 Dashboard: `scan_phases` read model from call spans (pytest), in the trace API
  (`queries_trace_phases.py`: a handoff with 10 s standing still is a wait; `?first=&last=` on the calls)
- [x] T021 `PhaseBar` component (story, test); Trace tab filter, status line, `?phase=`

## Phase 4: scan line (FR-010)

- [x] T030 One scan-line grammar (AI scan / Check run, 13-char id, "no new step for N min", Open); Home's Last scan
  (`scan_words.py`; also the Scans page's Running now and the Workbench card and meter)

## Phase 5: personas (FR-004)

- [x] T040 Chat service: `persona.add` / remove (checks: new name, vault reference, synthetic test data)
  (credential X = X_LOGIN + X_PASSWORD; migration 0050; the contract copy takes round 3)
- [x] T041 Dashboard API relay `POST /api/portals/{portal}/personas`, `…/personas/{name}/remove`;
  Settings ▸ Personas: Add persona (`app/PersonaForm.tsx`, shared with the card) and Remove
- [x] T042 Editable `CommandCard` for `persona.add` in the Workbench; "Add a persona…" on the Start card
  (Confirm sends the edited args; a done card offers Undo; the dashboard relays args and Undo)

## Phase 6: Screen page (FR-011)

- [x] T050 Compare two variants from the Screen page's Variants ("Compare with r1" on each later
  variant opens the pair side by side with what differs, persona included, on Same screen?)

## Close-out

- [x] T060 `ui:check` 1280/390 on changed pages; browser walk
- [x] T061 code-reviewer, roadmap, glossary, changelog, merge
