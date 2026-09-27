# Implementation Plan: Crawl Run Observability Trace

**Branch**: `feature/005-r17-crawl-run-observability-trace` | **Date**: 2026-09-27 (revised after
review) | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/005-crawl-run-observability-trace/spec.md`

## Summary

Three joined layers, all in the existing SQLite store, all viewable in the existing dashboard:

1. **Server spans** (`trace_spans`): a span tree per run, call → phase → event, written by a
   `Tracer` in `@pathfinder/core` and driven from `apps/crawler/packages/mcp-server`. One choke
   point wraps every tool call (`tools/index.ts` `tool()`), phases are timed inside `pipeline.ts`,
   and events come from the gates, the fingerprint index, the frontier, the request gate, the
   stabilizer and the block detector. Existing `decision_log` rows are linked to the span they
   happened in (one decorator around `ctx.decisions`), never duplicated. Context flows through
   `AsyncLocalStorage`; browser callbacks that fire outside it attach to the run's active call.
2. **Agent turns** (`agent_turns`): the crawler subagent's transcript, imported by a
   `SubagentStop` hook (matcher `crawler`) or by hand, joined exactly to spans by the tool-use id
   Claude Code sends in every MCP call's `_meta` (`claudecode/toolUseId`, verified in 2.1.283).
   Because the transcript stores thinking as signature only, `navigate`/`act`/`finish_run` require
   an agent-stated `rationale`.
3. **Browser traces**: a Playwright trace chunk per tool call (`tracing.startChunk`/`stopChunk`,
   phases as `tracing.group`), always on for non-production portals, opt-in per server process for
   production, stored under `data/traces/`, deleted with the portal, never exported.

The dashboard gets a `trace` tab on run detail (summary + call list, lazy-expanded span tree,
filters, "problems only") and a server-activity view for calls outside any run.

## Technical Context

Versions verified 2026-09-27 against the installed packages and Context7 docs (research §0).

**Language/Version**: TypeScript 6.0 strict on Node 22+ (`apps/crawler`); Python 3.13 via uv
(`apps/dashboard`); no new language

**Primary Dependencies**: no new runtime dependency. Uses `@modelcontextprotocol/sdk` 1.30.0
(`RequestHandlerExtra._meta`, `requestId`), Playwright 1.63 (`BrowserContext.tracing`
`start/startChunk/stopChunk/group/groupEnd`), `node:async_hooks` `AsyncLocalStorage`,
better-sqlite3 13 + Kysely 0.29, Zod 4.6, pino 10; dashboard FastAPI ≥ 0.141, Pydantic 2.13,
Jinja2, vendored htmx 4 + `hx-sse`

**Storage**: SQLite store; migration `0003_trace` adds `trace_boots`, `trace_spans`,
`agent_turns` (STRICT). Large payloads through the existing content-addressed `EvidenceStore`.
Playwright trace zips as plain files under `data/traces/<portal>/<run>/` (not evidence: unscrubbed,
large, access-restricted)

**Testing**: Vitest (pure units; fake-runtime MCP tests via the existing `tests/harness.ts`;
browser e2e on the existing `tests/mock-portal.ts`, skipped when `canLaunchBrowser()` is false);
golden-trace test with injected clock and id generator; pytest + `TestClient` for the dashboard
(drift test against migrations, query tests, perf test on a 20 000-span fixture)

**Target Platform**: unchanged (local Linux/WSL operator machine; MCP server over stdio)

**Project Type**: extension of `apps/crawler` and `apps/dashboard`; no new app or package

**Performance Goals**: SC-005 (500 calls / 20 000 spans: summary + first page < 1 s); SC-008
(< 10% added step time at default level, Playwright trace off)

**Constraints**: trace never changes crawl outcome (FR-014); everything scrubbed before storage
(FR-012); agent has no read/write access to the trace (no new agent tool)

**Scale/Scope**: ~150–400 spans per browser step at default level, up to ~20 000 per long run;
~40 instrumentation points listed in research §8

## Constitution Check

*GATE: checked before Phase 0 and again after Phase 1.*

| Principle / constraint | Status | How this plan complies |
| --- | --- | --- |
| I. Observed vs intent | Pass | Spans are mechanical facts. The agent `rationale` and imported agent text are stored and shown labelled "agent-stated", never as observed behaviour of the portal. |
| II. Evidence and traceability | Pass | Not semantic records; every span carries `run_id`, and large payloads go through the content-addressed evidence store. Decision spans link to `decision_log` ids. |
| III. Role separation | Pass | No new agent tool. `rationale` is informational: no gate reads it. Deterministic pieces stay non-overridable. Transcript import is operator tooling run by a hook, not an agent. |
| IV. Replay before promotion | N/A | Nothing is promoted. |
| V. Safety-first (NON-NEGOTIABLE) | Pass | No gate behaviour changes; instrumentation only observes. Spans and agent text are PII-scrubbed. Playwright traces (unscrubbed) are access-restricted: local only, off by default on production, deleted with the portal, excluded from export. Trace write failures cannot fail a step. |
| VI. Human-in-the-loop | N/A | — |
| VII. Deterministic core | Pass | URL shaping, span-tree assembly, transcript parsing, join and summary are pure functions with fixture tests; clock and ids injectable; golden trace (SC-007). |
| Storage: SQLite | Pass | Same store, no OTel collector or second store (research §1). |
| Schemas: Zod | Pass | `trace-span.ts`, `agent-turn.ts` Zod schemas; dashboard Pydantic read models under the drift test. |
| Agent interface: DB only via MCP | Pass | Agents never touch the trace. The importer is an operator script in `apps/crawler/scripts/` writing through core schemas, like `portal:export`. |
| App layout / Python read-only | Pass | Changes stay inside the two apps; the dashboard only reads (`mode=ro`). |

Post-design re-check: unchanged. See Complexity Tracking for the one deliberate scope line.

## Project Structure

### Documentation (this feature)

```text
specs/005-crawl-run-observability-trace/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── trace-spans.md        # Tracer API, span/event vocabulary, attrs per name, ordering, failure rules
│   ├── agent-import.md       # transcript parsing, join, idempotency, hook contract, CLI
│   ├── tool-rationale.md     # rationale field on navigate/act/finish_run
│   └── dashboard-routes.md   # trace tab, fragments, server-activity page
├── checklists/requirements.md
└── tasks.md
```

### Source Code

```text
data/migrations/0003_trace.{up,down}.sql            # [DB] trace_boots, trace_spans, agent_turns
data/schema/{schema.sql,README.md}                   # regenerated + trace conventions
.claude/settings.json                                # SubagentStop hook, matcher "crawler"
.claude/agents/crawler.md                            # rationale instruction (subagent-authoring lint)
.gitignore                                           # add data/traces/* (+ .gitkeep): unscrubbed zips must
                                                     # never be committable; not a DB/seed file (research §13)

