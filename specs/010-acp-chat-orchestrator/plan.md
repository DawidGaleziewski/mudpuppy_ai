# Implementation Plan: Guided Chat Orchestrator (R-30)

**Branch**: `feature/010-r30-acp-chat-orchestrator` | **Date**: 2026-10-05 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/010-acp-chat-orchestrator/spec.md`

## Summary

A dashboard chat that fronts one restricted `orchestrator` agent. Architecture:

1. A new TypeScript app `apps/chat` (`@pathfinder/chat`, pnpm workspaces, self-contained manifest, lint, type and test config) is the **ACP client**. It starts a Claude Code ACP agent process running the `orchestrator` agent, relays the BA's messages, and turns ACP session updates (message chunks, tool calls, plans, permission requests) into chat events. Client: `@agentclientprotocol/sdk` over stdio; agent: `@agentclientprotocol/claude-agent-acp`, with the orchestrator built in `session/new` `_meta.claudeCode.options` (system prompt from `orchestrator.md`, isolated settings, `Agent` as the only built-in tool, `crawler`/`ba` as programmatic subagents; research.md R2, corrected in T012).
2. The Python dashboard (`apps/dashboard`) stays read-only on the SQLite store. It renders the chat window, step tracker, state checklist and animation, reads conversation/step rows read-only, and sends commands and receives live events (SSE) through the chat service's local HTTP API. Same pattern as `docs:review` (R-15): the TypeScript side validates and writes.
3. A pure shared package `packages/workflow` (`@pathfinder/workflow`) derives the workflow state of a portal (which steps are to do / pending / in progress / done / failed, which next moves are valid) from recorded data passed in as plain input, and also decides amendment impact after a fresh run (see 8). Deterministic code, not the model, decides what is valid (Principles IV, VII).
4. A new MCP server `pathfinder-chat` gives the orchestrator its allowlist: `workflow_state`, `list_processes_candidates`, `save_persona` (Zod-validated YAML write into `personas/`), `request_scan`, `set_process_scope`, `request_documentation`, `list_amendments`. The orchestrator also gets the `crawler` and `ba` subagents and the read tools of `pathfinder-ba`; it gets no Edit/Write/Bash tools. The fence is enforced by the agent definition tool allowlist plus the ACP permission handler in the client, which denies anything outside the allowlist.
5. Credentials never enter model context: the dashboard shows a credentials form that posts to the chat service, which calls the existing vault package (R-26). The chat only receives "credentials stored for persona X".
6. Errors: every failure gets a reference id (`ERR-<ULID>`); detail goes to `data/logs/chat/<date>.jsonl` (one JSON line per error, 30-day retention, outside git); the chat shows message + id.
7. New tables (migration through `db-admin`): conversations, messages, workflow steps, process scopes, amendments. Amendments are separate from Layer B facts and appear in a distinct export section (`docs:export` extended).
8. Amendments vs fresh runs: when a BA-started run finishes, the chat service feeds the amendments and the run's observed states and elements to the pure `amendmentImpact` function; affected amendments become `superseded` (reason, run, time, kept) and show in a "Superseded amendments" dashboard view where the BA re-applies or dismisses them. The to-be export chapter holds only active amendments; superseded and dismissed ones go to `appendix-superseded-amendments.md` and `records.json` with status. A state counts as changed when the run saw the same route template with a different fingerprint; an element when its role or accessible name is gone or different (exact matching rule: to verify against the recorded layout and wireframe data in T011).

## Technical Context

**Language/Version**: TypeScript strict on Node 22+ (chat service, workflow package, MCP server); Python 3.12 with uv (dashboard views only, as today)

**Primary Dependencies**: `@agentclientprotocol/sdk` 1.7.x (ACP client) and `@agentclientprotocol/claude-agent-acp` 0.86.x (agent process, bin `claude-agent-acp`; pin a version past pnpm's minimum release age) — confirmed in T001; `@modelcontextprotocol/sdk` (existing); Zod; pino; Node `node:http` for the local API (as `reference-portal`; no new framework); FastAPI + Jinja + htmx + SSE (existing dashboard)

**Storage**: existing SQLite store (new tables via migration), evidence files under `data/evidence/` (amendment attachments, sha256 names), `data/logs/chat/*.jsonl` for error detail

**Testing**: Vitest (workflow state, fence, log writer, ACP client against a fake ACP agent), pytest (dashboard views and drift test for new tables), scripted end-to-end run against the reference portal with a stub agent; one manual run with the real agent

**Target Platform**: local developer machine (Linux/WSL), single BA at a time, no auth

**Project Type**: web application: Python dashboard + TypeScript local service

**Performance Goals**: chat events visible in the browser within 1 s of the agent emitting them; tracker reflects step changes within 2 s

**Constraints**: dashboard never writes the store directly; no credential in logs, chat history or model context; the constitution's safety rules apply unchanged to chat actions (since 4.0.0, spec 011: each environment's limit, read-only by default per scan); no new top-level apps outside `apps/`

**Scale/Scope**: one BA, a few portals, conversations of hundreds of messages

## Constitution Check

| Principle | Result |
| --- | --- |
| I Observed vs intent | Amendments are stored apart from observed records and labelled to-be; orchestrator writes no Layer B facts itself (BA agent does). Pass. |
| II Evidence | No semantic record is created by the chat. Amendments reference a state/evidence/wireframe element. Pass. |
| III Role separation | Orchestrator does not browse or write BA records; it delegates to `crawler` and `ba`. It does not become a fourth role that duplicates duties. Pass. |
| IV Replay verification | Not touched. Pass. |
| V Safety | All scans go through the existing `pathfinder` server and its gates; the orchestrator cannot call browser tools. Pass. |
| VI Human in the loop | Review stays in the Docs tab (`docs:review`). Amendments are human-authored. Pass. |
| VII Deterministic core | Workflow state is a pure package with fixtures. Pass. |
| Python constraints | Dashboard opens the store read-only; writes go through the TypeScript chat service with Zod and migrations. Python not on the crawler runtime path. Pass. |
| Governance | The wording "the dashboard MAY record human review decisions only by invoking the TypeScript review command" is read as covering chat-service commands: **accepted, to be confirmed by testing** (T002 records it; T014 and T037 add the tests that the dashboard process still opens the store read-only and writes only via `apps/chat`). Revisit with a MINOR amendment only if testing shows a gap. **T037 result: confirmed.** `apps/dashboard/tests/test_readonly.py::test_connect_is_read_only` (existing) proves the dashboard connection rejects INSERT/UPDATE/DELETE/CREATE; `test_chat_writes_only_via_service` checks the dashboard code has no SQL write to any chat table and that the chat routes only call the service over HTTP; every chat write path in `apps/chat` parses rows with the core Zod schemas (`store.ts`, `steps.ts`, `scope.ts`, `amendments.ts`; `supersede.ts` updates status columns only). No amendment needed. |
| App layout | "Every app lives in its own `apps/<name>/`, self-contained, no language manifest at the repo root." `apps/chat` is self-contained; shared `packages/workflow` follows CLAUDE.md. Risk: `apps/chat` must use packages from the `apps/crawler` workspace (core, vault, docs) and `packages/workflow`, and a root `pnpm-workspace.yaml` could be read as a root manifest. Resolved 2026-10-05: the user accepted one root `pnpm-workspace.yaml` (workspace config, not a language manifest); T003 (governor) adds it. T002 reading (research.md R10): the root file is workspace config, not a language manifest; the single root `pnpm-lock.yaml` is allowed by constitution amendment 2.1.0 (user decision 2026-10-05); the proving ground keeps its own workspace and lockfile. Pass. |

Post-design re-check: same result. T002 and T003 were the open points; both are done (T003 root workspace, T037 confirmed the T002 reading).

## Project Structure

### Documentation (this feature)

```text
specs/010-acp-chat-orchestrator/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── chat-http-api.md
│   └── orchestrator-tools.md
├── checklists/requirements.md
└── tasks.md
```

### Source Code (repository root)

```text
packages/workflow/                     # shared, pure: workflow state, valid next moves, amendment impact (Vitest)
apps/chat/                             # own app: ACP client, fence, local HTTP/SSE API, error log, pathfinder-chat MCP server
├── package.json, tsconfig.json, eslint and vitest config
├── src/acp-client.ts
├── src/fence.ts
├── src/session-config.ts              # session/new request: orchestrator prompt, SDK options, MCP servers (research R2)
├── runtime/                           # empty session cwd (no settings read: settingSources [])
├── src/error-log.ts
├── src/api.ts
├── src/mcp-chat.ts                    # entry for the pathfinder-chat MCP server
└── tests/
apps/crawler/packages/core/            # migration + Zod schemas for new tables (via db-admin)
apps/crawler/packages/docs/            # export: amendments chapter and superseded appendix
apps/dashboard/src/.../chat/           # views, templates, SSE proxy, static JS, read models
apps/dashboard/static/img/mudpuppy-working.gif   # copied from user_input
apps/chat/agents/orchestrator.md       # chat system prompt + allowlist (not a Claude Code subagent; T016)
.claude/skills/create-persona/         # persona creation skill
data/logs/chat/                        # runtime only, gitignored
data/migrations/                       # next free number
docs/glossary/glossary.yaml            # new terms
```

**Structure Decision**: new app `apps/chat`, new shared package `packages/workflow`, pnpm workspaces; existing `apps/crawler` packages (core, vault, docs) are reused; the dashboard gets a chat area and a Superseded amendments view.

## ACP details (confirmed in T001, corrected in T012)

Package names, versions, the stdio connection, session/prompt/update types, permission requests and subagent event lineage (`_meta.claudeCode.parentToolUseId`) are confirmed in research.md R1, R2 and R2b. The installed adapter (0.85.1) has no agent switch; it forwards `_meta.claudeCode.options` to the Claude Agent SDK, so `session-config.ts` builds the orchestrator there (research.md R2, "Corrected in T012"). The fence has three layers: SDK tool options and isolated settings, the client permission policy `fence.ts` (subagent calls judged by their parent `crawler`/`ba` call), and the MCP servers' own safety gates. MCP servers are passed in `session/new`.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
| --- | --- | --- |
| Local HTTP service beside the dashboard | Keeps Python read-only and keeps long-lived ACP sessions out of the Python process | Writing chat state from Python breaks the storage rule |
