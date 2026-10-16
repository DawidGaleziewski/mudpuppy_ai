# @pathfinder/chat

Chat orchestrator service for Pathfinder (roadmap item R-30, `specs/010-acp-chat-orchestrator/`).
It runs the dashboard chat's assistant as an ACP session, keeps the workflow steps true to the
recorded work, and serves a local HTTP + SSE API that the dashboard calls server-side.

## Run

```
pnpm install                     # at the repo root, once
PATHFINDER_ENV=sandbox pnpm --dir apps/chat start   # http://127.0.0.1:4310; the environment is required
```

| Env                         | Default                          | Meaning                                                         |
| --------------------------- | -------------------------------- | --------------------------------------------------------------- |
| `PATHFINDER_ENV`            | `sandbox`                        | Which store (`data/db/<env>.sqlite`) the chat and its tools use |
| `PATHFINDER_CHAT_PORT`      | `4310`                           | Port, bound to 127.0.0.1 only                                   |
| `PATHFINDER_VAULT_KEY_FILE` | `~/.config/pathfinder/vault.key` | Vault key for the credentials form (see `pnpm vault`)           |

The assistant runs through `@agentclientprotocol/claude-agent-acp` and uses your Claude Code login.
The dashboard finds the service with `PATHFINDER_CHAT_URL` (default `http://127.0.0.1:4310`).

## How it fits together

- `src/session-config.ts` builds the orchestrator session: prompt and tool list from
  `agents/orchestrator.md`, the `crawler` and `ba` subagents from `.claude/agents/`, isolated
  settings, and the `pathfinder`, `pathfinder-ba` and `pathfinder-chat` MCP servers.
- `src/fence.ts` answers every permission request: deny by default, harness changes refused.
- `src/mcp-chat.ts` (`pnpm --dir apps/chat mcp`): the orchestrator's own tools
  (`workflow_state`, `save_persona`, `request_scan`, `list_process_candidates`,
  `set_process_scope`, `request_documentation`, `list_amendments`).
- `src/step-recorder.ts` moves workflow steps on from runs and analysis sessions, every 2 s and
  after each event; `src/supersede.ts` supersedes amendments after a chat-started run.
- Errors get an `ERR-…` reference; details in `data/logs/chat/<date>.jsonl` (30 days, no secrets).
  Look one up with `GET /errors/<ref>`.

## Checks

```
pnpm typecheck && pnpm lint && pnpm test
```

Tests use an in-process fake ACP agent (`tests/fake-agent.ts`) and an in-memory store; no model
is called.
