# @pathfinder/chat

Chat orchestrator service (R-30): talks to an ACP agent (Claude Code login of the user) and exposes HTTP + SSE to the dashboard's Chat page; starts its own `pathfinder` MCP servers (with Chromium) per conversation.

Layer: servers (G-07; `apps/crawler/layers.json`). Depends on config, core, chat-model, docs,
store, vault, workflow.

## Public API
- HTTP + SSE API (127.0.0.1:4310); used by apps/dashboard.
- MCP chat server: `workflow_state`, `save_persona`, `request_scan`, `stop_scan`, `list_process_candidates`, `set_process_scope`, `request_documentation`, `list_amendments`; spec 022: `page_context`, `highlight_element`, `open_page`, `request_credential` (mcp-page-tools), `propose_change`.

## Modules
- `acp-client`: ACP session lifecycle.
- `api`: HTTP endpoints and SSE.
- `service`: orchestrator core logic.
- `mcp-chat`: MCP chat tool definitions.
- `session-config`: session setup (prompt, tools, MCP servers).
- `step-recorder`: workflow step recording.
- `amendments`: amendment commands (create, withdraw, re-anchor, dismiss, edit, restore);
  `amendment-revisions`: the one write path (every change is a row in `amendment_revisions`, a
  stale `base_rev` answers 409 `STALE_REVISION`); `api-amendments`: their HTTP routes;
  `reanchor`: after a scan, carries amendments forward or flags them for re-anchoring (spec 022).
- `http-io`, `http-error`: JSON in/out and the HTTP error with machine-readable extras.
- `page-context`: the message's page context and the line the agent gets; `ui-actions`: completed
  browser tools → `ui_action` events (a credential request is also kept in the history);
  `mcp-page-tools`: the page tools.
- `proposals` (propose_change writes an open `chat_proposals` row), `proposal-service`
  (apply / discard / undo through the amendment write path), `api-proposals` (their routes).
- `portals`, `personas`, `credentials`: portal/user data.
- `scan`, `scope`: process scanning and scope management.
- `fence`: permission control.

## Invariants
- No hardcoded secrets; vault manages credentials.
- Errors get `ERR-…` references in logs.
- Chat schemas will move to `@pathfinder/chat-model` (G-10).

## Tests
- `pnpm --dir apps/chat test` (typecheck, lint, test before commit); it leaves out `*.e2e.test.ts`.
- `pnpm --dir apps/chat test:e2e`: browser end-to-end files (real dashboard via `uv run` + Chromium
  on one temp store, e.g. `proposals-browser.e2e.test.ts`, FE-A04); before committing a change to
  proposals, the drawer or the dashboard's chat pages, and in the close-out.

## See also
- specs/010-acp-chat-orchestrator, specs/011-portal-onboarding
- docs/code-guidelines.md (G-10)
