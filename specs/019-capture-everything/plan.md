# Plan: spec 019 — capture everything (R-37, R-38) and the R-28 leftovers (R-45)

Branch `feature/019-r45-r37-r38-capture-everything` · 2026-10-11 · Spec: [spec.md](spec.md)

## Summary

Store every URL verbatim (a `page_visits` row per arrival, with the hop chain that led there, and a
`url` on every API call), strip path parameters from route templates (LO-24), wait through short
client-side redirects so interstitials stop becoming screens (LO-23), derive a per-screen parameter
inventory and entry-URL list that the BA, the export and the dashboard read, and add the
proving-ground case and gates. Alongside: probe micro-frontend mounts in frames (LO-53), give the BA
generated record shapes and relation lists plus actionable refusals and measure refusals in the
eval (F-20), and let the dashboard open eval workspaces (F-21).

## Technical context

- TypeScript 5 strict, Node 22, pnpm workspace `apps/crawler` (packages listed in `layers.json`),
  Playwright Chromium, Kysely + better-sqlite3, Zod 4, Vitest.
- Python 3.13 + FastAPI + Jinja + htmx dashboard (`apps/dashboard`), uv, pytest.
- Django proving ground (`apps/proving-ground/backend`), ground truth YAML (G-34).
- Tests: fast tier per commit; slow tier (gates, e2e) required because the change touches
  `mcp-server/src/runtime/**`, `gates/**`, `crawler/src/**`, `apps/proving-ground/**`.

## Constitution check

| Principle | How this plan complies |
| --- | --- |
| I Observed vs intent | URLs and hops are observed facts; parameter dependencies are BA records, `inferred` until confirmed |
| II Evidence | every visit is an evidence target (`page_visit`); BA records cite visits |
| III Role separation | crawler records, BA interprets; no new crawler tool |
| IV Replay | unaffected |
| V Safety | client-side redirects go through `navigationPolicy`; out-of-scope hops are recorded as `blocked`, not followed; vault secrets still redacted on every write |
| VI Human in the loop | owner questions collected at the end (no mid-run questions, owner 2026-10-11) |
| VII Deterministic core | `parseUrlParams` (kernel), `parameterInventory`, `describeRecordKinds` are pure, unit-tested |

No violations.

## Project structure (touched)

```
apps/crawler/packages/
  fingerprint/src/route-template.ts      strip ;params (LO-24)
  fingerprint/src/url-params.ts          NEW parseUrlParams
  core/src/schemas/page-visit.ts         NEW NavigationHop, PageVisit
  config/src/portal-schema.ts            scope.client_redirect_wait_ms
  store/src/db-types.ts                  PageVisitsTable, network_calls.url
  crawler/src/navigation-recorder.ts     NEW hop capture
  crawler/src/client-redirect.ts         NEW meta refresh probe + wait
  crawler/src/mounts.ts                  waitForMountsIn (frames)
  crawler/src/network-recorder.ts        url, fields nested (F-08)
  crawler/src/session.ts                 attach the navigation recorder
  mcp-server/src/runtime/pipeline/
    settle.ts                            client redirects, frame mounts
    visits.ts                            NEW record_visit step
    process-page.ts                      order: … net_drain, nav_drain, …, record_visit
  mcp-server/src/services/page-visits.ts NEW insert
  mcp-server/src/services/ba/reads-urls.ts NEW page_visits + parameters kinds
  mcp-server/src/ba-tools/index.ts       generated kinds block, error extras
  docs/src/param-inventory.ts            NEW pure inventory
  docs/src/record-kinds-text.ts          NEW describeRecordKinds()
  docs/src/render/chapters/structure.ts  entry URLs + parameters per screen
  gates/tests/{bank,insurer,shop}.test.ts gates LO-21..24, LO-52, LO-53
apps/crawler/evals/graders/code/ba-writes.ts NEW refusal metric
apps/proving-ground/backend/…            wyciag.do (LO-52), late frame mount page (LO-53)
apps/proving-ground/ground-truth/bank.yaml  new screens/rules
apps/dashboard/src/pathfinder_dashboard/
  db.py / stores.py (NEW)                store list incl. eval workspaces
  queries_urls.py (NEW)                  visits, inventory
  web/deps.py, web/states.py, templates  picker, empty portal, reached-under section
data/migrations/0012_page_visits.{up,down}.sql, data/schema/schema.sql
docs/legacy-obstacles.md                 LO-23/24 rewritten, LO-52/53
.claude/skills/ba-practice/…             URLs & parameters pass, element label rule
```

## Build order and why

1. **Foundation** (schema, Zod, config, `parseUrlParams`, route-template fix): everything reads it.
2. **Capture** (navigation recorder, client-redirect wait, visit step, network `url` + F-08): the
   data the read side needs; gates LO-21/22/23/24 prove it.
3. **Frame mounts** (LO-53): independent, small, crawler-side; done while the settle step is open.
4. **Read side** (inventory, BA kinds, export, skill): needs captured visits.
5. **BA refusals** (F-20): independent of 1–4; generated description + errors + eval grader.
6. **Proving-ground case** (LO-52) + ground truth + gates.
7. **Dashboard** (stores, empty portal, reached-under section): Python; reads the new table.
8. **Validation**: slow tier, four evals (one at a time), close-out.

## Risks

- **Route-template change re-identifies legacy bank screens** (sid stripped): eval baselines for the
  bank change; read against the new runs, documented.
- **Client-redirect wait adds latency** on every page: only taken when a short meta refresh or an
  in-flight navigation is seen; measured in the slow tier time.
- **Hop classification is heuristic** (script vs meta refresh vs reload): tests pin each proving-
  ground case; unknown cases default to `script`.
- **Tool description grows** (~25 lines): once per BA session, cached; noted for R-24 if it shows.
- **Real evals cost quota** (spec 014 F-04): one at a time, stop on a limit.
