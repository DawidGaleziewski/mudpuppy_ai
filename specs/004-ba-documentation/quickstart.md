# Quickstart: BA Documentation

Validation guide proving each roadmap item works end to end. Acceptance runs on the local mock
insurer portal (`apps/crawler/packages/mcp-server/tests/mock-insurer.ts`); liveinsurer is best effort
(its store stays thin until T073's host issue is fixed).

## Prerequisites

- `cd apps/crawler && pnpm install`; `cd apps/dashboard && uv sync`
- Migrations `0003_ba_documentation` (R-13) and `0004_trace_processes` (R-14) applied: the server
  applies pending migrations on start; `data/schema/schema.sql` regenerated.
- `.mcp.json` lists both `pathfinder` and `pathfinder-ba` servers.

## R-13 — BA documents a portal from map evidence

1. Automated: `cd apps/crawler && pnpm test -- ba` runs the BA service tests on a fixture store
   holding one completed mock-insurer map run (records created, keys allocated, evidence resolved,
   refusals: `MISSING_EVIDENCE`, `INVALID_CONFIDENCE`, `RUN_NOT_IN_SESSION`, `STALE_REVISION`, no
   status input accepted) and the lockdown test (BA server exposes only BA tools; crawler server
   none of them).
2. Agent: in Claude Code, "use the ba agent to document portal `<portal>` from run `<run_id>`" on a
   sandbox store with a mock-insurer map run. Expect a session `completed` with all seven passes,
   records of at least kinds `SCR`, `CAP`, `DI`, `GL`, `REQ`, `OQ`/`FUP`, and a return summary.
3. `pnpm docs:audit <portal> --env sandbox` → exit 0, zero findings (SC-001, SC-002).

## R-14 — Trace a process

1. Automated: `pnpm test -- trace` traces "calculate a car insurance premium" on the mock insurer
   twice: `environment: sandbox` (reaches the result page, `goal_reached`, steps with fills) and
   `environment: production` (stops at the submit action with `TRACE_BOUNDARY_REACHED`, a crawler
   open question, no mutating request logged by the mock — SC-005).
2. A follow-up task `FUP-…` created by the BA and passed as `followup_key` moves `open →
   in_progress → done|blocked`.

## R-15 — Docs tab and review

1. `cd apps/dashboard && PATHFINDER_REVIEWER="Test Reviewer" uv run pathfinder-dashboard --env sandbox`
2. Open `/docs`, pick the portal: every section of [http-routes-docs](contracts/http-routes-docs.md)
   renders; a requirement's evidence link opens the run page (≤ 2 clicks, SC-003); the run page's
   Docs tab lists that requirement.
3. Confirm a draft: status becomes `confirmed` without reload; reject without text is refused; a
   second tab confirming the same (now stale) revision gets `STALE_REVISION`.
4. Automated: `uv run pytest` (drift tests include the new tables; GET routes leave the store hash
   unchanged; POST writes only through `docs:review`; diagram parity against
   `contracts/diagram-fixtures/`).

## R-16 — Export

1. `cd apps/crawler && pnpm docs:export <portal> --env sandbox` twice; `diff -r` of the two outputs
   is empty (SC-007).
2. `--confirmed-only` output contains no `DRAFT` callout; every key and evidence id in the Markdown
   exists in `records.json` and in the store (checked by the export test).
3. Read `README.md` → `12-traceability.md` of the mock-insurer export and check SC-008: capabilities,
   screens, processes, fields and unknowns are listed.
