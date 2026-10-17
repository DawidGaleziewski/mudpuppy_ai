# Contract: orchestrator allowlist

Agent file `apps/chat/agents/orchestrator.md` (moved from `.claude/agents/` in T016: it is the chat session's system prompt, not a Claude Code subagent, so shell sessions must not route work to it; `session-config.ts` reads its body and `tools`, and a test keeps `tools` equal to the fence allowlist). Allowed: the tools below, the `crawler` and `ba` subagents, read-only `pathfinder-ba` tools. Not allowed: Edit, Write, Bash, NotebookEdit, browser tools, the `pathfinder` write tools, any `.claude/`, `agents/`, config or code path. (Enforced in three layers, see research.md R2/R2b: SDK session options built from this file (`tools: ['Agent']`, `disallowedTools`, `settingSources: []`), the chat service's deny-by-default `session/request_permission` policy (`apps/chat/src/fence.ts`), and the MCP servers' safety gates. `pathfinder`/`pathfinder-ba` tools are allowed only inside a `crawler`/`ba` subagent call.)

MCP server `pathfinder-chat` tools (Zod inputs; every tool returns structured JSON or a coded error):

| Tool | Purpose |
| --- | --- |
| `workflow_state(portal?)` | Pure workflow state: steps with status, valid next moves, what is missing. |
| `list_process_candidates(portal, description)` | Candidate processes from Layer B and the state graph with their states. |
| `save_persona(portal, persona)` | Validate and write `personas/<portal>/<name>.yaml`; refuses inline secrets; `ref:` names only. |
| `save_test_data(portal, persona, values)` | Spec 032: merge test values (label → synthetic value) into an existing persona's `test_data`; refuses personal data and a persona that would not load. |
| `request_scan(portal, persona, env, resume_run_id?)` | Starts a scan after validating URL, persona and credential reference exist; hands off to the `crawler` subagent; refuses on gates. With `resume_run_id` (T041) it continues a stopped (`interrupted`) map run of that portal and persona (`RUN_NOT_RESUMABLE` otherwise) and links the step to it. The hand-off tells the crawler to drain the frontier (F-13). |
| `stop_scan(portal)` | Stops the portal's running run (T041): it becomes `interrupted`, recorded work stays; `NO_RUNNING_SCAN` when nothing runs. |
| `set_process_scope(...)` | Records scope after the BA confirmed in the UI list. |
| `request_documentation(portal, scope_id)` | Starts BA agent for the scope; returns step id. |
| `list_amendments(portal, target?, status?)` | Read amendments (with status, superseded reason and run) for the BA to discuss. Read only: the agent cannot reapply, dismiss or start a fresh run; the BA does that in the UI. |

Refusals: `HARNESS_CHANGE_REFUSED`, `GATE_REFUSED` (message passed through unchanged), `MISSING_INPUT` (lists the missing items).
