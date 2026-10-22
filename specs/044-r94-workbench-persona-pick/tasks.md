# Tasks: spec 044 (persona on the Start card)

Plan: chat first (the rule and the confirm input), then the dashboard card, then docs.

- [X] T001 [opus] Chat: `prepareStart` takes an optional chosen persona; default newest run → `guest` → first persona file (`apps/chat/src/workbench-commands.ts`)
- [X] T002 [opus] Chat: confirm body `persona` (checked id) passed through `confirmCommand` (`workbench-cards.ts`)
- [X] T003 [sonnet] Chat: a refused scan's message lists its missing items (FR-005)
- [X] T004 [sonnet] Chat tests: chosen persona, first scan as guest, bad persona, message names the item (`apps/chat/tests/workbench-commands.test.ts`)
- [X] T005 [opus] Dashboard: the Start card's persona choice and default (`wb_render.py`, `wb_frames.py`, `views_workbench.py`)
- [X] T006 [sonnet] Dashboard: template "As" select inside the Confirm form; no persona → note, no Confirm (`templates/salvage/workbench/command.html`)
- [X] T007 [sonnet] Dashboard: Confirm forwards `persona` (`web/workbench_actions.py`)
- [X] T008 [sonnet] Dashboard tests (`tests/test_wb_routes.py`, `tests/test_wb_frames.py`)
- [X] T009 [haiku] Roadmap R-94 note + new row R-95 (persona from the Workbench); spec 043 F-18 status; glossary check (no new term: "persona" exists)

Note: the persona is applied when the confirmed command runs (`startAs` in `run`), not in
`prepareStart`, so a bad choice fails the command with its reason instead of a silent 409.
