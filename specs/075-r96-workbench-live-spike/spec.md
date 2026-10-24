# Spec 075: the Workbench spike: A2UI, live shared state over a WebSocket, a background crawler (R-96)

**Branch:** `feature/075-r96-workbench-live-spike` · **Source:** roadmap R-96 (the spike), R-95
(add a persona in place), the owner's go of 2026-10-24.

## The owner's brief (2026-10-24)

> Ok let's do it. Don't wait for designer. Just use ugly unstyled components (like grey boxes) as
> placeholders and test these functionalities. Especially the graph showing us the scan running and
> its path/progress and persona creator one. Try also things like drop down for asking user to
> change portal or changing sandbox.

So this is a spike: it proves the plumbing end to end with placeholder components, the old
Workbench stays as it is, and the designer's catalogue comes later (R-96's spec with the designer).

## Why

The htmx Workbench, and its React port, compose a view with the designer's view-spec. After
Confirm the assistant ran the crawler inside its own turn and waited ~30 minutes for it (spec 043
F-19, D-5): nothing live appeared, and the assistant could not answer meanwhile. The owner chose
(2026-10-22, R-96): React, **A2UI** for what the agent shows (`@a2ui/react`, our own components),
**AG-UI** event types for shared state (`STATE_SNAPSHOT`, `STATE_DELTA` as JSON Patch), over
**WebSockets**, agents in the background, the agent behind ACP.

## What this builds

A second Workbench mode, **Live** (`/app/portals/{p}/workbench/live`), beside the beta Workbench.

- **FR-001 A live conversation.** A Workbench conversation started from the Live page is live
  (`chat_conversations.goal = 'workbench-live'`). Its assistant gets `agents/workbench-live.md`: it
  composes views with `render_view` as before (the server compiles them to **A2UI**, D-6),
  proposes commands with `propose_command`, asks with `ask_choice`, reads with the BA read tools,
  and never starts a subagent (its fence refuses `Agent`).
- **FR-002 The scan runs in the background.** Confirm on a live conversation's `scan.start` or
  `scan.resume` hands the crawler brief to a **scan runner**: an ACP session of its own that starts
  the crawler with exactly the confirmed prompt (the same `Launches` fence as before). The live
  assistant's turn ends at once; the person can talk to it while the scan runs. The runner's tool
  events move the conversation's workflow steps as before (the step recorder), so the command card
  ends done with its run, or failed with the crawler's refusal (spec 073).
- **FR-003 Milestones reach the assistant.** When the scan starts, finishes or stops, the chat
  service gives the live assistant an event turn with the facts (status, pages, steps, the stop's
  reason), once each; the assistant narrates and proposes the next move.
- **FR-004 Shared state over a WebSocket.** The dashboard serves
  `/api/workbench/live/{conversation}/ws` (same origin, origin checked). It sends AG-UI events:
  `STATE_SNAPSHOT` on connect, `STATE_DELTA` (JSON Patch) when the projection changes (read about
  once a second), the assistant's words as `TEXT_MESSAGE_START` / `_CONTENT` / `_END` and turns as
  `RUN_STARTED` / `RUN_FINISHED` (relayed from the chat's event stream), the surfaces as
  `CUSTOM` `a2ui` (A2UI v0.9 messages), and a `CUSTOM` `heartbeat` every 15 s. Each frame has a
  sequence number; a reconnect gets a fresh snapshot and the words resume from the chat's last
  event id. The person's actions go up the same socket.
- **FR-005 The state.** One projection per conversation, read-only on the store: the portal and
  data store, the portals and stores to switch to, the personas, the conversation's command cards,
  and the scan: status, steps, pages, queued, where the crawler is, the route pages, the scan's
  graph (the scan page's laid-out nodes and edges) with the crawler's node and its path, and a
  narration line per step written from the scan's events (numbers from events, never from the
  model). The assistant binds components to these paths; it never writes a count or a route.
- **FR-006 A live scan surface at once.** While the conversation's scan runs or after it ended, the
  page shows a server-made surface (progress, graph, route, narration) without waiting for the
  assistant; the assistant's own surfaces come beside it.
- **FR-007 Placeholder catalogue (owner: "grey boxes").** Components: `Column`, `Text`, `Note`,
  `ScanProgress`, `ScanGraph` (nodes at their places, edges, the crawler's node and the path
  marked, a node can be selected), `ScanRoute` (the route pages in order), `Narration`,
  `ChoicePicker` (a drop-down: a question, options from a state path or literal, Send),
  `PersonaCreator` (name, about, signs in or not, the credential's name, its login and password
  for the vault, a test-data row), `Button` (an action), `CommandList` (the conversation's cards
  with Confirm / Cancel). Plain grey boxes in `apps/web/src/workbench-live/`; the look waits for
  the designer.
- **FR-008 Choices go both ways.** `ChoicePicker` of kind `portal` moves to that portal's Live
  page; of kind `store` moves the page to that data store (`?store=`), and the card says when
  commands do not run there (the chat runs one environment); of kind `answer` sends the person's
  answer to the assistant as an event turn.
- **FR-009 Add a persona in place (R-95).** `PersonaCreator`: the login and password go to the
  vault through the existing credential route (never into the shared state, an action or the
  assistant's context); then the persona is added by the person's own Save, which is the confirm
  of a `persona.add` command (source `button`, `confirmed_by` the person), and the assistant is
  told by name only.
- **FR-010 Selection goes up.** Selecting a graph node is shared state (`/selection`); the
  person's next message carries it as a context chip (`page`, the scan and the route).

## Decisions (for the owner's review)

- **D-1 The WebSocket is in the dashboard, not the chat service.** The dashboard has the read
  models the state needs (`queries_wb_scan.scan_live`, `queries_run_graph.run_graph`), the
  browser reaches it on the same origin, and writes still go to the chat service. The chat
  service keeps its SSE stream; the dashboard bridges it to AG-UI frames.
- **D-2 Reconnect = a fresh snapshot**, not a replay of deltas: the state is a projection of the
  store, so a snapshot is always right; the words resume by the chat's `Last-Event-ID`.
- **D-3 The command cards are a frame component** (the server owns them, as WB-UI-21 says), not
  something the assistant places; the one-time confirm token never travels in the state: the
  dashboard fetches it when the person presses Confirm.
- **D-4 Placeholder CSS** in `apps/web/src/workbench-live/placeholder.css` (the owner's "grey
  boxes"); the spike's components are not in the design system and get no stories.
- **D-5 AG-UI types only** (`@ag-ui/core`, `ag-ui-protocol`): our own client and transport; no
  AG-UI client package (it speaks HTTP/SSE to an agent endpoint, we have a WebSocket to a
  projection).

- **D-6 Stage 1 of the designer's A2UI plan** (19-console-answers/13): the assistant keeps writing
  view specs and the server compiles them to A2UI (golden streams in
  `packages/workbench-contract/workbench/a2ui/`), instead of the planned `show_surface` tool where
  the model writes A2UI itself (stage 2, R-104). The catalog id and the component names are the
  designer's; `Choice` is the spike's own server-owned frame.

## Not in this spike

- The designer's catalogue, the look, Storybook stories for the live components, golden-prompt
  evals of the live assistant (a paid run, R-94 (2)).
- Retiring the beta Workbench; Troubleshoot, Explain, the `@` picker, focus mode.

## Acceptance

- Every app's suite green; the live Workbench tried by hand on `local-dev` with the real
  assistant: Start → Confirm → the graph and progress move while the assistant answers a question
  → the assistant reacts to the end; a portal and a store switched from a drop-down; a persona
  added from the creator.
