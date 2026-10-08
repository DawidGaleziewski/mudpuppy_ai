# @pathfinder/chat

Chat orchestrator service (R-30): talks to an ACP agent (Claude Code login of the user) and exposes HTTP + SSE to the dashboard's Chat page; starts its own `pathfinder` MCP servers (with Chromium) per conversation.

Layer: servers (G-07; `apps/crawler/layers.json`). Depends on config, core, chat-model, docs,
store, vault, workflow.

## Public API
- HTTP + SSE API (127.0.0.1:4310); used by apps/dashboard.
- MCP chat server: `workflow_state`, `save_persona`, `request_scan`, `list_process_candidates`, `set_process_scope`, `request_documentation`, `list_amendments`.

## Modules
- `acp-client`: ACP session lifecycle.
- `api`: HTTP endpoints and SSE.
- `service`: orchestrator core logic.
- `mcp-chat`: MCP chat tool definitions.
- `session-config`: session setup (prompt, tools, MCP servers).
- `step-recorder`: workflow step recording.
- `amendments`: amendment handling; used with `supersede`.
- `portals`, `personas`, `credentials`: portal/user data.
- `scan`, `scope`: process scanning and scope management.
- `fence`: permission control.

## Invariants
- No hardcoded secrets; vault manages credentials.
- Errors get `ERR-…` references in logs.
- Chat schemas will move to `@pathfinder/chat-model` (G-10).

## Tests
- `pnpm --dir apps/chat test` (typecheck, lint, test before commit).

## See also
- specs/010-acp-chat-orchestrator, specs/011-portal-onboarding
- docs/code-guidelines.md (G-10)
