# Pathfinder AI

Pathfinder maps a web portal the way a careful visitor would and records what it finds. The first feature is
the **crawler in `map` mode** (`specs/001-crawler-map-mode/`): it explores a portal as a guest, read-only, and
stores states, transitions, forms and API shapes with evidence, so analysts and testers can build on facts
instead of guesses.

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
- **No PII stored.** Names, emails, phone numbers and tokens are masked before anything is written; network calls
  are recorded as shapes only; screenshots are not stored.

`pnpm --dir apps/crawler audit:pii` scans the evidence and database for anything that slipped through, and
`pnpm --dir apps/crawler stability <runA> <runB>` measures how stable state identity is between two runs.

## Repository layout

- `apps/crawler/` — the TypeScript workspace (`packages/*`: core, fingerprint, safety, config, obstacles, crawler, mcp-server)
- `data/` — migrations, the schema snapshot, and generated databases and evidence
- `specs/` — spec-driven development documents (spec, plan, tasks, contracts, quickstart)
- `.claude/agents/` — subagents (crawler, db-admin, governor, po)
- `roadmap.md`, `CHANGELOG.md` — status and history, maintained by the `po` agent

Develop with `pnpm --dir apps/crawler test`, `typecheck`, `lint`. Tests that need a browser skip themselves when
Chromium cannot start.
