# Implementation Plan: Portal-Agnostic Safety and Portal Workspaces

**Branch**: `feature/002-r11-portal-agnostic-safety` (stacked on `feature/001-r04-core-crawler-map-mode`) | **Date**: 2026-09-24 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-portal-agnostic-safety/spec.md`

## Summary

Make the spec 001 crawler portal-agnostic without widening what it may do. Four changes to the
existing packages, no new package and no new runtime dependency:

1. **Robots**: a pure RFC 9309 parser and matcher in `safety`, a per-run `RobotsRegistry` in
   `crawler` that fetches each in-scope host's `robots.txt` through the run's limiter and
   User-Agent, and enforcement in both `action-gate.decide` (links, `navigate`) and
   `request-gate` (redirects, page-started navigations, and the page's own requests under the
   per-portal `robots_page_requests` setting). `start_run` refuses with `ROBOTS_UNAVAILABLE`
   when the base host's file is unreachable.
2. **Rules**: `ACTION_RULES` becomes a `RuleSet` value passed into the classifier and denylist
   check; generic ids with marketplace aliases; portal `action_rules` that can only add rules or
   raise a class; `url:` denylist entries matching path plus query.
3. **Workspaces**: `states` get `portal_id` and a per-portal unique fingerprint; the fingerprint
   index rebuild is filtered by portal; persona `extends` is fenced to shared mixins and the
   portal's own folder; operator scripts export and delete one portal's data, logged in
   `portal_data_log`.
4. **Proof and docs**: a second, insurer-style mock portal with its own `robots.txt`, spec 001's
   end-to-end checks run against it, and spec 001 docs retargeted to "a configured portal".

## Technical Context

**Language/Version**: Node 22+, TypeScript (strict), as spec 001

**Primary Dependencies**: unchanged from spec 001 (`playwright`, `zod`, `better-sqlite3` + Kysely,
`@modelcontextprotocol/sdk`, `pino`, `yaml`). Robots fetching uses Node's built-in `fetch`; the
robots parser is in-house (research §1).

**Storage**: SQLite, one file per environment (unchanged). Migration `0002_portal_workspaces`:
`states.portal_id` with `UNIQUE (portal_id, fingerprint)`, frontier status `robots_disallowed`,
decision-log kind `note`, new tables `robots_policies` and `portal_data_log`. Evidence stays
flat and content-addressed; robots fetches are stored as evidence records. Exports go to
`data/exports/` (git-ignored). Migrations and the `data/schema/` snapshot are owned by the
`db-admin` subagent.

**Testing**: Vitest. Pure units: robots parser and matcher against saved real-world
`robots.txt` fixtures (liveinsurer.example, marketsite.example, forum.example, pl.wikipedia.org, classifieds.example, saved
2026-09-24) and the RFC 9309 examples; rule sets, aliases and portal rule validation; `url:`
entries; persona fence. Integration: the MCP server against both mock portals (marketplace and
insurer), including robots 404, 503 and redirect-loop variants. The spec 001 suite must stay
green.

**Target Platform**: Linux/macOS CLI, local, as spec 001

**Project Type**: pnpm-workspace monorepo under `apps/crawler/`, one package per module

**Performance Goals**: not throughput-bound; robots adds one fetch per host per run (plus one per
resume or 24 h), rate-limited like page traffic

**Constraints**: production stays read-only; robots refusals are not overridable by agent or
persona; the only portal-side loosening is `robots_page_requests: allow_and_record` (FR-009);
`start_run` refuses in under 5 s when robots is unreachable (SC-003); no portal id or domain in
code (FR-021, SC-007)

**Scale/Scope**: two portals in the repo (`liveinsurer` live practice target, `marketsite` on
hold) plus two mock portals; tens of hosts at most per portal

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Check | Status |
|---|---|---|
| I. Observed vs intent | Robots decisions and rule matches are recorded as observed facts with the rule text; no intent is inferred. | Pass |
| II. Evidence and traceability | Every robots fetch (including 404 and failures) is stored as an evidence record and referenced from `robots_policies` and the run's config snapshot; every refusal cites its policy and rule (FR-005). | Pass |
| III. Role separation | Robots, rule sets and the persona fence are deterministic server-side tools; the agent cannot see or change them. Export and delete are operator scripts, not agent tools (research §9); `agent-lockdown.test.ts` stays unchanged. | Pass |
| IV. Replay verification | Not affected (no process recording or promotion). | N/A |
| V. Safety-first | Adds a safety gate (robots) and a stricter vocabulary; portal rules can only raise a class; unknown controls stay non-read; the human terms review (FR-026 of 001) stays. The one loosening, `robots_page_requests: allow_and_record`, only concerns requests the allowed page makes by itself, is off by default, recorded per request and in the config snapshot, and is set by the person who signs the portal's compliance review. | Pass, see Complexity Tracking |
| VI. Human in the loop | The terms review and the `allow_and_record` choice stay human decisions in the portal file; deletion requires a named operator and `--yes`. | Pass |
| VII. Deterministic core | Robots parsing and matching, rule sets, alias resolution and portal rule validation are pure functions with fixture tests; no browser or LLM dependency. | Pass |
| Technical constraints | SQLite only, Zod as the schema source (portal schema extended), no new dependency, pnpm workspace unchanged. | Pass |
| Workflow | Build order respected: `safety` (pure) → `config` → `core` migration → `crawler` → `mcp-server` → scripts and docs. | Pass |

**Post-design re-check (after Phase 1)**: unchanged. The data model adds only tables and columns
keyed to existing runs and portals; the contracts add one start error, one frontier status, one
decision-log kind and two operator scripts. No principle is weakened.

## Project Structure

### Documentation (this feature)

```text
specs/002-portal-agnostic-safety/
├── plan.md              # This file
├── research.md          # Phase 0: decisions §1-§12
├── data-model.md        # Phase 1: migration 0002 and entities
├── quickstart.md        # Phase 1: validation guide
├── contracts/
│   ├── config-schema.md # portal and persona file changes
│   ├── mcp-tools.md     # start_run, frontier and decision-log changes
│   ├── robots.md        # robots fetch, matching and enforcement rules
│   └── operator-cli.md  # portal:export and portal:delete
├── checklists/requirements.md
└── tasks.md             # Phase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
apps/crawler/
├── packages/
│   ├── safety/src/
│   │   ├── robots.ts            # NEW: parseRobots, robotsVerdict, productToken (pure)
│   │   ├── rules.ts             # generic ids, ALIASES, builtinRuleSet
│   │   ├── rule-set.ts          # NEW: RuleSet, builtinRuleSet, extendRuleSet, portalRuleSet
│   │   ├── classifier.ts        # classifyAction/classifyUrl take a RuleSet
│   │   ├── denylist.ts          # url: entries, alias resolution, RuleSet
│   │   └── scope.ts             # unchanged matcher reused for url:
│   ├── config/src/
│   │   ├── portal-schema.ts     # action_rules, robots_page_requests, url:, alias ids
│   │   ├── rule-ids.ts          # NEW: builtin id/class table, RULE_ALIASES, resolveRuleId
│   │   │                        #   (lives here, not in safety/rule-set.ts, because config
│   │   │                        #   cannot import safety — As built, T008/T036)
│   │   ├── load-persona.ts      # fence option
│   │   └── effective.ts         # EffectiveConfig does not gain a ruleSet or robots field (config
│   │                            #   cannot import safety); the run's RuleSet is built by safety's
│   │                            #   portalRuleSet(portal) and held on RunState (As built, T008)
│   ├── core/src/                # Kysely types for new tables/columns
│   ├── crawler/src/
│   │   ├── robots-registry.ts   # NEW: per-run policies per host, fetch via limiter
│   │   ├── action-gate.ts       # robots check between scope and denylist
│   │   ├── request-gate.ts      # robots for navigations and page requests
│   │   └── preflight.ts         # passes the persona fence
│   └── mcp-server/src/
│       ├── services/start-run.ts        # robots fetch before the run row, ROBOTS_UNAVAILABLE
│       ├── runtime/browser-runtime.ts   # portal-scoped fingerprint rebuild, registry wiring
│       ├── runtime/pipeline.ts          # RuleSet from RunState, robots_disallowed frontier
│       └── services/record-*.ts         # states.portal_id, RuleSet
├── packages/*/tests/            # unit + integration; mcp-server/tests/mock-insurer.ts NEW
└── scripts/
    ├── portal-export.ts         # NEW (pnpm portal:export)
    └── portal-delete.ts         # NEW (pnpm portal:delete)
data/migrations/0002_portal_workspaces.{up,down}.sql   # NEW (db-admin)
personas/<portal>/_mixins/       # convention for portal-specific mixins
specs/001-crawler-map-mode/      # retargeted to "a configured portal" (FR-022)
.claude/agents/crawler.md        # mentions robots_disallowed in the frontier reasons it reads
```

**Structure Decision**: extend the existing spec 001 packages in place. Robots parsing lives in
`safety` because it is a pure safety decision; fetching and per-run state live in `crawler`
beside the rate limiter and request gate they use; the storage change goes through `db-admin`.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| A portal file may loosen one robots effect (`robots_page_requests: allow_and_record`) | Single-page sites such as forum.example and pl.wikipedia.org disallow `/api/` in robots yet call it from every page; blocking those requests leaves pages half-rendered and the map wrong. The user chose per-portal control with a blocking default (spec clarification, 2026-09-24). | Always blocking makes such portals unmappable; always allowing removes the human decision. Main-frame navigations stay under robots without exception. |
| Crawl-delay slows the whole run, not one host | Spec 001 has one limiter per run; a per-host limiter would touch the gate for a rare case. Slower is stricter, so the spec's "slower rate applies for that host" is met. | A per-host limiter map: more code, same safety outcome. |