apps/crawler/packages/core/src/
├── schemas/trace-span.ts, schemas/agent-turn.ts, schemas/index.ts
├── db-types.ts                                      # 3 tables
├── trace/tracer.ts                                  # Tracer: boot, spans, ALS context, buffer, flush, health
├── trace/url-shape.ts                               # pure: URL → {origin, route pattern, query keys}
├── trace/limits.ts                                  # inline cap, preview, payload offload
├── trace/transcript.ts                              # pure: JSONL → AgentTurn[]
├── trace/join.ts                                    # pure: turns × spans → matches, unmatched, run assignment
├── log.ts                                           # decisions decorator links decision → span
└── portal-data.ts                                   # partition: 3 tables + data/traces dir on delete

apps/crawler/packages/crawler/src/
├── request-gate.ts                                  # onRequestDecision callback (no trace types here)
├── stabilizer.ts                                    # in-flight request map; settle diagnostics on timeout
└── session.ts                                       # expose context for tracing; pass callbacks through

apps/crawler/packages/mcp-server/src/
├── context.ts, server.ts                            # ctx.tracer; boot row; sweep unfinished spans
├── tools/index.ts                                   # call span per tool, _meta, rationale, errors
├── runtime/pipeline.ts                              # phase spans + events (research §8)
├── runtime/browser-runtime.ts                       # request/robots/stop/note callbacks → events; PW chunks
├── runtime/run-state.ts                             # activeCallSpan, PW trace state
├── runtime/pw-trace.ts                              # enable rule, chunk start/stop, paths
└── services/{frontier,robots,start-run,complete-run}.ts  # events listed in research §8

apps/crawler/scripts/trace-import-agent.ts           # thin CLI; `pnpm trace:import-agent`
apps/crawler/package.json                            # script entry

apps/crawler/packages/core/tests/                    # tracer, url-shape, limits, transcript, join, partition
apps/crawler/packages/crawler/tests/                 # request-gate callback, stabilizer diagnostics
apps/crawler/packages/core/src/audit.ts             # PII audit covers trace_spans, agent_turns text columns
apps/crawler/packages/mcp-server/tests/
├── mock-portal.ts                                   # add: a never-settling polling page, a page that
│                                                    # requests a robots-disallowed subresource twice
├── trace-calls.test.ts                              # fake runtime: every tool → call span, _meta, errors, no-run calls
├── trace-map-run.test.ts                            # mock-portal e2e: phases sum, decisions linked, requests
├── trace-golden.test.ts                             # fixed clock/ids → identical span table (SC-007)
├── trace-failure.test.ts                            # DB write failure → crawl unaffected, health counted
└── agent-lockdown.test.ts                           # extend: rationale required; still no trace tool

apps/dashboard/src/pathfinder_dashboard/
├── models.py                                        # TraceBoot, TraceSpan, AgentTurn
├── queries.py                                       # trace_calls, span_children, trace_summary, server_activity
├── app.py                                           # routes per contracts/dashboard-routes.md
└── templates/{run_detail.html, activity.html, partials/trace_*.html}
apps/dashboard/tests/                                # drift, queries, routes, perf (20k spans)
```

**Structure Decision**: tracing primitives in `@pathfinder/core` (shared by the MCP server and the
import script, testable without a browser); browser-side hooks exposed as plain callbacks from
`@pathfinder/crawler` so that package stays trace-agnostic; all wiring in `mcp-server`. Owner
agents: migration → `db-admin`; dashboard templates/CSS → `frontend-dev`; agent file →
`subagent-authoring` lint.

## Note on migration numbering

`master` ends at `0002_portal_workspaces`; R-13's unmerged branch added `0003_ba_documentation`.
R-17 lands first (R-13 is paused until then), so it takes `0003_trace`; R-13 renumbers to `0004`
when it resumes. Also recorded in `roadmap.md` notes when this plan is committed.

## Complexity Tracking

| Scope line | Why | Rejected alternative |
| --- | --- | --- |
| Playwright traces stored unscrubbed | Their value is the raw page; scrubbing would destroy it. Principle V allows "scrubbed **or** access-restricted": local-only, production opt-in, deleted with portal, never exported. | Scrubbing DOM snapshots in zips: not feasible without rewriting Playwright's format. |
