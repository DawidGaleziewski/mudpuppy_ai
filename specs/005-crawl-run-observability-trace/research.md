# Research: Crawl Run Observability Trace

Revised 2026-09-27 after review. The first draft (tool-call rows + read-time merge with
`decision_log`) would have shown *that* a call happened but not *where its time went*, *which
decision belonged to which call*, *what the browser was doing*, or *why the agent chose it*. This
version fixes those gaps.

## §0. Verified versions and facts

| Item | Version / fact | How verified |
| --- | --- | --- |
| `@modelcontextprotocol/sdk` | 1.30.0. Tool callbacks get `extra: RequestHandlerExtra` with `requestId`, `sessionId?`, `_meta?`, `signal` | installed `dist/esm/shared/protocol.d.ts` lines 177–194; Context7 `/modelcontextprotocol/typescript-sdk` v1.x |
| Claude Code | 2.1.283. Sends `_meta` on MCP tool calls including `claudecode/toolUseId` (keys `claudecode/agentId`, `claudecode/agentType` also present in the client) | `claude --version`; strings in the installed binary show `{...mcpRequestMeta, "claudecode/toolUseId": id}` |
| Subagent transcripts | `~/.claude/projects/<slug>/<session>/subagents/agent-<id>.jsonl` + `.meta.json` (`agentType`, `toolUseId`). Assistant entries carry `message.model`, `message.usage`, content blocks `thinking` (**empty text, signature only**), `text`, `tool_use` (`id`, `name`, `input`); user entries carry `tool_result` (`tool_use_id`, `is_error`); every entry has `uuid`, `timestamp` | read a real crawler transcript from the 2026-09-25 liveinsurer run |
| Hooks | `SubagentStop` input: `session_id`, `agent_id`, `agent_type`, `agent_transcript_path`, `last_assistant_message`; matcher = agent type name (`crawler`). `PostToolUse` has `tool_use_id`, `duration_ms`, `agent_id` | Context7 `/llmstxt/code_claude_llms_txt` (hooks, sub-agents) |
| Playwright | 1.63. `context.tracing.start({screenshots, snapshots})`, `startChunk({title})`, `stopChunk({path})`, `group(name)`/`groupEnd()`; `npx playwright show-trace`, `npx playwright trace …` CLI | Context7 `/microsoft/playwright/v1.63.0` |
| Node | 22+: `AsyncLocalStorage` stable | constitution stack |
| Store libs | better-sqlite3 13, Kysely 0.29, Zod 4.6, pino 10 | `package.json` files |
| Dashboard | FastAPI ≥ 0.141, Pydantic 2.13, Python 3.13, htmx 4 + `hx-sse` vendored | `apps/dashboard/pyproject.toml`, `static/vendor/` |

## §1. Span model, not a flat log; no OpenTelemetry SDK

**Decision**: one `trace_spans` table shaped like OpenTelemetry spans (id, parent, kind, name,
status, start/end, attributes) with three kinds: `call` (one MCP tool call), `phase` (a timed stage
inside a call), `event` (an instant: a decision, request, verdict, error).

**Why**: "wtf is going on" needs *where the time went* and *which decision belongs to which call*.
A tree gives both; phase durations must add up to the call (SC-003), which catches missing
instrumentation mechanically.

**Rejected**: the OTel JS SDK + collector/Jaeger — a second store and infra (constitution: SQLite;
Postgres or another store needs justification), and no view that joins it to Pathfinder's own
records. Attribute names follow OTel conventions where natural (`http.request.method`,
`http.response.status_code`, `url.template`) so an exporter can be added later without a schema
change. Claude Code's own OTel telemetry is rejected for the same reason; the transcript (§12)
already carries per-turn tokens.

## §2. `decision_log` stays; spans link to it

**Decision**: `decision_log` is unchanged. `ctx.decisions` is wrapped once (`linkDecisions(decisions,
tracer)` in `core/src/log.ts`): after each `record()`, an `event` span `decision` is emitted under the
current span with `decision_id`, `kind`, `rule`. Every existing call site — including the
asynchronous ones in `browser-runtime.ts` (`onNote`, `onNavigationRefused`, `persistStop`) — is
linked without editing it.

**Why**: the first draft either duplicated each call site or guessed the owning call from
timestamps at read time (ms collisions, async callbacks). A link written at record time is exact.

## §3. Context propagation

