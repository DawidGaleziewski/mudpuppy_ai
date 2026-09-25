# Implementation Plan: BA Documentation

**Branch**: `feature/004-r13-ba-documentation` | **Date**: 2026-09-26 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/004-ba-documentation/spec.md`

## Summary

Adds Layer B, the BA deliverable, and the pieces around it, delivered as four roadmap items:

- **R-13**: SQLite tables for analysis sessions and living documentation records (stable keys,
  immutable revisions, evidence links resolved to runs, typed relations, reviews, follow-up
  status); a pure `@pathfinder/docs` package (status engine, observed rule, evidence resolution,
  audit); a browserless `pathfinder-ba` MCP server; the `ba` subagent with a `ba-practice` skill
  derived from `user_input/raw_idea/agents/ba.md`.
- **R-14**: crawler `trace` mode on the existing runtime and safety gates: fill actions,
  server-recorded process steps, boundary stop on production, follow-up task lifecycle.
- **R-15**: a Docs tab in the dashboard (SRS sections, record pages with diagrams, evidence → run
  links, revision history, run → docs reverse view) and review actions that write only through a TS
  `docs:review` command; constitution 1.4.0.
- **R-16**: deterministic SRS export (Markdown + Mermaid + `records.json`) with a traceability matrix
  and an Unknowns chapter.

Design decisions: [research.md](research.md). Tables: [data-model.md](data-model.md).

## Technical Context

**Language/Version**: TypeScript (strict) on Node 22+ for store, tools, CLI, crawler; Python 3.13
for the dashboard (unchanged)

**Primary Dependencies**: existing: Zod, Kysely + better-sqlite3, `@modelcontextprotocol/sdk`,
Playwright, pino; FastAPI, Jinja2, htmx 4. New: `mermaid` (vendored `mermaid.min.js`, dashboard
Docs pages only). No new TS runtime dependency.

**Storage**: the existing per-environment SQLite store (`data/db/<env>.sqlite`); migrations
`0003_ba_documentation`, `0004_trace_processes`; evidence files unchanged

**Testing**: Vitest (pure `@pathfinder/docs` functions against fixtures; BA server via in-memory MCP
client like `harness.ts`; trace mode against the mock insurer with a real browser); pytest for the
dashboard (fixture stores from migrations, drift, read-only, POST path, diagram parity); golden files
for export

**Target Platform**: local operator machine (Linux/WSL); Claude Code runs the agents

**Project Type**: TS monorepo packages + one Python web app + agent/skill definitions

**Performance Goals**: Docs pages < 1 s on a store with 2 000 records × 3 revisions (same budget as
003 SC-005); review action round trip < 3 s; export of that store < 10 s

**Constraints**: BA never browses (no browser tools on its server); every revision has evidence;
agents never set statuses; dashboard process opens the store read-only; production traces never send
a non-read request (SC-005); export byte-deterministic

**Scale/Scope**: 1 operator/reviewer; per portal up to ~2 000 records; 12 record kinds; 4 new
dashboard pages, 2 new run tabs; 15 BA tools; 3 operator commands

## Constitution Check

*GATE: checked before Phase 0 and again after Phase 1.*

| Principle / constraint | Status | How this plan complies |
|---|---|---|
| I. Observed vs intent | Pass | Every revision carries `confidence`; `observed` is refused unless an observed Layer A target is cited (research §5); rationale has its own confidence; business goals are an explicit "not observable" placeholder. |
| II. Evidence and traceability (NON-NEGOTIABLE) | Pass | ≥ 1 evidence link per revision, enforced in the write transaction and by `docs:audit`; links resolve to runs; not-observable behaviour needs an open question; process steps carry `evidence_ref`. |
| III. Role separation | Pass | BA has only `pathfinder-ba` tools: no browser, no crawler tools, asks for evidence via `FUP` records. Crawler stays one agent with `map` and `trace` modes and records steps only through the server. QA untouched. |
| IV. Replay before promotion | Pass | Traced processes stop at `recorded`; `replay_verified`/`documented` are reserved in the CHECK for QA work, never set here. Doc status changes are applied by the deterministic status engine from human review records. |
| V. Safety-first (NON-NEGOTIABLE) | Pass | Trace reuses every gate unchanged; the boundary stop is triggered by the existing action-gate refusal; fill actions are local (`read`) and values are synthetic and PII-checked; CAPTCHA/block handling unchanged. |
| VI. Human-in-the-loop | **Amend** | Confirm/reject/comment in the Docs tab (D3). 1.4.0 adds: review decisions are stored records and status is derived from them by deterministic code. |
| VII. Deterministic core | Pass | Status engine, observed rule, relation table, renderer, matrix and audit are pure functions in `@pathfinder/docs`, unit-tested on fixtures; Markdown/Mermaid rendered from Zod-validated JSON; export byte-identical. |
| Schemas: Zod single source of truth | Pass | Layer B schemas in `@pathfinder/core/schemas`; all writes (BA tools, `docs:review`, crawler) go through them. Dashboard Pydantic models are read-only mirrors, drift-tested. |
| Agent interface: DB only via MCP | Pass | BA uses `pathfinder-ba`; no raw SQL; ids and keys are server-allocated. |
| Python tooling: never writes the DB | **Amend (narrow)** | Dashboard POST runs the TS `docs:review` command; the Python process never opens a writable connection. 1.4.0 states this path explicitly (research §2). |
| Storage: SQLite | Pass | Same store; generic record tables with JSON content, no second store. |
| Runtime guidance location | Pass | Governance says guidance moves from `user_input/raw_idea/agents/` into agents/skills: done for the BA (`.claude/agents/ba.md`, `.claude/skills/ba-practice/`). |

Post-design re-check (after Phase 1): unchanged. The two **Amend** rows are delivered by one
constitution MINOR bump in R-15 before its review route merges. Complexity Tracking below.

## Project Structure

### Documentation (this feature)

```text
specs/004-ba-documentation/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── ba-mcp-tools.md          # pathfinder-ba server (R-13)
│   ├── crawler-trace-tools.md   # start_run/navigate/act/finish_run trace changes (R-14)
│   ├── operator-cli.md          # docs:review, docs:export, docs:audit
│   ├── http-routes-docs.md      # Docs tab, run tabs, review POST (R-15)
│   ├── srs-export.md            # export layout (R-16)
│   └── diagram-fixtures/        # shared records→Mermaid goldens (added in R-15)
├── checklists/requirements.md
└── tasks.md                     # /speckit-tasks
```

### Source Code

```text
data/
├── migrations/0003_ba_documentation.{up,down}.sql        # R-13 (db-admin)
├── migrations/0004_trace_processes.{up,down}.sql         # R-14 (db-admin)
└── schema/schema.sql, README.md                           # regenerated

