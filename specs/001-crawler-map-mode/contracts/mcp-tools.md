# Contract: MCP Server Tools (Crawler `map` Mode)

The crawler is the Claude Code subagent `.claude/agents/crawler.md`. Its tool allowlist is
exactly the tools below, exposed by the `pathfinder` MCP server (`@modelcontextprotocol/sdk`,
stdio, registered in the repo's `.mcp.json`), so agent-facing tool names are
`mcp__pathfinder__<tool>`. The subagent has NO Bash, file-editing, web or other browser tools:
the MCP server process owns the only Playwright instance, the DB and the evidence store. The
agent never writes raw SQL, invents ids, chooses selectors or URLs outside the scope checks,
or records facts by hand.

Every tool validates its input and output against the Zod schemas in `packages/core`, matching
`data-model.md`. Principle II and V are enforced inside the tools, not by prompt instructions.

## Design rule: the agent proposes, the server observes and records

The agent decides *where to go next*. The server decides what is safe, executes it, waits for
the page to settle, observes it, fingerprints it, and records it. State, transition, form and
API-call records are therefore written only by the server from what it observed; the agent has
no tool to write them, so it cannot fabricate an `observed` fact. The agent can act only on
`action_id`s the server itself extracted from the current page and classified.

## Agent-facing tools

### `start_run`

- **Input**: `{ portal_id: string, persona_id: string, resume_run_id?: string }`
- **Behavior**: loads and validates config, runs the environment guard and the FR-026
  compliance/placeholder-User-Agent checks (FR-005) BEFORE any
  browser launch or request, computes `effectiveMaxActionClass`, creates the run row and
  `config_snapshot` (or resumes `resume_run_id` from persisted frontier/visited state,
  FR-020), launches the browser with the persona's viewport/locale, applies obstacle handlers
  and the request gate.
- **Output**: `{ run_id, resumed: boolean, effective_max_action_class, budgets: {…remaining} }`
- **Errors**: `ENV_GUARD_REFUSED` (production without the explicit flag, missing
  `compliance` values, or a placeholder User-Agent contact — completes in <5s,
  nothing opened), `CONFIG_INVALID` (names the file and problem, FR-017), `PORTAL_NOT_FOUND`,
  `RUN_NOT_RESUMABLE`

### `get_known_states`

Read-only. Avoids re-exploring and lets the agent choose where to go.

- **Input**: `{ run_id: string, cluster_id?: string }`
- **Output**: `{ states: Array<{ id, cluster_id, route_template, title }> }`
- **Errors**: `RUN_NOT_FOUND`

### `get_next_frontier_item`

The server owns the frontier queue (priority, trap detection, caps), so the agent does not need
to hold it in context.

- **Input**: `{ run_id: string }`
- **Output**: `{ item: { frontier_id, state_id, action_id, description } | null, reason?: "empty" | "budget_exhausted" }`
- **Errors**: `RUN_STOPPED`

### `navigate`

- **Input**: `{ run_id: string, url: string }`
- **Behavior**: URL classification, scope and denylist checks (FR-007), including denylisted
  path patterns such as logout; if refused, no request is made, a frontier
  item and decision-log entry naming the rule are written, and the call returns a refusal.
  Otherwise: rate-limited request through the request gate, obstacle handling, stabilizer,
  observer, fingerprint, PII scrubbing, and the server records the state, any forms, and the
  observed API calls, with evidence and confidence.
- **Output**: `{ state_id, created: boolean, cluster_id, title, route_template, forms: number, actions: Array<{ action_id, role, accessible_name, safety_class, allowed: boolean, skip_reason? }> }`
- **Errors**: `ACTION_REFUSED` (with `rule`), `RUN_STOPPED`

### `act`

- **Input**: `{ run_id: string, action_id: string }`
- **Behavior**: `action_id` MUST be one the server issued for the current state (else
  `UNKNOWN_ACTION`). The server re-derives `safety_class` with the `safety` package and checks
  scope, denylist, the effective ceiling and budgets. If not allowed it does NOT execute; it
  writes a frontier item (`skipped_unsafe | out_of_scope | denylisted | budget_reached`) and a
  decision-log entry, and returns `ACTION_REFUSED`. If allowed it executes, stabilizes,
  observes, fingerprints, and records the transition (with ranked locators, FR-013) and any
  resulting state and API calls.
- **Output**: same shape as `navigate`, plus `{ edge_id }`
- **Errors**: `UNKNOWN_ACTION`, `ACTION_REFUSED`, `RUN_STOPPED`

### `add_open_question`

- **Input**: `{ run_id, text: string, about_ref: string }`
- **Output**: `{ open_question_id: string }`
- **Errors**: `SCHEMA_INVALID`, `RUN_STOPPED`

### `add_rule_candidate`

- **Input**: `{ run_id, text: string, about_ref: string }`
- **Behavior**: `about_ref` must reference a state, edge or form of this run; the server copies
  that record's `evidence_ref` and forces `confidence: "inferred"`. Business intent is NOT a
  rule candidate: it goes in `add_open_question`.
- **Output**: `{ rule_candidate_id: string }`
- **Errors**: `SCHEMA_INVALID`, `UNKNOWN_REF`, `RUN_STOPPED`

### `finish_run`

- **Input**: `{ run_id, summary?: string }`
- **Behavior**: requests completion; the server verifies the frontier is empty or a budget is
  exhausted, then computes and stores `coverage` (FR-021) and sets the status. The agent cannot
  set `status` or `warning` itself.
- **Output**: `{ run_id, status, coverage: object }`
- **Errors**: `FRONTIER_NOT_EMPTY`

## Run-stopped rule (applies to every agent-facing tool)

If the block detector fires (CAPTCHA, block page, 403/429 patterns — FR-008), the server
records a run-level warning, sets status `stopped_warning`, halts the rate limiter, and every
subsequent call to any browser-touching tool returns `RUN_STOPPED` without making a request
(SC-007). The same applies when a step, time, state or depth budget is exhausted. There is no
tool or parameter the agent can use to resume past a block.

## Server-internal recording services (NOT agent-facing)

These implement `data-model.md` writes and are called only by `navigate`/`act`/`finish_run`.
Their validation rules are the concrete enforcement of Principles II and V and are unit-tested
directly.

- **`record_state`** — `{ run_id, fingerprint, cluster_id, route_template, title, evidence_ref, confidence }`.
  Idempotent by fingerprint (`created: false` if it exists). Errors: `MISSING_EVIDENCE`,
  `INVALID_CONFIDENCE`, `SCHEMA_INVALID`.
- **`record_transition`** — `{ run_id, from_state, to_state | null, action: { role, accessible_name, locators: Array<{ kind: "role"|"label"|"text"|"test_id"|"container", value, rank }> }, safety_class, status: "executed"|"skipped", evidence_ref, confidence, error? }`.
  Re-derives `safety_class` with the `safety` package and rejects a mismatch. Errors:
  `MISSING_EVIDENCE`, `UNSAFE_ACTION_EXECUTED` (status `executed` with `safety_class != "read"`
  on a production run — hard reject; last line of defense behind the action gate), `SCHEMA_INVALID`.
- **`record_form`** — `{ run_id, state_id, fields: FieldSchema[], evidence_ref, confidence }`. Errors:
  `MISSING_EVIDENCE`, `SCHEMA_INVALID`.
- **`record_api_call`** — `{ run_id, edge_id?, method, url_template, status, req_schema, res_schema, console_errors? }`.
  Errors: `SCHEMA_INVALID`, `PII_SUSPECTED` (shape scrubber flags a likely raw payload field —
  reject rather than silently store, FR-012/FR-014).
- **`add_frontier_item`** — `{ run_id, state_id, action, safety_class, status: "skipped_unsafe"|"out_of_scope"|"denylisted"|"budget_reached"|"unreachable", reason }`.
- **`complete_run`** — computes `coverage` and sets status; invoked by `finish_run`, budget
  exhaustion, or the block handler.

## Cross-cutting rules

- All tools are stateless request/response calls (run state lives in the DB); none accept or
  return raw SQL.
- Ids are always server-generated (uuid); no tool accepts a client-chosen id for a new row.
- The agent's tool allowlist contains only the agent-facing tools above. A test asserts
  `.claude/agents/crawler.md` lists no other tool (no Bash, Edit, Write, WebFetch, WebSearch,
  or any other MCP server).
- Every write path enforces `confidence` + `evidence_ref` in the tool implementation, in
  `packages/mcp-server`, not by agent discipline (Principle II).
- The checks "outside the agent's control" (Principle III/V) hold because the agent has no path
  to the browser, network or DB except through these tools: even if prompted to claim a
  mutating action is read-only, the server re-derives the class before executing.
