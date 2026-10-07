# Research: Guided Chat Orchestrator

Status: decisions below come from the clarification session. ACP library facts were confirmed by T001 on 2026-10-05 (R1, R2, R2b); the few API calls still checked against installed types are named in R2.

## R1 Transport

- Decision: ACP; chat service (TypeScript) is the ACP client, Claude Code ACP adapter is the agent.
- Rationale: user decision; gives per-tool-call events, plans (usable for the step tracker) and permission requests (usable for the fence).
- Alternatives: Agent SDK from Python (less control), headless CLI stream-json (coarsest).
- Confirmed (T001, 2026-10-05, Context7 `/agentclientprotocol/agent-client-protocol`, `/agentclientprotocol/claude-agent-acp`, npm registry):
  - Client library: `@agentclientprotocol/sdk` 1.7.0 (official TypeScript SDK, both sides). The client registers typed handlers via `client()` / `ClientSideConnection` and talks to the agent over stdio with `ndJsonStream(output, input)` built from the child process's stdin/stdout.
  - Agent: `@agentclientprotocol/claude-agent-acp` 0.86.0, bin `claude-agent-acp`, built on the Claude Agent SDK (exports `ClaudeAcpAgent`, `SettingsManager`). Published 2026-10-05: pnpm's `minimumReleaseAge` will hold it back; pin the newest version past the age window instead of adding an exclusion.
  - Flow: `initialize` (protocolVersion 1, client capabilities; we advertise no `fs` write and no `terminal`) → `session/new` (`cwd` absolute, `mcpServers[]`, optional `_meta`) → `session/prompt` (content blocks) → stream of `session/update` notifications: `agent_message_chunk`, `plan`, `tool_call`, `tool_call_update`, `usage_update` → reply `stopReason` (`end_turn`, `cancelled`, …). `session/cancel` aborts; pending permission requests then resolve `cancelled`. `loadSession` restores a session by id (usable for FR on reload/restart).
  - Permissions: the agent sends `session/request_permission` with the `toolCall` and options (`allow_once`, `reject_once`, …); the client answers `{ outcome: { outcome: "selected", optionId } }`. This is the client-side fence hook (`fence.ts`).
  - Event types map to chat events: message chunks → chat text, `plan` → step tracker hints (display only; `packages/workflow` stays the source of truth), `tool_call`/`tool_call_update` → activity rows and the animation.
- Local HTTP API: Node `node:http` (already used by `reference-portal`); no new framework.

## R2 Orchestrator agent selection

