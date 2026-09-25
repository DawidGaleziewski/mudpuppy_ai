# Contract: BA MCP Server (`pathfinder-ba`)

A second server from `@pathfinder/mcp-server` (entry `src/ba-main.ts`), stdio, no browser runtime.
Registered in `.mcp.json` as `pathfinder-ba`; the `ba` agent's `tools:` lists exactly the tools below
as `mcp__pathfinder-ba__<name>`. The crawler server exposes none of them and this server exposes no
crawler tool (lockdown test on both lists).

Results and errors follow spec 001's shape: success → `structuredContent` JSON; failure →
`isError` with `{ error: { code, message, ...details } }`. Inputs are Zod-validated; any id the
agent passes must come from an earlier result. No tool accepts a `status`, `key`, `id` for a new
row, or `run_id` on an evidence link (the server resolves it).

## Read tools

| Tool | Input | Output |
|---|---|---|
| `list_runs` | `portal_id` | runs of the portal: id, mode, persona, status, warning, started/ended, counts (states, edges, forms, network calls, actions, open questions, rule candidates), process name for trace runs |
| `get_run_evidence` | `run_id`, `kind` (`states, edges, actions, forms, network_calls, open_questions, rule_candidates, decisions`), `cursor?`, `limit?` (≤ 200) | page of Layer A records of that kind for the run, with ids, confidence and a compact summary (e.g. state: title, route template, cluster; form: fields; network call: method, url template, status, shapes) |
| `get_evidence` | `target_kind`, `target_id` | the full Layer A record, plus the content of its evidence file (masked ARIA snapshot / shape JSON) when it has one, truncated to 60 kB with a flag |
| `list_processes` | `portal_id` | trace processes: id, run, name, goal, persona, outcome, step count, boundary action |
| `get_process` | `process_id` | process + ordered steps (intent, kind, action role/name, value, states before/after with titles, network calls, outcomes, evidence ref) |
| `list_records` | `portal_id`, `kind?`, `status?`, `include_withdrawn?` | keys, titles, kind, latest/confirmed rev, status of latest, confidence, not_observable |
| `get_record` | `key` (+ `portal_id`) | record + all revisions (content, confidence, evidence links, relations, change note, status) + reviews |
| `get_pending_feedback` | `portal_id` | reviews (reject, comment) and confirmations since the portal's previous completed session, with the revision they target; follow-up tasks that changed status |

## Session tools

| Tool | Input | Effect / output |
|---|---|---|
| `start_session` | `portal_id`, `run_ids[]` (≥ 1, all of the portal), `resume_session_id?` | creates `analysis_sessions` + `analysis_session_runs`, or resumes an `interrupted` one (may add runs). Returns session id and the pending-feedback summary |
| `record_pass` | `session_id`, `pass` (`inventory, capabilities, processes, rules, data, nfr, synthesis`), `summary` | appends to `passes_json` |
| `finish_session` | `session_id`, `summary`, `gaps[]` | `completed`; refused with `SESSION_INCOMPLETE` unless `synthesis` was recorded |

## Write tools

| Tool | Input | Effect |
|---|---|---|
| `create_record` | `session_id`, `kind`, `content` (per-kind schema), `confidence`, `not_observable?`, `evidence[]` (`{target_kind, target_id, run_id?, note?}` — `run_id` only to pick the observation run for a `state`), `relations[]` (`{type, to_key}`) | allocates key, revision 1 `draft`; returns `{ key, rev_no }` |
| `revise_record` | `session_id`, `key`, `base_rev` (must equal latest), `content`, `confidence`, `not_observable?`, `evidence[]`, `relations[]`, `change_note`, `responds_to_review?` | new revision `draft`, status engine applied; returns `{ key, rev_no }` |
| `withdraw_record` | `session_id`, `key`, `base_rev`, `change_note`, `evidence[]` | revision with `change = withdraw` (content copied), record `withdrawn = 1` |
| `address_crawler_question` | `session_id`, `open_question_id`, `by_key` | sets the crawler `open_questions` row `addressed`; `by_key`'s latest revision must cite it |

`followup` and `open_question` records are created with `create_record` (kind `followup` also
creates its `followup_tasks` row with status `open`).

## Errors

Spec 001 codes where they apply (`SCHEMA_INVALID`, `UNKNOWN_REF`, `MISSING_EVIDENCE`,
`INVALID_CONFIDENCE`, `PII_SUSPECTED`, `RUN_NOT_FOUND`) plus:

| Code | When |
|---|---|
| `SESSION_NOT_ACTIVE` | session unknown, completed, or interrupted and not resumed |
| `SESSION_INCOMPLETE` | `finish_session` before a `synthesis` pass |
| `RUN_NOT_IN_SESSION` | evidence from a run not listed in the session (details: `run_id`) |
| `PORTAL_MISMATCH` | run, evidence or record belongs to another portal |
| `RECORD_NOT_FOUND` | unknown `key` / `to_key` |
| `STALE_REVISION` | `base_rev` is not the latest (details: `latest_rev`) |
| `RELATION_NOT_ALLOWED` | (from kind, type, to kind) not in the allowed table |
| `NOT_OBSERVABLE_NEEDS_QUESTION` | `not_observable` without an open question link or relation |

`MISSING_EVIDENCE`: empty `evidence[]`. `INVALID_CONFIDENCE`: `observed` without an observed Layer A
target (details: which targets were checked). Prose fields are PII-scrubbed; if scrubbing would
change them the write is refused with `PII_SUSPECTED`.
