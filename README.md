# MudPuppy

<img src="apps/dashboard/src/pathfinder_dashboard/static/brand/mudpuppy-rust-256.png" width="256" height="207" alt="MudPuppy">

MudPuppy maps a web portal the way a careful visitor would, records what it finds, and turns that
into documentation good enough to re-create the portal. The **crawler** (`specs/001-crawler-map-mode/`)
explores a portal as a guest, read-only on production, and stores states, transitions, forms and API
shapes with evidence; in `trace` mode it records one named business process step by step. The **BA
agent** (`specs/004-ba-documentation/`) reads that evidence and writes keyed, evidence-linked
documentation records (an as-is SRS), which a person reviews, exports and scores against a known
answer key.

## How the crawler works

The crawler is a Claude Code subagent (`.claude/agents/crawler.md`). It has **no shell, file, web or browser
tools**: its only tools are the eight `mcp__pathfinder__*` tools exposed by the `pathfinder` MCP server
(`apps/crawler/packages/mcp-server`, registered in `.mcp.json`). The server owns the only browser, the
database and the evidence store.

The agent proposes where to go; the server decides what is safe, executes it, waits for the page to settle,
observes it, fingerprints it and records it. The agent cannot write records, invent ids, or choose selectors.

```
start_run  ->  navigate / act  <-  get_next_frontier_item   ...   finish_run
```

## Running it

1. Install: `pnpm --dir apps/crawler install`, then a browser once: `pnpm --dir apps/crawler exec playwright install --with-deps chromium`.
2. Ask the main Claude Code session: *"Use the crawler subagent to map `<portal>` as `<persona>`"*. There is no
   crawler CLI. Approve the `pathfinder` MCP server when prompted.
3. Results land in `data/db/<environment>.sqlite` and `data/evidence/`; both are generated and git-ignored.
   The `PATHFINDER_ENV` variable in `.mcp.json` picks the database (default `production`).

`specs/001-crawler-map-mode/quickstart.md` lists the checks that prove a run behaved.

## Seeing the results: the dashboard

`apps/dashboard/` is a local, read-only web dashboard over the same database (Python, FastAPI + htmx,
managed with `uv`). It shows each portal's runs and why they ended, and per run the states, actions and their
safety class, the frontier, forms, network shapes, robots.txt policies and the decision log, updating live while
the crawler writes:

```bash
cd apps/dashboard && uv sync && uv run pathfinder-dashboard   # http://127.0.0.1:8765
```

See [`apps/dashboard/README.md`](apps/dashboard/README.md) (spec `specs/003-dashboard-ui/`).

## From crawl to documentation

The whole flow, with the agents named in `.claude/agents/`:

1. **Map.** *"Use the crawler agent to map `<portal>` as `<persona>`"* records the guest-visible
   portal (`map` mode).
2. **Document.** *"Use the ba agent to document `<portal>` from run `<run_id>`"*: the `ba` agent
   (skill `ba-practice`) has no browser; through the `pathfinder-ba` MCP server it writes screens,
   capabilities, requirements, business rules, data items, glossary terms, assumptions and open
   questions, each with a confidence label and evidence, and asks for **follow-up** traces of the
   processes it found.
3. **Trace.** The crawler agent traces each open follow-up (`trace` mode); on production it stops
   at the first mutating action and records what could not be observed. Re-running the ba agent
   turns the traces into process and use-case records.
4. **Review.** The dashboard's Docs tab shows the documentation; with `PATHFINDER_REVIEWER` set, a
   person confirms, rejects or comments (see `apps/dashboard/README.md`). Rejections come back to
   the BA as feedback in its next session.
5. **Export.** `pnpm --dir apps/crawler docs:export <portal> --env <env> [--confirmed-only]` writes
   the SRS: Markdown chapters along ISO/IEC/IEEE 29148, Mermaid diagrams, a traceability matrix,
   an Unknowns chapter, `records.json` and `images/` (each screen's screenshot and wireframe, and
   crops with the elements a record cites outlined), byte-identical for the same store.
6. **Evaluate.** `pnpm --dir apps/crawler docs:evaluate <portal> --env <env> --ground-truth <file>`
   scores the documentation per category (screens, fields, constraints, rules, processes, terms),
   lists every miss and every over-claim, and fails below the targets.

`pnpm --dir apps/crawler docs:audit <portal> --env <env>` checks that every revision has resolvable
evidence (screen-region keys included) and every status is explained by a review.