- Decision: `.claude/agents/orchestrator.md` with tool allowlist (no Edit, Write, Bash, no browser tools); the client also denies any permission request outside the allowlist.
- Confirmed (T001): the adapter discovers custom main-thread agents from `.claude/agents/` and settings (`discoverCustomAgents`), keeps `agents` and `currentAgent` per session and exposes the choice as the session config option with id `agent` (`AGENT_CONFIG_ID`). The chat service sets that option to `orchestrator` right after `session/new` and refuses to prompt if `currentAgent` is not `orchestrator`. Permission rules come from Claude settings files (`permissions.defaultMode`, rules) loaded per `settingSources`.
- Fence, three layers: (1) the agent definition's `tools` allowlist; (2) the client's `session/request_permission` handler rejects any tool not on the allowlist and logs it with an `ERR-` id; (3) the session `cwd` is a dedicated directory `apps/chat/runtime/` whose `.claude/settings.json` sets `defaultMode: deny` with allow rules for the allowlisted tools only, so a missed permission prompt cannot write anywhere.
- Still checked at implementation (T012/T013), against the installed package's type definitions, not guessed: the exact config-option call to switch agent and whether `_meta` on `session/new` can carry allowed/disallowed tools. If agent switching fails, fallback stays: the dedicated `cwd` whose `.claude/agents/` holds only the orchestrator definition.
- **Corrected in T012 (supersedes the two bullets above).** The installed adapter is 0.85.1 (pnpm's minimum release age held back 0.86.0). Its source (`dist/acp-agent.js`, newSession) shows: no `agent` config option and no `currentAgent`; it deletes an `agent` key from the options on purpose ("main-thread agent selection is intentionally not part of this adapter's ACP contract"). Instead it spreads `_meta.claudeCode.options` into the Claude Agent SDK `query()` options, after its own defaults. So the chat service builds the orchestrator itself in `session/new`:
  - `systemPrompt`: the body of `apps/chat/agents/orchestrator.md` (string, replaces the Claude Code preset; moved out of `.claude/agents/` in T016 so shell sessions never delegate to it);
  - `settingSources: []` (SDK isolation: no user/project settings, CLAUDE.md, hooks or skills leak in);
  - `tools: ['Agent']` (the only built-in tool; MCP tools come from `mcpServers`);
  - `disallowedTools`: Bash, Edit, Write, MultiEdit, NotebookEdit, WebFetch, WebSearch, Skill;
  - `agents`: `crawler` and `ba` as programmatic `AgentDefinition`s (description, prompt, tools) read from their `.claude/agents/*.md` files, so they stay the single source; skills listed in their frontmatter (`ba-practice`) are appended to the prompt, because `settingSources: []` turns off skill discovery. The `ba` Read guard hook is not loaded either; `fence.ts` enforces the same rule (Read only under `.claude/skills/ba-practice/references/`);
  - `allowDangerouslySkipPermissions: false`; ACP `mcpServers` carries `pathfinder`, `pathfinder-ba`, `pathfinder-chat` (stdio).
  - `pathfinder-chat` is NOT added to the repo `.mcp.json` (T016 deviation): it needs a conversation id (`PATHFINDER_CHAT_CONVERSATION`) and writes chat rows, so it only makes sense inside a chat session; the chat service passes it per session.
  - The adapter always installs its own `canUseTool`, which sends `session/request_permission` to the client; permission requests carry `_meta.claudeCode.toolName`/`parentToolUseId` when an MCP server or a subagent is involved, and the preceding `tool_call` update carries the tool name otherwise. The client keeps a toolCallId → tool/parent map (`acp-client.ts`).
  - Fence layers are now: (1) SDK `tools`/`disallowedTools`/`settingSources` in the session options; (2) `fence.ts` deny-by-default permission policy; (3) MCP servers' own safety gates (unchanged). The `apps/chat/runtime/.claude/settings.json` layer is dropped: with `settingSources: []` no settings file is read.

## R2b How `request_scan` runs the crawler and ba agents

- Decision: as subagents of the orchestrator session (Agent/Task tool calls). Confirmed (T001): the adapter forwards nested subagent output as structured updates linked to the spawning call by `_meta.claudeCode.parentToolUseId`, and keeps the turn open until spawned background tasks finish. So T022 can show crawler/ba progress from the same event stream.
- Fallback (if subagent tool restrictions or run length make this unworkable): the chat service starts a second ACP session for the crawler/ba agent and relays its events; `request_scan` then only enqueues the run.
- Consequence for the fence: subagent tool calls also arrive as permission requests. The handler allows a `pathfinder` / `pathfinder-ba` tool only when its `parentToolUseId` points at a `crawler` or `ba` subagent call; everything else is judged against the orchestrator allowlist. Because the session `cwd` is `apps/chat/runtime/`, the chat service passes the `pathfinder`, `pathfinder-ba` and `pathfinder-chat` MCP servers explicitly in `session/new` `mcpServers` rather than relying on the repo `.mcp.json`.

## R3 Where the ACP client lives

- Decision: TypeScript, own app `apps/chat` (user decision), because chat writes need Zod and migrations (Constitution: Python must not write the DB except via the same schemas; dashboard read-only). Dashboard talks to it over a local HTTP API and SSE. Pure shared logic is `packages/workflow`.
- Alternatives: Python ACP client in the dashboard (rejected: write path), package inside `apps/crawler` (rejected by the user).
- Risk: `apps/chat` reuses core, vault and docs from the `apps/crawler` workspace; settled: one root `pnpm-workspace.yaml` is accepted by the user (2026-10-05), added in T003.

## R4 Workflow state

- Decision: pure function over recorded data (runs, states, sessions, records, scopes) returning step statuses and valid next moves. The agent reads it through `workflow_state` and may not invent state.
- Steps (phase 1): scan, map, narrow process, document, amend. Statuses: to do, pending, in progress, done, failed.

## R5 Credentials

- Decision: dashboard form posts to chat service, which uses the R-26 vault; chat gets a confirmation only. Personas are YAML written by the `save_persona` tool after Zod validation; secrets by `ref:` name only.

## R6 Errors and logs

- Decision: reference id `ERR-<ULID>`; `data/logs/chat/YYYY-MM-DD.jsonl`; 30-day sweep on service start; never log credentials (redaction test with fake values).

## R7 Process candidates

- Decision: candidates come from existing Layer B `process` records and from the state graph (clusters and edges). The agent proposes from these; the BA picks start/end from the state list. No new crawling.

## R8 Amendments

- Decision: separate tables; target = state, evidence item or wireframe element id; attachments in the content-addressed evidence store; export gets its own chapter and a section in `records.json`; as-is chapters byte-identical with or without amendments.

## R8b Amendments and fresh runs

- Decision (user): a fresh run may override amendments; the BA decides when to run one. Affected amendments are marked superseded (kept with reason, run, time), shown in "Superseded amendments", re-applied or dismissed by the BA. Export: not in the to-be chapter; listed in `appendix-superseded-amendments.md` and `records.json` with status (chosen over omitting them, so the consuming agent sees what was dropped).
- Change detection is by route template plus fingerprint (state) and role plus accessible name (element); wireframe element ids are not assumed stable.
- Confirmed in T011 (from `fingerprint/src/fingerprint.ts` and `core/src/element-key.ts`): the level-1 fingerprint hashes the route template plus the canonical ARIA tree including accessible names, so any rename, added or removed element yields a new fingerprint (a new `states` row under the same route template). Element keys are `role "name"` (`#n` for repeats) and are also the wireframe shape ids. Final rule in `packages/workflow/src/amendments.ts`:
  1. Route template not observed by the run: active.
  2. Anchor fingerprint observed: page unchanged except masked volatile text; supersede only if the targeted element is gone or renamed (`element_changed`/`element_removed`).
  3. Route template observed under other fingerprints only: superseded (FR-021 a). The reason is refined from the element: `element_removed` (no candidate has it), `element_changed` (same role at the same role position, new name), otherwise `state_replaced`.
  - An element counts as present when its key matches, or its role and name match under another `#n` suffix. States without a layout never prove an element change. With several candidate states, `successorStateId` is null and the BA picks the target when re-applying.
  - `anchor_element` JSON = `{ key, role, name, roleIndex }` (`roleIndex`: position among same-role elements on the anchor state), captured when the amendment is written (T030).
  - Known limit (open question for the user): listing/detail templates (`/product/:id`) hold many fingerprints. An amendment on product A is superseded by a run that sees only product B under the same template. Rule 1 only protects runs that never touch the template.
- Alternatives: delete on change (loses BA work), keep valid silently (misleading), element ids only (not stable across runs).

## R9 Animation

- Decision: copy the supplied gif into the dashboard static folder; shown while any step is in progress.

## R10 Constitution

- Decision (user): dashboard-to-service commands are covered by the `docs:review` precedent for now: accepted, to be confirmed by testing (T002). MINOR amendment only if tests show a gap.
- Reading recorded in T002 (constitution 2.0.0, Technical Constraints):
  - **Dashboard writes.** The text allows the dashboard to record review decisions "only by invoking the TypeScript review command (`docs:review`)". The chat service is a long-running TypeScript process rather than a one-shot command, so this is a broader reading: what the rule protects is that Python never writes, every write is Zod-validated in TypeScript through the same schemas, and the dashboard process opens the store `mode=ro`. `apps/chat` keeps all three. The confirming tests are T014 (dashboard connection stays read-only while chat runs) and T037 (every chat write path goes through `apps/chat` Zod schemas). If either fails or a reviewer reads the rule literally, draft a MINOR amendment (2.1.0) naming "TypeScript services such as `apps/chat`" next to `docs:review`.
  - **Root workspace file.** "The repo root holds no language manifest (`package.json`, `pyproject.toml`, …)". A root `pnpm-workspace.yaml` (user-approved 2026-10-05) is read as workspace configuration, not a language manifest, as long as there is no root `package.json` with dependencies or scripts.
  - **Own lockfile per app.** The same rule says every app has its own manifest and lockfile. A single shared root `pnpm-lock.yaml` would break that. T003 tried pnpm `sharedWorkspaceLockfile: false`: it made one lockfile per package (14), which fits neither reading, so it was reverted. User decision 2026-10-05: one root `pnpm-lock.yaml`, with constitution amendment 2.1.0 (App layout bullet: one root pnpm workspace and lockfile for TypeScript apps and `packages/*`; isolated apps such as the proving ground keep their own; Python keeps `uv.lock`).
  - **Agents and DB.** "Agents access the DB only through the MCP server" holds: the orchestrator reaches data only through `pathfinder-chat` / `pathfinder-ba` MCP tools.
- No amendment was made in T002; the lockfile point led to amendment 2.1.0 during T003.
