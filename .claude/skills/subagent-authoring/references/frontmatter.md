# Subagent frontmatter reference

Verified against https://code.claude.com/docs/en/sub-agents on 2026-09-21. Re-check when the Claude
Code version differs materially; several fields carry minimum versions. Only `name` and `description`
are required. The markdown body is the system prompt.

| Field | Notes and gotchas |
| --- | --- |
| `name` | Lowercase letters and hyphens. No `:` (reserved for plugin-scoped ids). Hooks see it as `agent_type`. Keep equal to the filename stem. |
| `description` | Router text; see design-principles §3. Combined budget across agents: 15,000 tokens. |
| `tools` | Allowlist. Omitted = inherit everything available to subagents (including MCP). `Agent(x, y)` type-restriction only applies to an agent run as the main thread (`claude --agent`); in a subagent it is ignored. Restricted list without `Skill` = agent cannot invoke skills. |
| `disallowedTools` | Subtracts from the inherited/specified set. Entries with specifiers (e.g. `Bash(git push *)`) remove the whole tool. Accepts MCP patterns like `mcp__server__*`. |
| `model` | `sonnet`, `opus`, `haiku`, `fable`, a full model id, or `inherit`. Omitted → env var → parent model. |
| `permissionMode` | `default`, `acceptEdits`, `auto`, `dontAsk`, `bypassPermissions`, `plan`, `manual`. Ignored for plugin agents. |
| `maxTurns` | Stops with a partial, resumable result. v2.1.246+. |
| `skills` | Preloads **full** skill content at startup. Missing/disabled skills are skipped with a warning. Skills with `disable-model-invocation: true` can't be preloaded. Without this field the agent can still invoke skills on demand via the Skill tool. |
| `mcpServers` | Names of configured servers or inline definitions scoped to the run. Ignored for plugin agents. |
| `hooks` | Scoped to the agent's lifetime. Project-level agent hooks need workspace trust. Ignored for plugin agents. |
| `memory` | `user` / `project` / `local`. Needs auto memory enabled. Auto-enables Read/Write/Edit. |
| `background` | `true` keeps the agent in the background. |
| `omitClaudeMd` | Skip user/project/local CLAUDE.md (managed policy still loads). v2.1.271+. |
| `effort` | `low`, `medium`, `high`, `xhigh`, `max`. |
| `isolation` | `worktree` = run in a temporary git worktree copy. |
| `color` | Display colour in the task list. Cosmetic. |
| `initialPrompt` | Only when the agent runs as the main session agent. |
| `experimental` | e.g. `cacheTtl: 5m | 1h` (v2.1.248+). |

## What a non-fork subagent starts with

System prompt (body + environment details, *not* the Claude Code system prompt), the delegation
message, CLAUDE.md hierarchy (except built-in Explore/Plan, or `omitClaudeMd`), a git-status
snapshot, and full text of any `skills:`. It does **not** get conversation history, output style, or
the parent's auto memory. If a rule must reach it, it has to be in CLAUDE.md, the body, or the
delegation message.

## Delegation and limits

- Delegation is decided from the description plus the task; @-mention (`@agent-<name>`) forces one;
  `claude --agent <name>` or the `agent` setting runs a whole session as it.
- Nesting depth default 3 (v2.1.219+); `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH` changes it.
- Concurrent subagents default 20 (`CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS`).
- Scope/precedence: project agents in `.claude/agents/`, user agents in `~/.claude/agents/`, plugin
  agents namespaced `plugin:name`. Check into version control to share.