apps/crawler/
├── package.json                    # + docs:review, docs:export, docs:audit scripts
├── scripts/docs-review.ts, docs-export.ts, docs-audit.ts
│   (portal-export.ts, portal-delete.ts: + Layer B and process tables in the partition map)
└── packages/
    ├── core/src/schemas/           # + analysis-session, doc-record, doc-revision (content union),
    │                               #   evidence-link, relation, review, followup, process, process-step;
    │                               #   RunMode adds 'trace'; db-types.ts extended
    ├── docs/                       # NEW pure package @pathfinder/docs
    │   ├── src/keys.ts             # prefixes, key format, next seq
    │   ├── src/status-engine.ts    # revision/review → statuses (pure)
    │   ├── src/observed-rule.ts    # confidence check over resolved targets
    │   ├── src/relations.ts        # allowed (from kind, type, to kind)
    │   ├── src/evidence.ts         # resolve targets → {portal, run, confidence}
    │   ├── src/audit.ts            # docs:audit checks
    │   ├── src/render/             # SRS chapters, Mermaid builders, traceability, records.json
    │   └── tests/                  # fixtures + goldens
    ├── mcp-server/
    │   ├── src/ba-main.ts          # NEW entry: pathfinder-ba server, no runtime
    │   ├── src/ba-tools/index.ts   # BA tool registration (BA_TOOL_NAMES)
    │   ├── src/services/ba/*.ts    # sessions, records, reads, feedback
    │   ├── src/services/trace.ts   # process + step recording, boundary, followup transitions
    │   ├── src/services/start-run.ts, runtime/*   # mode/intent/value plumbing
    │   └── tests/ba-*.test.ts, trace-run.test.ts, ba-lockdown.test.ts
    ├── crawler/src/action-extractor.ts  # fillable controls in trace mode
    └── config/                     # persona trace_inputs (+ PII check)

apps/dashboard/src/pathfinder_dashboard/
├── models.py                       # + Layer B and process read models
├── queries_docs.py                 # docs queries (pure over a ro connection)
├── diagrams.py                     # Mermaid text builders (parity with @pathfinder/docs)
├── review.py                       # subprocess call to docs:review, result mapping
├── app.py                          # /docs routes, run tabs, POST review, origin guard
├── settings.py                     # + reviewer, crawler_dir (where to run pnpm)
├── templates/docs/*.html, templates/partials/docs/*.html
└── static/vendor/mermaid.min.js
apps/dashboard/tests/test_docs_*.py, test_review.py, test_diagrams.py

.mcp.json                           # + pathfinder-ba server
.claude/agents/ba.md                # NEW (subagent-authoring)
.claude/agents/crawler.md           # + Trace section; description covers trace mode
.claude/skills/ba-practice/         # NEW SKILL.md + references/
.specify/memory/constitution.md     # 1.4.0 (R-15)
```

**Structure Decision**: No new app. Store, tools, CLI and crawler changes stay in the TS workspace
`apps/crawler/` (a new pure package `docs` beside `core`, and a second server entry in
`mcp-server`); the Docs tab is part of `apps/dashboard/`. Schema work goes through `db-admin`, UI
through `frontend-dev`, agent/skill files through the `subagent-authoring` skill.

## Delivery by roadmap item

| Item | Stories | Contents | Depends on |
|---|---|---|---|
| R-13 | US1 | 0003 migration, schemas, `@pathfinder/docs` (keys, status engine, observed rule, relations, evidence, audit), `pathfinder-ba` server + tools, `docs:audit`, portal export/delete partition, `ba` agent + `ba-practice` skill, `.mcp.json` | — |
| R-14 | US4 | 0004 migration, RunMode `trace`, start_run/navigate/act/finish_run changes, fill actions, persona `trace_inputs`, process step recording, boundary, follow-up lifecycle, crawler.md Trace section, BA process reads (`list_processes`, `get_process`) | R-13 (follow-ups) |
| R-15 | US2, US3 | constitution 1.4.0, `docs:review`, dashboard read models + drift, Docs pages/fragments, run `docs`/`process` tabs, diagrams + fixtures, review POST + guards, live updates | R-13 (R-14 for process views) |
| R-16 | US5 | renderer chapters, traceability, `records.json`, `docs:export`, determinism and golden tests | R-13, R-14 |

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| Dashboard triggers writes (review) | User decision D3; Principle VI needs a human confirm step somewhere usable | CLI-only review is clumsy for reading long drafts; direct Python writes would duplicate Zod validation (research §1) |
| Mermaid builders in both TS and Python | Docs pages must stay < 1 s; export must be TS | Calling TS per page is too slow; storing rendered diagrams puts derived data in the source of truth. Shared golden fixtures prevent drift (research §9) |