**Pictures.** Every new state is recorded with a screenshot and a wireframe (an SVG plus an editable
`.excalidraw` file, drawn from the page's accessibility snapshot in one fixed style). The BA cites
the field or button a record is about as a *screen region*, and the dashboard and the export outline
it on the screenshot. `pnpm --dir apps/crawler wireframes:build <portal> --env <env> [--all]`
redraws wireframes, for example for states recorded before screenshots existed. States from before
migration 0006 have no screenshot; to get them, wipe the store and re-crawl
(`specs/008-screenshots-wireframes/quickstart.md` §0).

The **reference portal** (`apps/crawler/packages/reference-portal`, portal `reference-insurer`) is a
local fake Polish insurer whose full truth is written down in `ground-truth.json`. Start it with
`pnpm --dir apps/crawler reference-portal` (http://127.0.0.1:4010) and run the flow above with the MCP
servers on `PATHFINDER_ENV=sandbox`; step 6 then says how close the documentation gets.

New to the vocabulary (run, frontier, evidence, settled, …)? Read the
[MudPuppy glossary](docs/glossary/README.md), also in the dashboard's Glossary tab, and the
[BA wiki](docs/wiki/README.md) for the business-analysis concepts behind the documentation.

## Proving ground, vault, gates and evals

The **proving ground** (`apps/proving-ground`) is a fictional legacy estate (shop, bank, insurer,
old pages) that reproduces the obstacles in `docs/legacy-obstacles.md`. Its data is disposable.

1. Start it: `pnpm --dir apps/proving-ground start` (http://127.0.0.1:4100/). See
   `apps/proving-ground/README.md`.
2. Generate test users: `pnpm vault generate proving-ground-bank --login PG_BANK_LOGIN=jan.testowy
   --password PG_BANK_PASSWORD --seed ../proving-ground/backend/var/users.local.json --seed-user
   bank-client` (in `apps/crawler`). The first call creates the vault key. `pnpm vault list` shows
   names only.
3. `pnpm test` in `apps/crawler` also runs the quality gates (tier 1). They start the estate on
   4200/4201, so stop anything on those ports first. The run writes `data/gates/report.json`.
   Cases with real waits (LO-32 session expiry, LO-35 fresh browsers) are skipped there and run
   with `pnpm test:slow` (the whole gate set, for a nightly run).
4. `pnpm eval <portal> [--persona <id>] [--budget-usd 5]` (in `apps/crawler`) runs the real
   crawler and BA agents headless, scores the result and compares it with the baseline. It costs
   real tokens (the budget cap defaults to 5 USD) and is never part of `pnpm test`. It writes
   `data/evals/<portal>/<timestamp>.json`; `--promote` makes it the new baseline.

Walk-through: `specs/009-legacy-proving-ground/quickstart.md`.

## Configuration

| File | Purpose |
| --- | --- |
| `portals/<portal>/portal.yaml` | Address, environment, scope and budgets, denylist, rate limit, obstacles (cookie banners), compliance |
| `personas/<portal>/<persona>.yaml` | Who the crawler acts as: auth references, action ceiling, viewport, locale, consent. Composable with `extends` |
| `personas/_mixins/*.yaml` | Shared persona fragments |

The schemas are in `specs/001-crawler-map-mode/contracts/config-schema.md`. A bad file is rejected with a message
naming the file and the problem; credentials are never stored, only `ref:NAME` references.

## Safety model

These guarantees are enforced in code, outside the agent:

- **Read-only on production.** Every action is classified (read / mutating / destructive / external-side-effect)
  by rules over its label, role, target URL and HTTP method. Only `read` runs on production; unknown means unsafe.
  The server re-derives the class before executing, so an agent that calls a bid button "read" gains nothing.
- **Explicit production flag.** A portal must declare `environment: production` to be crawled at a production
  address, and `start_run` refuses otherwise in well under 5 seconds with no request made.
- **Compliance gate.** A production run is refused until `compliance.robots_checked_on`, `terms_reviewed_on` and
  `terms_reviewed_by` are filled by a person, and the `rate_limit.user_agent` no longer holds the placeholder
  contact address.
- **Scope and denylist.** Allowed domains and paths, external links recorded but not followed, and a denylist of
  logout, delete, payment, bidding, buy-now, contacting the seller, revealing contact details and listing creation.
  Browser-initiated navigations (redirects, scripts) pass through the same check.
- **Polite.** Identifiable `User-Agent`, a rate limit and a concurrency cap on every request.
- **Stops on a block.** A 403/429, CAPTCHA or portal-specific block page ends the run (`stopped_warning`); every later
  call returns `RUN_STOPPED` and no further request is made. There is no way to resume past a block.
- **Test data off production (constitution 2.0.0).** On sandbox and staging, map mode fills a form with
  deterministic test data before pressing its submit button (form autofill), so the pages behind forms are
  recorded too. On production nothing is filled or submitted.
- **Evidence as recorded.** Every new state gets an unmasked full-page screenshot and a layout (element keys
  with boxes). Text evidence is masked only when the portal sets `pii_scrub: true`; network calls are recorded
  as shapes only either way.

`pnpm --dir apps/crawler audit:pii` scans the evidence and database for personal data (it reports findings
for every portal that does not set `pii_scrub`, which is expected since constitution 2.0.0), and
`pnpm --dir apps/crawler stability <runA> <runB>` measures how stable state identity is between two runs.

## Repository layout

- `apps/<name>/` — every app, whatever its language, self-contained with its own manifest, lockfile and tests
  - `apps/crawler/` — the TypeScript workspace (`packages/*`: core, fingerprint, safety, config, obstacles, crawler, mcp-server, docs, reference-portal)
  - `apps/dashboard/` — the read-only operator dashboard (Python, uv, FastAPI + htmx)
- `data/` — migrations, the schema snapshot, and generated databases and evidence
- `docs/` — the MudPuppy glossary (`docs/glossary/glossary.yaml` is the source) and the BA wiki
- `specs/` — spec-driven development documents (spec, plan, tasks, contracts, quickstart)
- `.claude/agents/` — subagents (crawler, ba, db-admin, frontend-dev, governor, po); `.claude/skills/` holds `ba-practice` (how the BA documents) and `revamp-dashboard` (the UI design system)
- `roadmap.md`, `CHANGELOG.md` — status and history, maintained by the `po` agent

Develop with `pnpm --dir apps/crawler test`, `typecheck`, `lint`, and in `apps/dashboard` with `uv run pytest` and
`uv run ruff check .`. Tests that need a browser skip themselves when
Chromium cannot start.
