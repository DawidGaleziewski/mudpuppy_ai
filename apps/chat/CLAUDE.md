# @pathfinder/chat

Chat orchestrator service (R-30): talks to an ACP agent (Claude Code login of the user) and exposes HTTP + SSE to the dashboard's Chat page; starts its own `pathfinder` MCP servers (with Chromium) per conversation.

Layer: servers (G-07; `apps/crawler/layers.json`). Depends on config, core, chat-model, docs, docs-model,
store, vault, workflow.

## Public API
- HTTP + SSE API (127.0.0.1:4310); used by apps/dashboard.
- MCP chat server: `workflow_state`, `save_persona`, `save_test_data`, `request_scan`, `stop_scan`, `list_process_candidates`, `set_process_scope`, `request_documentation`, `list_amendments`; spec 022: `page_context`, `highlight_element`, `open_page`, `request_credential` (mcp-page-tools), `propose_change`, `list_grouping_inputs`, `suggest_grouping` (mcp-process-tools).

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
- BA processes (spec 022 M5, contracts/processes-api.md): `process-steps` (pure step rules),
  `process-bodies` (request schemas), `process-store` (loads, the revision write with base check),
  `process-service` (create, rename/stage, branch, drafts, save, rebase, restore, live, change
  spec), `process-suggestions` (the assistant's groupings: suggest, accept, dismiss),
  `api-processes` (routes), `mcp-process-tools` (`list_grouping_inputs`, `suggest_grouping`).
- `portals`, `personas`, `credentials`: portal/user data. `test-data` (`save_test_data`, spec 032:
  merge test values into an existing persona's `test_data`).
- Probe suites (spec 032 US3): `probe-suites` (approve: kept variants, changed expectations, the
  trace written into `portals/<p>/traces.yaml` with comments kept; dismiss) and
  `api-probe-suites` (`POST /portals/{p}/probe-suites/{id}/approve|dismiss`). Probe marks
  (US5): `marks` and `api-marks` (`POST|DELETE /portals/{p}/marks`); `request_scan`
  `probe_marked` starts a probe scan. Spec 034 (R-66): all six mark kinds on their targets
  (`MARK_TARGETS`); `request_scan` `run_type` + `plan` (continue, focused, recheck, retry) with
  `scan-directed.ts` (the checks and the crawler brief: reach each start point with `go_to_state`).
- Differing states (spec 033 US4): `reconciliations` and `api-reconciliations`
  (`POST /portals/{p}/reconciliations/{id}/confirm`: the owner's verdicts from Review).
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