**Decision**: `Tracer` holds an `AsyncLocalStorage<SpanContext>`. `tool()` runs the handler inside
`tracer.call(...)`; phases use `tracer.phase(name, fn)`; events use `tracer.event(name, attrs)` and
attach to the current span. Playwright callbacks (route handler, `response` listener, `onStop`)
run on Playwright's event loop, not inside the tool call's async chain, so they use
`tracer.eventForRun(runId, …)`, which attaches to the run's **active browser call** (`start_run`,
`navigate`, `act`). With no active call the event gets `parent_id = NULL` and `between_calls = 1`
(e.g. a page's background polling between steps).

Calls are **not** guaranteed sequential: an assistant message can carry several `tool_use` blocks
(seen in other agents' transcripts, 2–4 per message), and the server does not serialise
`navigate`/`act` per run. The tracer therefore keeps a per-run list of open browser calls; a
browser event attaches to the most recently started one, and when more than one is open it also
records `overlapping_calls: [span ids]` on the event and emits `event concurrent_calls` once per
overlap on each call involved. Overlap is a "problem" in the dashboard filter — two calls driving one
page at once is a crawler defect the trace should expose, not hide.

## §4. Ordering, ids, determinism

**Decision**: each server process writes a `trace_boots` row (UUIDv7 id, started_at, pid,
environment, trace level, Playwright-trace flag, server version). Every span gets `seq` from an
in-process counter, unique per `(boot_id, seq)`. Run order = `trace_boots.started_at`, then `seq`.
Clock (`now()`), monotonic timer and id generator are injected into `Tracer`; tests pass fixed ones.

**Why**: `max(seq)+1` from the DB (first draft) needs a read per write and races across async
writers; a counter is exact and free. Durations use `performance.now()` deltas (monotonic);
timestamps use the injected wall clock.

## §5. Write path and failure rules

- The `call` span row is inserted **at start** (`status = running`) so a crash leaves a visible
  unfinished call; everything under it is buffered and flushed with the call's final update in one
  transaction when the call ends. Between-calls events flush on a 1 s timer and at shutdown.
- On server start, spans still `running` from earlier boots become `unfinished` (same place as
  `interruptStaleRuns`).
- Any trace write error is caught, logged to pino, and counted per run; the counters are written
  as a `trace_health` event at each call end and at `finish_run`. A trace failure never throws into
  the pipeline (FR-014; `trace-failure.test.ts` breaks the table and asserts identical crawl rows).
- Writes go through Kysely inside a transaction; better-sqlite3 is synchronous, so a flush of a few
  hundred rows costs low milliseconds (SC-008 measured in the e2e test).

## §6. Payload limits

Inline `attrs_json` ≤ 8 KB after scrubbing. Larger (e.g. full `navigate` results with action lists,
network shapes) → `EvidenceStore.storeText(json, 'json')`, `payload_ref` set, a truncated preview
inline, `truncated` counted in health. Agent turn text ≤ 4 KB inline, same offload.

## §7. Scrubbing

`scrubTraceJson` for attributes and payloads, `maskText` for rationale, summaries and agent text
(the writer applies them; call sites cannot forget). The project's `scrubJson` masks **every** UUID
and sha256 as `[token]` (verified: `{"run_id": "<uuidv7>"}` → `{"run_id": "[token]"}`), which would
erase every run/action/state/frontier id from the trace. `scrubTraceJson`
(`core/src/trace/scrub.ts`) keeps a value only when its key is id-like (`id`, `*_id`, `*_ids`,
`evidence_ref`, `payload_ref`, `level1`, `matched`, `fingerprint`) **and** the value is exactly a UUID
or a hex hash (optionally `.ext`); sensitive keys (`session_id`, `token`, …) still win and are
redacted; everything else goes through `scrubJson` unchanged. Offloaded payloads use the same
scrubber through `EvidenceStore.storeJson(value, scrub)` (new optional argument; evidence is never
stored unscrubbed). Attribute names avoid the sensitive key `name`: accessible names are
`accessible_name`. URLs are never stored raw: `shapeUrl(url, templateFor)`
→ `{origin, route: rs.routeTemplateFor(url), query_keys: [...] }` (values dropped). Existing
`looksLikeRawPayload` guards request bodies.

## §8. Instrumentation points

| Where (file) | Span | Attributes / notes |
| --- | --- | --- |
| `tools/index.ts` `tool()` | `call` `<tool name>` | scrubbed args, result/error JSON, `tool_use_id`, `agent_id`, `agent_type` from `extra._meta`, `rationale`, MCP `requestId`, status `ok`/`refused` (`ACTION_REFUSED`)/`stopped` (`RUN_STOPPED`)/`error`; plus `event error` with code on any throw |
| `pipeline.ts` `beginStep` | `phase begin_step` | run status, budget usage (`steps_used`, elapsed, states) |
| `pipeline.ts` `navigate`/`act` `decide(...)` | `phase gate` + `event gate_decision` | input kind, url shape or action descriptor, `safety_class`, `allowed`, `rule`, `reason`, `policy_id` |
| `policy.checkItemCap` | `event item_cap` | route template, count, cap, verdict |
| `act` locator | `phase locate` + `event locator` | role, name, nth, match count, click outcome/timeout |
| `session.goto` | `phase goto` | url shape, HTTP status, ms |
| `session.settle` | `phase settle` + `event stabilization_timeout` on timeout | result; at timeout: in-flight request shapes, ms since last DOM mutation, running animations (§9) |
| `observePage` | `phase observe` | title (masked), snapshot size, form count |
| `recorder.drain` | `phase net_drain` | calls, console errors count |
| `computeFingerprint` + `index.assign` | `phase fingerprint` + `event fingerprint_assign` | route template, `level1` fingerprint (the `level2` MinHash array is not stored: size, and it is recomputable from the state's evidence), decision kind, matched fingerprint, similarity, threshold, cluster |
| `recordState` | `phase record_state` + `event state_recorded` | state id, created (new vs existing), evidence ref |
| `recordForm` / `recordTransition` / `recordApiCall` | `phase record_*` | ids, counts, refusals |
| action extraction + `enqueueActions` | `phase enqueue_frontier` + `event frontier_enqueue` / `frontier_skip` per item | action descriptor, safety class, priority, depth, skip rule |
| `getNextFrontierItem` | `event frontier_pick` | chosen id, priority, depth, pending count, or `empty`/`budget_exhausted` |
| `bumpRun`, `settleFrontierItem`, `completeRun` | `phase run_bookkeeping` / `event run_status` | new counters / status |
| `start_run` (`startRunRecord`, `openSession`) | phases `preflight` (config + env guard + compliance, the `pre` check), `resume_check`, `robots_fetch` (`loadBaseRobots`), `insert_run`, `open_session`, `restore_index` | config snapshot hash, preflight code/reasons, robots policy per host, restored state count, browser launch error. The call span starts with `run_id NULL` and gets the run id once `insert_run` (or the resume lookup) knows it; a preflight refusal stays run-less (FR-016) |
| request gate (`crawler/src/request-gate.ts`) new `onRequestDecision` callback | `event request` (notable) / `request_aggregate` (per call) | method, resource type, url shape, main-frame, decision `continue`/`abort`/`fulfill`, reason, robots rule, limiter wait ms, status, redirect target shape |
| request gate robots notes | `event robots_check` every occurrence | rule, action `blocked`/`allowed`; the dedupe in `notePageRequest` stays for `decision_log` only |
| `response` listener → `detectBlock` | `event block_verdict` when blocked | signature id, status, url shape; followed by `event run_stop` |
| rate limiter `acquire` | `limiter_wait` summed per call; individual event when wait > 1 s or halted | ms, halted |
| `ctx.decisions.record` (decorator, §2) | `event decision` | `decision_id`, kind, rule |
| `packages/obstacles` events | `event obstacle` via `recordObstacles` | id, selector, via — no live call site yet (plan Complexity Tracking) |

The crawler package gets **callbacks only** (`onRequestDecision`, settle diagnostics) so it keeps
no dependency on the trace schema.

## §9. Stabilizer diagnostics

`trackNetworkActivity` keeps a map of in-flight requests (url + resource type + start time) instead
of a counter only; `settle()` returns `{ result, diagnostics? }` via a new `settleWithDiagnostics`
(the existing `settle` keeps its signature for current callers). On timeout: in-flight requests
(shaped URLs, age), `sinceMutation`, `runningAnimations`, last successful check time.

## §10. Request detail levels

Default (`PATHFINDER_TRACE_LEVEL=standard`): individual `request` events for main-frame
navigations, aborted/refused, redirects, status ≥ 400, failed, limiter wait > 1 s, and those in
flight at a stabilization timeout; everything else aggregated per call (count by resource type ×
decision, total limiter wait, bytes if known). `verbose`: every request. `off`: calls and phases
only. The level is recorded on `trace_boots`.

## §11. Agent rationale

`navigate`, `act`, `finish_run` input schemas gain `rationale: z.string().trim().min(1).max(300)`
(required). Stored on the call span, masked, shown as "agent-stated". No gate, service or
recorded record reads it. `.claude/agents/crawler.md` procedure gains one line ("every navigate/act/
finish_run carries a one-sentence rationale: what you expect to learn"). `agent-lockdown.test.ts`
confirms the tool list is unchanged and the field is required.

## §12. Transcript import and join

- Script `apps/crawler/scripts/trace-import-agent.ts` (`pnpm trace:import-agent`), logic in
  `core/src/trace/transcript.ts` + `join.ts` (pure, fixture-tested with a trimmed real transcript).
- Inputs: `--hook` (reads the `SubagentStop` JSON on stdin, uses `agent_transcript_path`,
  `agent_id`), or `--transcript <path>`, or `--agent-id <id>` (globbed under
  `~/.claude/projects/*/*/subagents/`).
- Store selection: the hook does not know the environment, so the importer looks up the
  transcript's `tool_use` ids in `trace_spans` of every `data/db/*.sqlite` and writes to each store
  that has matches; none → report "no matching run" and exit 0.
- Rows: one per content block (`text`, `tool_use`, `tool_result`, `thinking` recorded as present /
  empty). **Each block is its own transcript entry** (`apiBlockIndex`), and every entry of one API
  message (`message.id`) repeats `message.usage`, with `output_tokens` growing as the message
  streams (seen: 8 → 8 → 185). Tokens are therefore stored once per API message, on the row of its
  highest `apiBlockIndex`, taking `output_tokens` as the maximum over that message's entries;
  summing per entry would multiply input and cache tokens by the block count.
  Key `(agent_id, message_uuid, block_index)` unique → re-import is an upsert (idempotent).
- Run assignment: a turn gets the `run_id` of the nearest following matched call in the same
  transcript, else the nearest preceding one.
- Flags: `tool_use` of `mcp__pathfinder__*` with no span → "never reached server"; a call span
  with an `agent_id` whose transcript is imported but no matching `tool_use` → "no agent turn".
- Hook: `.claude/settings.json` `SubagentStop`, matcher `crawler`, command
  `pnpm --silent --dir apps/crawler trace:import-agent --hook`; always exits 0 so it never blocks
  the session; logs to stderr.

## §13. Playwright browser traces

- Enabled when the portal's environment is not `production`, or when the server process has
  `PATHFINDER_PW_TRACE=1` (recorded on `trace_boots`). Started in `openSession`
  (`tracing.start({screenshots: true, snapshots: true})`), one chunk per browser-touching call
  (`startChunk({title: "<tool> <span id>"})` / `stopChunk({path})`), each phase wrapped in
  `tracing.group(phase)`. Path `data/traces/<portal>/<run_id>/<boot seq>-<tool>.zip`, stored on the
  call span as `pw_trace_path`.
- Chunks bound the crash loss to the in-flight call and make "open this step" exact.
- Access restriction (Principle V): local files only; `portal:delete` removes
  `data/traces/<portal>/`; `portal:export` skips it; `.gitignore` gains `data/traces/*` with a
  `.gitkeep` (not a DB or seed file, so CLAUDE.md's gitignore rule does not apply; unscrubbed live
  content must never be committable).
- Viewing: the dashboard shows a copyable `npx playwright show-trace <path>` and the path; it does
  not serve the zip (keeps the dashboard read-only over the store and avoids a file-serving route).

## §14. Dashboard

- `trace` tab on run detail: summary strip (time per phase, counts by status, slowest 5 calls,
  tokens, health), then the call list (one row per call: seq, tool, rationale, status, duration,
  agent tokens), each row expanding via `hx-get` to its children — the list never loads 20 000
  spans at once (SC-005).
- Filters: kind, name, status, "problems only" (errors, refusals, stops, unfinished,
  stabilization timeouts, calls slower than the run's p95, unmatched agent calls).
- Agent context inline: turn text before the call, tokens, unmatched flags.
- `/activity`: calls with no run (FR-016), newest first, per environment.
- Indexes: `(run_id, parent_id, boot_id, seq)` and `(tool_use_id)`.

## §15. Migration numbering

`0003_trace` on `master`; R-13's unmerged `0003_ba_documentation` becomes `0004` when R-13 resumes.

## §16. Obstacles

`recordObstacles(tracer, runId, events)` ships with fixture tests; wiring `registerObstacleHandlers`
into live sessions stays with R-07 T059.
