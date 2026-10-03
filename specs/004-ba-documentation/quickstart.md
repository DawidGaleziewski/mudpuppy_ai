# Quickstart: BA Documentation

Validation guide proving each roadmap item works end to end. Everything runs against the local
**reference portal** (`apps/crawler/packages/reference-portal`, portal `reference-insurer`), whose
full truth is in its `ground-truth.json`. Existing liveinsurer data plays no part.

## Prerequisites

- `cd apps/crawler && pnpm install`; `cd apps/dashboard && uv sync`
- Migrations `0004_ba_documentation` (R-13) and `0005_trace_processes` (R-14) applied: the server
  applies pending migrations on start; `data/schema/schema.sql` regenerated.
- `.mcp.json` lists both `pathfinder` and `pathfinder-ba` servers.
- Reference portal running: `cd apps/crawler && pnpm reference-portal` (http://127.0.0.1:4010).
- MCP servers started with `PATHFINDER_ENV=sandbox` so runs land in `data/db/sandbox.sqlite`.

## R-13 — BA documents a portal from map evidence

1. Automated: `pnpm test` in `apps/crawler` covers the ground-truth consistency test, BA service
   tests on the fixture store (keys, evidence, refusals `MISSING_EVIDENCE`, `INVALID_CONFIDENCE`,
   `RUN_NOT_IN_SESSION`, `STALE_REVISION`, no status input) and the lockdown tests.
2. Crawl: "use the crawler agent to map portal `reference-insurer` as `guest`".
3. Document: "use the ba agent to document portal `reference-insurer` from run `<run_id>`". Expect a
   `completed` session with all seven passes, records of kinds `SCR`, `CAP`, `DI`, `GL`, `REQ`,
   `BR`, and `FUP`s asking for traces of the processes it found.
4. `pnpm docs:audit reference-insurer --env sandbox` → exit 0 (SC-001, SC-002).

## R-14 — Trace a process

1. Automated: `pnpm test -- trace` traces "Oblicz składkę OC/AC" on the reference portal as
   `reference-insurer` (sandbox: reaches the result, `goal_reached`, fills recorded) and as
   `reference-insurer-readonly` (production: stops at `Kup polisę` with `TRACE_BOUNDARY_REACHED`, an
   open question, and no POST in the portal's request log — SC-005).
2. Run the crawler agent in trace mode for each open `FUP` the BA created (`followup_key`); each moves
   `open → in_progress → done|blocked`. Re-run the ba agent: it builds `PROC` and `UC` records from
   the traces.
   Validated 2026-10-03 (T050, R-14 done): FUP-001..004 traced to their goal pages on
   `reference-insurer`; FUP-004 reaches the confirmation using the persona's synthetic
   `E-mail: test@example.invalid` (reserved test TLDs are accepted as synthetic since `1462cb0`).
   FUP-005 needs a customer account (OQ-001); FUP-008 (e-mail only; too short `Telefon`) is open,
   not traced.

## R-15 — Docs tab and review

1. `cd apps/dashboard && PATHFINDER_REVIEWER="Test Reviewer" uv run pathfinder-dashboard --env sandbox`
2. Open `/docs` → `reference-insurer`: every section of
   [http-routes-docs](contracts/http-routes-docs.md) renders; a requirement's evidence link opens the
   run page (SC-003); the run page's Docs tab lists that requirement.
3. Confirm a draft: status becomes `confirmed` without reload; reject without text is refused; a
   second tab confirming the same (now stale) revision gets `STALE_REVISION`.
4. Automated: `uv run pytest`.
   Validated 2026-10-03 (T071, R-15 done): steps 1–3 reviewed in a browser on sandbox.

## R-16 — Export and goal evaluation

1. `pnpm docs:export reference-insurer --env sandbox` twice; `diff -r` is empty (SC-007).
2. `pnpm docs:evaluate reference-insurer --env sandbox --ground-truth
   packages/reference-portal/ground-truth.json --out data/exports/reference-insurer-eval.json`
   → exit 0 with SC-008 scores and 0 over-claims (SC-009). If it fails, the report's `missing` and
   `overclaims` lists say what the BA or crawler did not get; record them in the roadmap notes and fix
   the guidance or crawler, then re-run steps R-13.3 → R-16.2.
