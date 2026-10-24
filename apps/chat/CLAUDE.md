# @mudpuppy/chat

Chat orchestrator service (R-30): talks to an ACP agent (Claude Code login of the user) and exposes HTTP + SSE to the dashboard's Chat page; starts its own `mudpuppy` MCP servers (with Chromium) per conversation.

Layer: servers (G-07; `apps/crawler/layers.json`). Depends on config, core, chat-model, docs, docs-model,
store, vault, workflow.

## Public API
- HTTP + SSE API (127.0.0.1:4310); used by apps/dashboard. `api` wires the routes of each
  resource (`api-*`) in order; the first that answers wins.
- MCP chat server (`mcp-chat`): `workflow_state`, `save_persona`, `save_test_data`, `request_scan`, `stop_scan`, `list_process_candidates`, `set_process_scope`, `request_documentation`, `list_amendments`, `propose_change` (`mcp-workflow-tools`); `page_context`, `highlight_element`, `open_page`, `request_credential` (`mcp-page-tools`); `list_grouping_inputs`, `suggest_grouping` (`mcp-process-tools`); the model tools (`mcp-model-tools`).

## Modules
- `acp-client` (ACP session lifecycle), `service` (orchestrator core), `session-config`
  (prompt, tools, MCP servers), `step-recorder` (workflow steps follow the recorded work).
- Amendments, proposals, BA processes, probe suites, marks, check runs, the portal model's
  decisions: one service module and one `api-*` routes module each.
- **What each module does, by spec: `LAYOUT.md`.** Read it before changing a route or tool.

## Evals
- `evals/` (spec 038, R-78 (5)): the grouping eval, `pnpm --dir apps/chat eval <portal>`: the
  assistant cuts a crawler-eval store's scans into processes (orchestrator prompt, only the two
  grouping tools), graded against the ground truth; results in `data/evals/grouping-<portal>/`.
  Its unit tests (`evals/tests/`) run with `pnpm test`. See `evals/README.md`.
- `evals/workbench/` (spec 043): 40 golden Workbench prompts, `pnpm eval:workbench --replay
  <outcomes.json>` (no model) or `--live` (paid: only when the owner asks).

## Invariants
- No hardcoded secrets; vault manages credentials.
- Errors get `ERR-…` references in logs.
- Chat schemas will move to `@mudpuppy/chat-model` (G-10).
- `fence` is the agent's permission control: only the tools a session lists.
- A Workbench conversation (spec 043) writes only through command cards a person confirms; its
  fence starts the crawler only with a confirmed command's prompt (`workbench-session`). Commands
  run only on the environments in `MUDPUPPY_WORKBENCH_COMMAND_ENVS` (default `local-dev,sandbox`,
  spec 048).
- A live Workbench conversation (spec 075) never starts the crawler itself: a confirmed scan runs
  in the `scan-runner`, whose fence allows only that confirmed start.

## Where to add things
- New HTTP route: a `<resource>Routes(req, res, method, path, deps)` in its `api-*` file, listed
  in `api`'s route table; a new MCP tool: the `register*Tools` of its group. Add a line to
  `LAYOUT.md`.

## Tests
- `pnpm --dir apps/chat test` (typecheck, lint, test before commit); it leaves out `*.e2e.test.ts`.
- `pnpm --dir apps/chat test:e2e`: browser end-to-end files (real dashboard via `uv run` + Chromium
  on one temp store, e.g. `proposals-browser.e2e.test.ts`, FE-A04); before committing a change to
  proposals, the drawer or the dashboard's chat pages, and in the close-out.

## See also
- `LAYOUT.md`; specs/010-acp-chat-orchestrator, specs/011-portal-onboarding
- docs/code-guidelines.md (G-10)
