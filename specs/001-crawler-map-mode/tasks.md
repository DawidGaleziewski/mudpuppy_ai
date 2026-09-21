---

description: "Task list for Crawler Map Mode (MarketSite MVP)"
---

# Tasks: Crawler Map Mode (MarketSite MVP)

**Input**: Design documents from `/specs/001-crawler-map-mode/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/mcp-tools.md, contracts/config-schema.md, quickstart.md; constitution at `.specify/memory/constitution.md`

**Tests**: Constitution Principle VII and the Development Workflow require Vitest unit tests, written before dependent packages build on them, for the pure packages (`fingerprint`, `safety`, `config`) and the PII scrubber. Tests are also included for the MCP write-tool enforcement rules (Principle II/V enforcement points). No `@playwright/test` specs are generated (QA's role, out of scope). Test tasks come first in each block and MUST fail before the implementation task that follows.

**Runtime**: The crawler is the Claude Code subagent `.claude/agents/crawler.md`, restricted to the `pathfinder` MCP server's tools; the server owns Playwright, the DB and all safety checks (research.md §11, contracts/mcp-tools.md).

**Organization**: Grouped by user story, with two deliberate deviations. (1) The constitution's build order (fingerprint → core schemas/migrations → safety → portal/persona loaders → MCP server → crawler) is followed, so the pure `fingerprint` package, `core`, and the complete portal + persona loaders (including `extends` resolution, T025–T030) are in Foundational; US3's own phase is then the composition demo (mixin + sample persona). (2) US2 (production safety guard) is built BEFORE US1 (the crawl), because the spec requires the guarantee to ship with the first crawl.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: US1–US4, from spec.md
- **[DB-ADMIN]**: MUST be delegated to the `db-admin` subagent (`.claude/agents/db-admin.md`); do not edit `data/` ad hoc (see `data/README.md`)

## Path Conventions

pnpm-workspace monorepo per plan.md: `packages/<name>/src/`, `packages/<name>/tests/`, `portals/`, `personas/`, `tests/fixtures/`, `data/`.

---

## Phase 1: Setup (Shared Infrastructure)

- [X] T001 Create pnpm workspace root: `package.json` (`engines.node >=22`, private), `pnpm-workspace.yaml` (`packages/*`), `tsconfig.base.json` (`strict: true`, ESM, `moduleResolution: bundler`)
- [X] T002 Scaffold the seven package folders each with `package.json`, `tsconfig.json` extending the base, `src/index.ts`, `tests/`: `packages/core`, `packages/fingerprint`, `packages/safety`, `packages/config`, `packages/obstacles`, `packages/mcp-server`, `packages/crawler`. Declare workspace deps per plan.md: core → `zod`, `better-sqlite3`, `kysely`, `pino`; config → `zod`, `yaml`; mcp-server → `@modelcontextprotocol/sdk` and the workspace packages; crawler (browser runtime library used in-process by mcp-server) → `playwright` (library, NOT `@playwright/test`). No LLM SDK: the agent runtime is the Claude Code subagent (research.md §11)
- [X] T003 [P] Add Vitest root config `vitest.config.ts` (`test.projects: ['packages/*']`, since `vitest.workspace` files were removed in Vitest 4) with a per-package `vitest.config.ts` including `tests/**/*.test.ts`, plus a root `test` script
- [X] T004 [P] Add ESLint + Prettier config at repo root and a root `typecheck` script running `tsc --noEmit` across packages
- [X] T005 [P] Create `tests/fixtures/{aria,har,actions,urls}/` with a `tests/fixtures/README.md` describing what each folder holds (saved ARIA snapshots, HARs, labeled action descriptors, URL lists)
- [X] T006 Verify `.gitignore` excludes `data/db/*.sqlite*` and `data/evidence/*` (keeping the `.gitkeep` files), and excludes `node_modules`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Everything every story needs, in the constitution's build order.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

### Fingerprint (pure; first in the build order, tests before implementation)

- [ ] T007 [P] Create fixtures: `tests/fixtures/urls/marketsite-urls.json` (URL list incl. tracking params, numeric/slug ids, query variants) and `tests/fixtures/aria/` snapshots (listing page ×2 with different items, search results, a distinct form page, one with an open overlay)
- [ ] T008 [P] Write `packages/fingerprint/tests/route-template.test.ts` (research §2): RFC 3986 normalization, tracking-param stripping, sorted query, fragment dropping, trie collapse of high-cardinality/numeric/UUID/hash segments to `:param`, low-cardinality segments stay literal
- [ ] T009 [P] Write `packages/fingerprint/tests/fingerprint.test.ts` (research §1): L1 `sha256(routeTemplate + canonicalARIATree + openOverlays)` is stable across reruns and masks volatile content (prices, counters, timestamps); two listing fixtures with different items share an L2 cluster (default threshold 0.9) while the distinct form page does not; merge/split decisions are returned as loggable records (FR-009)
- [ ] T010 Implement `packages/fingerprint/src/route-template.ts` (T008)
- [ ] T011 Implement `packages/fingerprint/src/aria-canonical.ts` (canonicalize + mask volatile content) and `packages/fingerprint/src/fingerprint.ts` (two-level fingerprint, SimHash/MinHash shingles of role+name, cluster assignment, decision records) (T009)

### Core: schemas, storage, evidence, PII

- [ ] T012 [P] Define shared Zod enums in `packages/core/src/schemas/common.ts`: `SafetyClass` (`read | mutating | destructive | external-side-effect`), `Confidence` (`observed | inferred | needs_confirmation`), `RunStatus` (`running | completed | stopped_warning | interrupted`), `FrontierStatus` (`skipped_unsafe | out_of_scope | denylisted | budget_reached | unreachable`), `EdgeStatus` (`executed | skipped`), and a pure `minSafetyClass(a, b)` helper with the danger ordering read < mutating < destructive < external-side-effect (used by `config` and `safety` for the FR-018 ceiling)
- [ ] T013 [P] Define Zod record schemas in `packages/core/src/schemas/`: `run.ts`, `state.ts`, `edge.ts`, `form.ts`, `network-call.ts`, `frontier.ts`, `open-question.ts`, `rule-candidate.ts`, matching `data-model.md` field-for-field. Constraints to encode verbatim: `state.fingerprint` "string (sha256) — Unique"; `run.mode` is `"map"` but the schema MUST be extensible to `"trace"` without change (FR-022); `edge.to_state` nullable; `edge.error` "JSON | null"; `network_call.edge_id` "string | null"; `req_schema`/`res_schema` "shape only — no PII payloads"; State and Edge carry `stabilization` "settled | never_stabilized"; `rule_candidate.confidence` is fixed to `inferred`; `evidence_ref` and `confidence` REQUIRED (non-empty) on State, Edge, Form (Principle II, FR-003)
- [ ] T014 [DB-ADMIN] Write migration `data/migrations/0001_init.*` (reversible) creating `runs`, `states`, `state_observations(state_id, run_id, persona_id, evidence_ref)`, `edges`, `forms`, `network_calls`, `frontier`, `open_questions`, `rule_candidates` per `data-model.md` (including the `stabilization` columns on `states` and `edges`), with a unique index on `states.fingerprint`, indexes for the lookups the MCP tools need (`states.cluster_id`, `edges.run_id`, `frontier.run_id`), and NOT NULL on every `evidence_ref`/`confidence` column of State/Edge/Form. Also decide and document (in `data/schema/`) how the FR-021 decision log is persisted (a `decision_log` table vs. pino JSONL file) and how the server-owned frontier is persisted for `get_next_frontier_item` and resume (FR-020): the `frontier` status enum only covers skipped items, so decide on a `pending` status and/or a queue table plus visited set, and update `data-model.md`. Regenerate the `data/schema/` snapshot
- [ ] T015 Implement DB access in `packages/core/src/db.ts` (better-sqlite3 + Kysely, one file per environment under `data/db/`) and a migration runner `packages/core/src/migrate.ts` that applies `data/migrations/` (depends on T014)
- [ ] T016 [P] Implement server-side id generation in `packages/core/src/ids.ts` (uuid); no API accepts client-chosen ids for new rows
- [ ] T017 [P] Write Vitest tests for the PII scrubber in `packages/core/tests/pii.test.ts` (names, emails, phone numbers, tokens in ARIA text and JSON payload shapes; masked output is deterministic) using samples in `tests/fixtures/aria/`
- [ ] T018 Implement pure PII scrubber `packages/core/src/pii.ts` (regex/type-based masking, plus a `looksLikeRawPayload()` check used by `record_api_call`) so T017 passes (FR-014)
- [ ] T019 [P] Write Vitest tests in `packages/core/tests/evidence.test.ts`: identical content stored once (sha256 addressing), PII masked BEFORE the file is written, returned `evidence_ref` resolves to `data/evidence/<sha256>.<ext>`
- [ ] T020 Implement evidence store `packages/core/src/evidence.ts` (masks via T018, hashes, writes `data/evidence/<sha256>.<ext>`, returns ref) so T019 passes. Screenshots are NOT stored in v1 (regex masking cannot redact pixels; research §9): evidence is masked ARIA snapshots and network shape records only (depends on T018)
- [ ] T021 [P] Implement pino logger and decision-log writer in `packages/core/src/log.ts` (structured JSON; entry kinds: skip, refuse, merge, split, warning — FR-021), persisting per the T014 decision

### Config: portal and persona loaders (pure; tests before implementation)

- [ ] T022 [P] Define Zod `PortalConfig` schema in `packages/config/src/portal-schema.ts` per `contracts/config-schema.md`: `environment` required enum `production | staging | sandbox`; `denylist` entries must be a known rule id or a `path:` glob (unknown free text rejected); `rate_limit` REQUIRED when `environment: production`; `scope`, `obstacles`, `item_view_cap` fields as in the contract; plus optional `max_action_class` (defaults to `read` for production), `item_route_templates` (string[]) and `compliance` `{robots_checked_on, terms_reviewed_on, terms_reviewed_by}` whose values may be null (the file still loads; `preflight` refuses production while any is null — FR-026)
- [ ] T023 [P] Define Zod `PersonaConfig` schema in `packages/config/src/persona-schema.ts` per data-model.md (`id`, `extends`, `auth: "none" | {…refs}`, `max_action_class`, `scope_restrictions`, `budgets`, `consent`, `viewport`, `locale`)
- [ ] T024 Implement `loadPortal(path)` in `packages/config/src/load-portal.ts` (YAML parse + T022 validation; errors name the file and the problem — FR-017) and Vitest tests `packages/config/tests/load-portal.test.ts` (valid file, missing `environment`, production without `rate_limit`, unknown denylist entry, `compliance` with nulls still loads)
- [ ] T025 [P] Write `packages/config/tests/persona-extends.test.ts`: depth-first resolution in `extends` order with the target applied last so later entries override earlier ones field by field; array fields use explicit override (no implicit concatenation — research §5); mixin resolved from `personas/_mixins/`
- [ ] T026 [P] Write `packages/config/tests/persona-rejections.test.ts`: circular `extends` fails naming the offending file; inline credential value (not a `ref:` name) fails naming the file and field; schema mismatch fails naming the file and problem (FR-017)
- [ ] T027 [P] Write `packages/config/tests/ceiling.test.ts`: persona `max_action_class` above the portal's → effective is the lower; persona lower than portal → persona wins (FR-018)
- [ ] T028 Implement `packages/config/src/load-persona.ts`: recursive `extends` resolution with visited-set cycle detection before merging, field-level merge, validation of inputs and merged output with the T023 schema (T025, T026)
- [ ] T029 [P] Implement inline-secret detection in `packages/config/src/secrets.ts`: `auth` credential fields must be `ref:`-prefixed names; literal secret-shaped values rejected (T026)
- [ ] T030 Implement `loadEffectiveConfig(portalPath, personaPath)` in `packages/config/src/effective.ts` returning `EffectiveConfig { portal, persona, effectiveMaxActionClass }` per the contract, computing the ceiling with `minSafetyClass` from `packages/core` (T012) and the portal's `max_action_class` (default `read` on production), so `config` does not depend on `safety` (T027). This is the only config entry point `preflight` and the crawler use; they never parse YAML themselves

**Checkpoint**: Fingerprint, schemas, DB, evidence/PII and the full config loaders work; user stories can begin.

---

## Phase 3: User Story 2 - Guarantee that production is only read (Priority: P1) 🎯 built first

**Goal**: Code-level guarantees (outside the agent) that a production run is read-only, in scope, rate-limited, compliant (FR-026), refused without the flag, and stops on a block.

**Independent Test**: Per spec US2: run the environment guard with a missing/non-production flag, null compliance values or a placeholder User-Agent; feed the classifier and scope checker mutating/denylisted/out-of-scope actions and URLs; feed the block detector a 403/CAPTCHA fixture; verify each is refused/stopped, with the rule named.

### Tests for User Story 2 (write first, must fail)

- [ ] T031 [P] [US2] Create labeled action-descriptor fixtures `tests/fixtures/actions/actions.json` covering read (nav link, search, filter, pagination), mutating (submit form, add to favourites), destructive (delete, logout), external-side-effect (message/contact seller, show phone number, place bid, buy now, payment), and ambiguous cases, each with expected class
- [ ] T032 [P] [US2] Write `packages/safety/tests/classifier.test.ts`: every fixture classified as expected; returns the MOST dangerous class across signals; ambiguous or conflicting signals resolve to non-read (FR-004); a persona/agent-supplied class cannot lower the result
- [ ] T033 [P] [US2] Write `packages/safety/tests/env-guard.test.ts`: production URL + config without `environment: production` → refused; `environment: production` + persona ceiling above `read` → effective ceiling `read`; the portal ceiling is its `max_action_class` (default `read` on production) and staging/sandbox permits above-read only when the portal declares it (FR-005, FR-018); refusal is synchronous and needs no browser
- [ ] T034 [P] [US2] Write `packages/safety/tests/scope-denylist.test.ts`: out-of-domain, out-of-path, external-link policy `record` (recorded, not followed), each denylist rule id (logout, delete, payment, bidding, buy_now, message_or_contact_seller, reveal_seller_contact) `path:/oferty/wystaw/*` and built-in path patterns for logout/delete/payment (PL/EN, e.g. `/wyloguj`, `/logout`) refused when the URL is proposed to `navigate`, and the refusal names the rule (FR-007)
- [ ] T035 [P] [US2] Write `packages/safety/tests/block-detector.test.ts` using fixtures in `tests/fixtures/har/`: HTTP 403/429, CAPTCHA vendor iframe/form markers, and a portal-configured block signature are detected; a normal 200 page and a 404 are not (FR-008)
- [ ] T036 [P] [US2] Write `packages/crawler/tests/rate-limiter.test.ts`: token bucket honours `requests_per_second` and `max_concurrency`; once halted (block detected) it issues no further permits (SC-007)

### Implementation for User Story 2

- [ ] T037 [US2] Implement `packages/safety/src/classifier.ts`: pure rules engine over role, label keywords (PL + EN: delete/usuń, pay/zapłać, send/wyślij, logout/wyloguj, bid/licytuj, buy now/kup teraz, message/contact seller, show phone), triggered HTTP method, form semantics; also `classifyUrl(url)` for navigations against the built-in path patterns; returns most dangerous class; unknown → unsafe (research §4). Keywords and portal rules are data, not special-cased logic (T032)
- [ ] T038 [P] [US2] Implement `packages/safety/src/scope.ts` and `packages/safety/src/denylist.ts`: allowed domains/paths, external-link policy, depth/state/per-state-action/time/step budget checks, denylist rule-id (each id carries keyword and PL/EN path patterns) and `path:` glob matching, applied to both actions and navigated URLs; every refusal returns the rule that caused it (T034)
- [ ] T039 [US2] Implement `packages/safety/src/env-guard.ts`: `assertRunAllowed(portal, persona)` refusing production without the explicit flag and computing `effectiveMaxActionClass = minSafetyClass(portal.max_action_class ?? read-on-production, persona.max_action_class)` using the T012 helper (T033; FR-005, FR-018)
- [ ] T040 [P] [US2] Implement `packages/safety/src/block-detector.ts` (status codes, CAPTCHA markers, configurable portal signatures) (T035)
- [ ] T041 [P] [US2] Implement `packages/crawler/src/rate-limiter.ts`: token bucket + concurrency cap with a `halt()` that permanently denies further permits (T036)
- [ ] T042 [US2] Implement the single request choke point `packages/crawler/src/request-gate.ts`: wraps Playwright route interception; applies rate limiter, sets the configured identifiable `User-Agent`/header (FR-006), runs block detection on every response and on detection returns a stop event (warning text) and halts the limiter; the caller (run lifecycle) persists the warning and sets `stopped_warning`, with no bypass attempt (FR-008) — depends on T040, T041
- [ ] T043 [US2] Implement preflight in `packages/crawler/src/preflight.ts` as a function `preflight(portalId, personaId)` called first by the `start_run` MCP tool: load via `loadEffectiveConfig` (T030), call `assertRunAllowed`, and return a structured refusal (`ENV_GUARD_REFUSED` / `CONFIG_INVALID`) BEFORE launching any browser or making any request, also refusing a production run while any `compliance` value is null or `rate_limit.user_agent` contains `example.com` (FR-026); completes in <5s (SC-006). Add `packages/crawler/tests/preflight.test.ts` asserting no browser launch or network call occurs on refusal, each refusal reason, and that refusal returns in under 5s
- [ ] T044 [US2] Implement the action-execution gate `packages/crawler/src/action-gate.ts` as a pure decision function: for every proposed action (a server-issued `action_id` from `act`, or a URL from `navigate`) apply classifier/`classifyUrl` → scope → denylist → effective ceiling → budgets and return `{allowed}` or `{refused, status (skipped_unsafe | out_of_scope | denylisted | budget_reached), rule, reason}`. It does not persist anything; the `navigate`/`act` tools (T061) write the frontier item and decision-log entry from a refusal and return `ACTION_REFUSED` (FR-004, FR-010, FR-021). The agent has no code path that bypasses this gate (Principle III/V)

**Checkpoint**: The guard layer is complete and independently testable with no browser and no LLM. The gates return decisions and events; persistence happens in US1 (the `navigate`/`act` tools and run lifecycle).

---

## Phase 4: User Story 1 - Map a portal as a guest (Priority: P1) 🎯 MVP

**Goal**: A `map` run for the guest persona on MarketSite records states, transitions, forms, API calls, frontier items, rule candidates and open questions, all with evidence and confidence.

**Independent Test**: Run one `map` run within budget; verify the map exists, every record cites evidence and a confidence label, the frontier report lists skipped actions with reasons, near-duplicate listing pages cluster, and no non-read action executed (quickstart §2–§4).

### Configuration files for the target

- [ ] T045 [P] [US1] Create `portals/marketsite/portal.yaml` exactly per `contracts/config-schema.md` (`environment: production`, scope caps, denylist incl. `path:/oferty/wystaw/*`, obstacles, `rate_limit` with an identifiable User-Agent whose contact address the maintainer fills in, `item_view_cap`, `item_route_templates`, `max_action_class` omitted (defaults to read), `compliance` values null with a `# TODO(T072)` note so production runs are refused until a person fills them in). Obstacle selectors are placeholders to be verified against the live site in T059
- [ ] T046 [P] [US1] Create `personas/marketsite/guest.yaml` per the contract (`auth: none`, `max_action_class: read`, consent declines location/marketing/personalization per FR-023, viewport 1366×768, `locale: pl-PL`)

### MCP server (tests first — these are the Principle II/V enforcement points)

- [ ] T047 [P] [US1] Write `packages/mcp-server/tests/recording-services.test.ts` for the server-internal services: `record_state`, `record_transition`, `record_form` reject a missing/empty `evidence_ref` with `MISSING_EVIDENCE`, invalid confidence with `INVALID_CONFIDENCE`, bad shape with `SCHEMA_INVALID`; `record_state` is idempotent by fingerprint (`created: false`); ids are server-generated and no client-supplied id is accepted; nothing accepts SQL
- [ ] T048 [P] [US1] Write `packages/mcp-server/tests/record-transition-safety.test.ts`: `status: executed` with a non-read class on a production run → `UNSAFE_ACTION_EXECUTED`; a supplied `safety_class` that differs from the server-side `safety` package re-derivation is rejected (agent claims "read" for a bid button); skipped transitions with any class are accepted
- [ ] T049 [P] [US1] Write `packages/mcp-server/tests/record-api-call.test.ts`: payload that looks like raw PII → `PII_SUSPECTED`; shape-only records accepted; `edge_id` optional (passive load)
- [ ] T050 [US1] Implement the `pathfinder` MCP server scaffold `packages/mcp-server/src/server.ts` (`@modelcontextprotocol/sdk`, stdio, Zod validation of every input/output against `packages/core` schemas, DB via `packages/core`), shared error codes `packages/mcp-server/src/errors.ts` (per contracts/mcp-tools.md), the run-stopped guard applied to every browser-touching tool (`RUN_STOPPED` after a block or budget exhaustion), and the `start_run` tool (calls `preflight` T043 first, then creates or resumes the run, launches the session T059)
- [ ] T051 [P] [US1] Implement the server-internal services `record_state`, `record_form` and the agent-facing tools `get_known_states`, `add_open_question`, `add_rule_candidate` (server resolves `about_ref` to copy its `evidence_ref`, forces `confidence: inferred`, `UNKNOWN_REF` otherwise) in `packages/mcp-server/src/{services,tools}/`, including inserting `state_observations` (T047). Recording services are NOT exposed as agent tools
- [ ] T052 [US1] Implement the `record_transition` service in `packages/mcp-server/src/services/record-transition.ts`: re-derive `safety_class` with `packages/safety`, reject mismatches, enforce `UNSAFE_ACTION_EXECUTED` (T048). The `action.locators` array is required (ranked `role | label | text | test_id | container`)
- [ ] T053 [P] [US1] Implement the `record_api_call` and `add_frontier_item` services and the agent-facing `get_next_frontier_item` tool in `packages/mcp-server/src/` (`record_api_call` uses `looksLikeRawPayload` from T018; `get_next_frontier_item` reads the queue from T058) (T049)
- [ ] T054 [US1] Implement the `complete_run` service in `packages/mcp-server/src/services/complete-run.ts` (computes and stores `coverage` — states, actions executed, actions skipped by class, API endpoints seen — FR-021, sets status) and the agent-facing `finish_run` tool, which only requests completion: the server verifies the frontier is empty or a budget is exhausted (`FRONTIER_NOT_EMPTY` otherwise) and the agent can never set `status` or `warning`

### Obstacles and crawler runtime

- [ ] T055 [P] [US1] Implement `packages/obstacles/src/index.ts`: register obstacle handlers from portal `obstacles` config and persona `consent` via Playwright `addLocatorHandler`, so banners/popups/chat widgets are dismissed before a state is recorded (FR-019, FR-023); selectors come from config, not code
- [ ] T056 [P] [US1] Implement `packages/crawler/src/stabilizer.ts` (research §3): network-idle window + MutationObserver quiet period + no running CSS animations, hard timeout sets the record's `stabilization` to `never_stabilized` (recorded with evidence, never discarded)
- [ ] T057 [P] [US1] Implement `packages/crawler/src/observer.ts`: capture the canonicalized ARIA snapshot (written via T020 evidence store; no screenshots in v1), extract forms with fields/types/required/constraints/options/validation messages WITHOUT submitting (FR-011), capture network calls (method, URL template, status, req/res shape) and console errors/failed requests per state and per action (FR-012). Also the action extractor `packages/crawler/src/action-extractor.ts`: derive candidate actions from the ARIA tree (links, buttons, menu items, tabs, comboboxes, clickable elements), classify each with `packages/safety`, and issue server-side `action_id`s bound to the current state (the only ids `act` accepts). Records only calls the page itself makes — never calls the portal's APIs directly (FR-025). Minimal locator: role + accessible name (ranking extended in US4)
- [ ] T058 [P] [US1] Implement `packages/crawler/src/frontier.ts` (research §10): priority queue by depth (BFS) with novelty boost, sliding window over recent cluster ids to stop a same-cluster branch after N results, per-template and total caps; persists to the DB so a run can resume (FR-020); enforces `item_view_cap` (an item page = a route template listed in the portal's `item_route_templates`) and counts item-page visits for the report (FR-024)
- [ ] T059 [US1] Implement `packages/crawler/src/session.ts`: launches Playwright (in the mcp-server process) with viewport/locale from the effective persona, installs the request gate (T042) and obstacle handlers (T055), records the run row (persona, portal, environment version/date, viewport, locale, browser, resolved `config_snapshot` — FR-020). Verify and correct the placeholder obstacle selectors in `portals/marketsite/portal.yaml` on first supervised run
- [ ] T060 [US1] Write the crawler subagent `.claude/agents/crawler.md` (same format as `.claude/agents/db-admin.md`): frontmatter `tools:` listing ONLY `mcp__pathfinder__start_run`, `mcp__pathfinder__get_known_states`, `mcp__pathfinder__get_next_frontier_item`, `mcp__pathfinder__navigate`, `mcp__pathfinder__act`, `mcp__pathfinder__add_open_question`, `mcp__pathfinder__add_rule_candidate`, `mcp__pathfinder__finish_run` (never omit `tools:`; no Bash, Edit, Write, WebFetch, WebSearch or other MCP servers). Body derived from `user_input/raw_idea/agents/crawler.md` (map mode only): start with `start_run`, explore via `get_next_frontier_item`/`navigate`/`act`, facts only, flag inferences, intent only as open questions (FR-002), never attempt to work around a refusal, block or `RUN_STOPPED` — stop and report; resume with `resume_run_id`
- [ ] T061 [US1] Implement the `navigate` and `act` tools in `packages/mcp-server/src/tools/{navigate,act}.ts` as the full pipeline: action gate (T044) → rate-limited request through the request gate (T042) → obstacle handling → stabilizer (T056) → observer/action extractor (T057) → fingerprint (`packages/fingerprint`) → recording services (T051–T053) → response per contracts/mcp-tools.md. Every merge/split/skip/refusal goes to the decision log (FR-009, FR-021)
- [ ] T062 [US1] Implement run lifecycle and resume in `packages/crawler/src/run.ts` (used by `start_run`/`finish_run`): budget/step/time/depth enforcement in the server (FR-007; there is no external turn limit), agent interruption → `interrupted`, `start_run { resume_run_id }` resumes from persisted frontier/visited state without re-recording any state or edge (FR-020, SC-010), block → `stopped_warning` with the run-stopped guard from T050, completion via `complete_run`
- [ ] T063 [P] [US1] Implement the frontier report and coverage output in `packages/crawler/src/report.ts`: lists every skipped action with class and reason (not read-only, out of scope, denylisted, budget reached, unreachable), states/actions/skipped-by-class/API-endpoints coverage, and the number of item-page visits made (FR-010, FR-021, FR-024)
- [ ] T064 [US1] Register the server in the repo-root `.mcp.json` (server name `pathfinder`, stdio, command running the `mcp-server` package) and write `packages/mcp-server/tests/agent-lockdown.test.ts`: parse `.claude/agents/crawler.md` frontmatter and assert `tools:` is present and contains exactly the agent-facing tool names of contracts/mcp-tools.md (no Bash, Edit, Write, WebFetch, WebSearch or non-`pathfinder` MCP tools), and that the server's registered agent-facing tool list excludes every recording service and `complete_run`
- [ ] T065 [US1] Write an integration test `packages/mcp-server/tests/map-run.test.ts` using an MCP client against a local mock portal (static fixture server, ARIA fixtures incl. a bid/buy-now button, a listing page duplicate, a form, a 403 page): asserts states/edges/forms/network_calls all carry `evidence_ref` + `confidence` (SC-003), all executed edges are `read` (SC-002), the duplicate listing joins an existing cluster, mutating buttons appear in the frontier with `denylisted`, `act` with an unissued `action_id` returns `UNKNOWN_ACTION`, `start_run` on a production config without the flag, with null `compliance` values, or with a placeholder User-Agent is refused with no request made, `navigate` to a logout URL is refused, every request the mock portal receives carries the configured User-Agent and respects the rate limit, the servers make no direct HTTP calls of their own (FR-025: also grep `packages/mcp-server` and `packages/crawler` for direct `fetch`/`http` client use outside Playwright), the 403 stops the run with `stopped_warning`, zero further requests and `RUN_STOPPED` on later calls even when repeatedly called (SC-007), and interrupt + `resume_run_id` produces no duplicate edges (SC-010)

**Checkpoint**: A guest `map` run works end-to-end against the mock portal; ready for the manual gate in T072 before any live run. The subagent itself is exercised by the quickstart (T073) since it needs a Claude Code session.

---

## Phase 5: User Story 3 - Portals and personas as reusable configuration (Priority: P2)

**Goal**: Composable personas via `extends`/mixins demonstrated on the real files. The loaders, cycle and secret rejection and ceiling logic already exist (Foundational).

**Independent Test**: Load the guest persona and a second sample persona extending it plus a mixin; both resolve; invalid files are rejected naming the file and problem (quickstart §6).

- [ ] T066 [P] [US3] Create `personas/_mixins/anonymous-base.yaml` and refactor `personas/marketsite/guest.yaml` to `extends: ["../_mixins/anonymous-base.yaml"]` only if the resolved result is unchanged (verify with a config test); add a test `packages/config/tests/persona-samples.test.ts` that loads the real files, and add sample `personas/marketsite/guest-mobile.yaml` (`extends: ["guest.yaml"]`, different `viewport` only) demonstrating SC-008

**Checkpoint**: A new persona is added by writing one file and resolves with no crawler change.

---

## Phase 6: User Story 4 - Hand locators to QA (Priority: P3)

**Goal**: Every recorded action carries ranked candidate locators and a snapshot reference.

**Independent Test**: Sample recorded actions incl. elements with `data-testid`; each has ranked locators and a snapshot reference (quickstart §7).

- [ ] T067 [P] [US4] Write `packages/crawler/tests/locators.test.ts` with element fixtures: ranking order role+name → label/text → `test_id` → container (Principle/Technical Constraints locator priority); an element exposing `data-testid` always includes a `test_id` candidate; elements lacking an accessible name still get at least a text or container candidate
- [ ] T068 [US4] Implement `packages/crawler/src/locators.ts` (ranked candidate builder returning `{kind, value, rank}[]` plus the ARIA snapshot `evidence_ref`) and integrate it into `observer.ts`/`action-extractor.ts` and the `act` tool's transition recording in place of the minimal role+name locator from T057 (T067; FR-013)
- [ ] T069 [US4] Extend `packages/mcp-server/tests/map-run.test.ts` with a fixture element carrying `data-testid` and assert the recorded transition's `action_json.locators` contains it and references a snapshot

**Checkpoint**: All four stories work independently.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [ ] T070 [P] Write `scripts/stability-check.ts` comparing two runs' matched-state fingerprints to measure SC-005 (≥90% stable) and a `scripts/pii-audit.ts` that scans `data/evidence/` (masked ARIA snapshots and network shapes; no screenshots exist in v1) and DB rows for unmasked emails/phones/tokens for SC-004
- [ ] T071 [P] Add a `README.md` at repo root (or `packages/crawler/README.md`) documenting how to invoke the crawler subagent, config files and safety model; keep `specs/001-crawler-map-mode/quickstart.md` in sync with any tool or subagent changes
- [ ] T072 **MANUAL GATE (blocks the first live production run; enforced by `preflight` via FR-026)**: a person (a) reviews the operator's main Regulamin and any API terms for automated-access clauses (spec Assumptions: annex reviewed, main Regulamin NOT yet reviewed), (b) re-checks `robots.txt` (constitution Principle V; last fetched 2026-09-20), and then fills `compliance.robots_checked_on`, `compliance.terms_reviewed_on`, `compliance.terms_reviewed_by` in `portals/marketsite/portal.yaml` and replaces the placeholder contact address in `rate_limit.user_agent`. Until then `start_run` refuses production. Not a code task
- [ ] T073 Run `quickstart.md` §1–§9 in order after T072; record any deviations. §1 and §5 (guard refusal, block stop) may be run before T072 against the mock server; §2–§4, §7–§9 need the live portal
- [ ] T074 Security/safety review pass: confirm no code path executes a browser action or portal request outside `action-gate.ts`/`request-gate.ts`, the subagent's tool list still matches `agent-lockdown.test.ts` (T064), and no other `.mcp.json` server or agent file gives the crawler direct browser or network access. Then run the subagent once with a prompt telling it to bypass the guards and confirm refusal

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (1)** → **Foundational (2)** → all stories
- Foundational internal order follows the constitution: fingerprint → core (T014 via db-admin) → config loaders
- **US2 (Phase 3)** depends only on Foundational; it is built before US1 (see Organization)
- **US1 (Phase 4)** depends on Foundational AND US2 (`safety`, gates, request gate)
- **US3 (Phase 5)** depends on Foundational and on the guest persona file (T046) existing
- **US4 (Phase 6)** depends on US1 (extends `observer.ts` and the run integration test)
- **Polish (7)** depends on all stories; T073's live steps depend on T072

### Within Stories

- Test tasks before their implementation task; confirm they fail first
- Pure packages (`fingerprint`, `safety`, `config`, PII scrubber) have passing tests before dependents build on them (constitution Development Workflow)
- Within US1: MCP tools (T047–T054) and runtime pieces (T055–T058) are independent tracks; `navigate`/`act` (T061) need both; T060 (subagent file) and T064 (`.mcp.json` + lockdown test) can be written once the tool names in the contract are fixed

### Parallel Opportunities

- Setup: T003, T004, T005 together
- Foundational: the fingerprint tests, core Zod work, and config schemas are independent tracks (T014 goes to db-admin in parallel with the Zod work, but T015 waits on it)
- US2 tests T031–T036 all parallel; then T038, T040, T041 parallel
- US1: MCP track and T045/T046/T055/T056/T057/T058 parallel
- US3 and US4 tasks are small and can be done by different people once their dependencies hold

### Parallel Example: User Story 2

```bash
Task: "Write packages/safety/tests/classifier.test.ts"
Task: "Write packages/safety/tests/env-guard.test.ts"
Task: "Write packages/safety/tests/scope-denylist.test.ts"
Task: "Write packages/safety/tests/block-detector.test.ts"
Task: "Write packages/crawler/tests/rate-limiter.test.ts"
```

---

## Implementation Strategy

### MVP (US2 + US1)

1. Phase 1 Setup, Phase 2 Foundational
2. Phase 3 US2 (guard) — validate with unit tests only, no browser
3. Phase 4 US1 — validate against the mock portal (T065)
4. Complete manual gate T072, then a supervised first live run with a small budget (`max_states`, `max_steps` reduced) and inspect the frontier report before raising limits

### Incremental Delivery

1. Add US3 (composition demo) → SC-008
2. Add US4 (locators) → SC-009 check
3. Polish, full quickstart run

---

## Notes

- `[DB-ADMIN]` tasks must go through the `db-admin` subagent; if any later task needs a schema change, route it there as a new migration
- The agent must never gain a code path to browser actions, requests or DB writes that bypasses the gates and MCP tools (Principle III/V)
- Commit after each task or logical group; stop at any checkpoint to validate
