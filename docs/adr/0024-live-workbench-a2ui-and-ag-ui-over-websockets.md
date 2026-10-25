# ADR-0024: The live Workbench: A2UI views and AG-UI shared state over WebSockets

- **Status:** Accepted
- **Date:** 2026-10-22 (owner decisions, R-96); spike built in spec 075 (v2.9.0, 2026-10-24)

## Context

In the beta Workbench (spec 043) the assistant composes the screen. After a person confirmed a
scan, the assistant ran the crawler inside its own turn and waited about 30 minutes: nothing live
appeared and it could not answer meanwhile (spec 043 F-19). The owner, 2026-10-22: "I would have
actual interactive ui that is synced with harnesses agents. They should update the UI live while
they work … I want react … I want to use market standards so A2UI should be there. With shared
state between the agent and the ui"; transport: "i want web sockets".

## Decision

- **A2UI** (Google, Apache 2.0) for what the agent shows, drawn by the official `@a2ui/react`
  renderer with **our own components** as its catalogue.
- **AG-UI** event types as the vocabulary for shared state (`STATE_SNAPSHOT`, `STATE_DELTA` as
  JSON Patch). A state projector turns store changes into deltas; the model binds components to
  state paths and never writes counts or routes.
- **WebSockets** on the dashboard, with our own reconnect (sequence numbers and replay), a 15 s
  heartbeat and an origin check.
- The agent stays **behind ACP on the CLI login**, agent-neutral
  ([ADR-0012](0012-chat-service-orchestrates-claude-code-agents-over-acp.md)). The chat service
  bridges ACP events to the protocol.
- The crawler and BA run **in the background**, so the agent's turn never blocks. Scan milestones
  (started, stopped, failed, finished) reach the agent as events. A live conversation never starts
  the crawler itself: a confirmed scan runs in the `scan-runner`, whose fence allows only that
  confirmed start.
- A2UI is loaded only on the live Workbench page.

## Consequences

- Good: the assistant answers while the crawler works, and the screen follows the scan live.
- Bad: without a kit we give up maintained plumbing (state merging, reconnect edge cases,
  following new A2UI and AG-UI versions) and a ready chat UI; we follow the specs ourselves and pin
  versions. A2UI was a v1.0 Candidate at the time.
- The spike used placeholder components; the designer's look came later (spec 079).

## Alternatives considered

- CopilotKit: rejected (the owner: "isnt it more paid and closed? I want to create my own
  components"; its useful extras are paid).
- The Claude Agent SDK and the `@ag-ui/claude-agent-sdk` adapter: rejected, to stay agent-neutral
  without an API key.
- SSE instead of WebSockets.
- The htmx Workbench as designed (ADR-WB-1 option A, spec 043).

## Sources

- `roadmap.md` R-96 (owner decisions 2026-10-22)
- `specs/075-r96-workbench-live-spike/spec.md` (Why, FR-001 …)
- `specs/043-r92-workbench-genui/spec.md`, `findings.md` F-19
- `apps/chat/CLAUDE.md` (Invariants: live Workbench and `scan-runner`)
- `CHANGELOG.md` R-96 live Workbench spike (v2.9.0), spec 079 entry
