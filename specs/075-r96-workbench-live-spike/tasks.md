# Tasks: spec 075 (R-96 spike)

## Phase 1: chat service (FR-001, FR-002, FR-003, FR-008, FR-009)

- [x] T001 Live conversations (`goal = 'workbench-live'`), `agents/workbench-live.md`, its session
  (no subagent, no crawler server) and fence (no crawler start)
- [x] T002 The assistant keeps composing view specs (`render_view`); `ask_choice` in live mode
  (a choice is a system message, no migration). **Changed:** the planned `show_surface` (the model
  writing A2UI) was dropped for the designer's stage 1 (19/13: the server compiles view specs to
  A2UI), D-6
- [x] T003 Scan runner: Confirm of a live start hands the brief to a background ACP session; its
  tool events feed the step recorder; the live assistant's own idle does not end the runner's steps
- [x] T004 Milestones: started / finished / stopped told to the live assistant once each
- [x] T005 `POST /workbench/conversations/{id}/actions`: `choice.answer`, `persona.new`,
  `scan.stop`, `scan.resume` (a card; nothing runs before Confirm)

## Phase 2: dashboard (FR-004, FR-005, FR-006)

- [x] T010 The projection (`web/workbench_live.py`): portal, store and persona options, command
  cards, choices, the scan with meter, pages, graph, stop and narration; `wb_a2ui.py` compiles a
  view spec to A2UI v0.9.1 as the designer's golden streams
- [x] T011 The WebSocket: snapshot, deltas, the chat stream as AG-UI text and run events, surfaces
  as A2UI messages, heartbeat, sequence numbers, origin check; actions up (Confirm fetches the
  token)
- [x] T012 Live turns: the Live page's first message starts a live conversation; the page's frame

## Phase 3: web (FR-007, FR-008, FR-009, FR-010)

- [x] T020 `useLiveWorkbench`: socket, reconnect with backoff, heartbeat watchdog, a fresh snapshot
  after a lost `seq`, state by JSON Patch, the A2UI data model written at the item (F-03)
- [x] T021 The placeholder catalogue (the designer's names) and the Live page (conversation with a
  surface per turn, composer, stage), loaded lazily
- [x] T022 Choice (portal, store, answer), PersonaCreator (vault, then persona.add), the graph's
  selection as a context chip

## Phase 4: try it

- [x] T030 Live on `local-dev` with the real assistant: start, live graph, a question meanwhile,
  the end and a Stop; a portal switched; a persona added; findings F-04–F-10 fixed
- [x] T040 code-reviewer, roadmap, glossary, changelog, merge
