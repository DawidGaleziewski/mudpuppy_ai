# ADR-0012: A chat service orchestrates Claude Code agents over ACP on the user's login

- **Status:** Accepted
- **Date:** 2026-10-05 (spec 010, R-30)

## Context

Until R-30 a person drove the crawler and BA agents by typing requests into a Claude Code session.
BAs needed a guided flow in the dashboard (scan → map a process → narrow → document → amend).
The dashboard is Python and read-only ([ADR-0007](0007-read-only-dashboard-writes-through-typescript.md)),
while chat writes need Zod and the migrations.

## Decision

- A TypeScript app, `apps/chat`, is an **ACP client** (`@agentclientprotocol/sdk` over stdio).
  The agent is the Claude Code ACP adapter (`claude-agent-acp`), which runs on the **user's Claude
  Code login**.
- The chat service builds one restricted `orchestrator` per session in `session/new`: the system
  prompt from `apps/chat/agents/orchestrator.md`, isolated settings (`settingSources: []`),
  `Agent` as the only built-in tool, Bash/Edit/Write/Web tools disallowed, and the `crawler` and
  `ba` agents as programmatic subagents read from their `.claude/agents/*.md` files.
- A deny-by-default permission handler (`fence.ts`) allows only the tools a session lists; the MCP
  servers' own safety gates stay in force.
- Per conversation it starts its own `mudpuppy` MCP servers (with Chromium) and a
  `mudpuppy-chat` server whose tools (`workflow_state`, `request_scan`, `save_persona`, …) are the
  orchestrator's allowlist. The workflow state is a pure function over recorded data
  (`packages/workflow`); the agent may not invent it.
- The dashboard talks to it over a local HTTP + SSE API (127.0.0.1:4310). Errors get `ERR-<ULID>`
  references backed by local JSON-line logs. Credentials go from a form to the vault; the chat only
  hears "credentials stored".
- R-96 (2026-10-22) confirmed: the agent stays behind ACP on the CLI login and agent-neutral; no
  Claude Agent SDK.

## Consequences

- Good: no API key is needed (the owner: no API key at work), and the agent can be swapped for
  another ACP agent.
- Good: ACP gives per-tool-call events, plans and permission requests, used for the progress feed
  and the fence.
- Bad: the adapter's contract differs from its documentation (no agent switching; corrected in
  T012), so the service builds the orchestrator itself.
- Bad: MCP servers and Chromium can outlive the service; after running it, check for orphaned
  `mudpuppy` servers and Chromium processes (`CLAUDE.md`).
- Bad: a scan run inside the assistant's turn blocked it for the whole scan (spec 043 F-19); the
  live Workbench moved scans to a background runner
  ([ADR-0024](0024-live-workbench-a2ui-and-ag-ui-over-websockets.md)).

## Alternatives considered

- Claude Agent SDK from Python: less control.
- Headless CLI with `stream-json`: the coarsest events.
- A Python ACP client inside the dashboard: rejected, it would put a write path in Python.
- A package inside `apps/crawler`: rejected by the user.

## Sources

- `specs/010-acp-chat-orchestrator/research.md` R1–R6, R10; `plan.md` (2026-10-05)
- `apps/chat/CLAUDE.md`; `CLAUDE.md` (Running the apps)
- `CHANGELOG.md` R-30/R-31 entry
- `roadmap.md` R-96 (ACP, agent-neutral)
