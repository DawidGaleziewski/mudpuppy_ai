---

description: "Task list for Crawler Map Mode"
---

# Tasks: Crawler Map Mode

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

pnpm-workspace monorepo per plan.md: `apps/crawler/packages/<name>/src/`, `apps/crawler/packages/<name>/tests/`, `portals/`, `personas/`, `apps/crawler/tests/fixtures/`, `data/`.

---

## Phase 1: Setup (Shared Infrastructure)

- [X] T001 Create pnpm workspace root: `package.json` (`engines.node >=22`, private), `pnpm-workspace.yaml` (`packages/*`), `tsconfig.base.json` (`strict: true`, ESM, `moduleResolution: bundler`)
- [X] T002 Scaffold the seven package folders each with `package.json`, `tsconfig.json` extending the base, `src/index.ts`, `tests/`: `apps/crawler/packages/core`, `apps/crawler/packages/fingerprint`, `apps/crawler/packages/safety`, `apps/crawler/packages/config`, `apps/crawler/packages/obstacles`, `apps/crawler/packages/mcp-server`, `apps/crawler/packages/crawler`. Declare workspace deps per plan.md: core → `zod`, `better-sqlite3`, `kysely`, `pino`; config → `zod`, `yaml`; mcp-server → `@modelcontextprotocol/sdk` and the workspace packages; crawler (browser runtime library used in-process by mcp-server) → `playwright` (library, NOT `@playwright/test`). No LLM SDK: the agent runtime is the Claude Code subagent (research.md §11)
- [X] T003 [P] Add Vitest root config `vitest.config.ts` (`test.projects: ['packages/*']`, since `vitest.workspace` files were removed in Vitest 4) with a per-package `vitest.config.ts` including `tests/**/*.test.ts`, plus a root `test` script
- [X] T004 [P] Add ESLint + Prettier config at repo root and a root `typecheck` script running `tsc --noEmit` across packages
- [X] T005 [P] Create `apps/crawler/tests/fixtures/{aria,har,actions,urls}/` with a `apps/crawler/tests/fixtures/README.md` describing what each folder holds (saved ARIA snapshots, HARs, labeled action descriptors, URL lists)
- [X] T006 Verify `.gitignore` excludes `data/db/*.sqlite*` and `data/evidence/*` (keeping the `.gitkeep` files), and excludes `node_modules`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Everything every story needs, in the constitution's build order.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

### Fingerprint (pure; first in the build order, tests before implementation)

- [X] T007 [P] Create fixtures: `apps/crawler/tests/fixtures/urls/marketsite-urls.json` (URL list incl. tracking params, numeric/slug ids, query variants) and `apps/crawler/tests/fixtures/aria/` snapshots (listing page ×2 with different items, search results, a distinct form page, one with an open overlay)
- [X] T008 [P] Write `apps/crawler/packages/fingerprint/tests/route-template.test.ts` (research §2): RFC 3986 normalization, tracking-param stripping, sorted query, fragment dropping, trie collapse of high-cardinality/numeric/UUID/hash segments to `:param`, low-cardinality segments stay literal
- [X] T009 [P] Write `apps/crawler/packages/fingerprint/tests/fingerprint.test.ts` (research §1): L1 `sha256(routeTemplate + canonicalARIATree + openOverlays)` is stable across reruns and masks volatile content (prices, counters, timestamps); two listing fixtures with different items share an L2 cluster (default threshold 0.9) while the distinct form page does not; merge/split decisions are returned as loggable records (FR-009)
- [X] T010 Implement `apps/crawler/packages/fingerprint/src/route-template.ts` (T008)
- [X] T011 Implement `apps/crawler/packages/fingerprint/src/aria-canonical.ts` (canonicalize + mask volatile content) and `apps/crawler/packages/fingerprint/src/fingerprint.ts` (two-level fingerprint, SimHash/MinHash shingles of role+name, cluster assignment, decision records) (T009)

### Core: schemas, storage, evidence, PII

- [X] T012 [P] Define shared Zod enums in `apps/crawler/packages/core/src/schemas/common.ts`: `SafetyClass` (`read | mutating | destructive | external-side-effect`), `Confidence` (`observed | inferred | needs_confirmation`), `RunStatus` (`running | completed | stopped_warning | interrupted`), `FrontierStatus` (`skipped_unsafe | out_of_scope | denylisted | budget_reached | unreachable`), `EdgeStatus` (`executed | skipped`), and a pure `minSafetyClass(a, b)` helper with the danger ordering read < mutating < destructive < external-side-effect (used by `config` and `safety` for the FR-018 ceiling)
- [X] T013 [P] Define Zod record schemas in `apps/crawler/packages/core/src/schemas/`: `run.ts`, `state.ts`, `edge.ts`, `form.ts`, `network-call.ts`, `frontier.ts`, `open-question.ts`, `rule-candidate.ts`, matching `data-model.md` field-for-field. Constraints to encode verbatim: `state.fingerprint` "string (sha256) — Unique"; `run.mode` is `"map"` but the schema MUST be extensible to `"trace"` without change (FR-022); `edge.to_state` nullable; `edge.error` "JSON | null"; `network_call.edge_id` "string | null"; `req_schema`/`res_schema` "shape only — no PII payloads"; State and Edge carry `stabilization` "settled | never_stabilized"; `rule_candidate.confidence` is fixed to `inferred`; `evidence_ref` and `confidence` REQUIRED (non-empty) on State, Edge, Form (Principle II, FR-003)
- [X] T014 [DB-ADMIN] Write migration `data/migrations/0001_init.*` (reversible) creating `runs`, `states`, `state_observations(state_id, run_id, persona_id, evidence_ref)`, `edges`, `forms`, `network_calls`, `frontier`, `open_questions`, `rule_candidates` per `data-model.md` (including the `stabilization` columns on `states` and `edges`), with a unique index on `states.fingerprint`, indexes for the lookups the MCP tools need (`states.cluster_id`, `edges.run_id`, `frontier.run_id`), and NOT NULL on every `evidence_ref`/`confidence` column of State/Edge/Form. Also decide and document (in `data/schema/`) how the FR-021 decision log is persisted (a `decision_log` table vs. pino JSONL file) and how the server-owned frontier is persisted for `get_next_frontier_item` and resume (FR-020): the `frontier` status enum only covers skipped items, so decide on a `pending` status and/or a queue table plus visited set, and update `data-model.md`. Regenerate the `data/schema/` snapshot
- [X] T015 Implement DB access in `apps/crawler/packages/core/src/db.ts` (better-sqlite3 + Kysely, one file per environment under `data/db/`) and a migration runner `apps/crawler/packages/core/src/migrate.ts` that applies `data/migrations/` (depends on T014)
- [X] T016 [P] Implement server-side id generation in `apps/crawler/packages/core/src/ids.ts` (uuid); no API accepts client-chosen ids for new rows
- [X] T017 [P] Write Vitest tests for the PII scrubber in `apps/crawler/packages/core/tests/pii.test.ts` (names, emails, phone numbers, tokens in ARIA text and JSON payload shapes; masked output is deterministic) using samples in `apps/crawler/tests/fixtures/aria/`
- [X] T018 Implement pure PII scrubber `apps/crawler/packages/core/src/pii.ts` (regex/type-based masking, plus a `looksLikeRawPayload()` check used by `record_api_call`) so T017 passes (FR-014)
- [X] T019 [P] Write Vitest tests in `apps/crawler/packages/core/tests/evidence.test.ts`: identical content stored once (sha256 addressing), PII masked BEFORE the file is written, returned `evidence_ref` resolves to `data/evidence/<sha256>.<ext>`
- [X] T020 Implement evidence store `apps/crawler/packages/core/src/evidence.ts` (masks via T018, hashes, writes `data/evidence/<sha256>.<ext>`, returns ref) so T019 passes. Screenshots are NOT stored in v1 (regex masking cannot redact pixels; research §9): evidence is masked ARIA snapshots and network shape records only (depends on T018)
- [X] T021 [P] Implement pino logger and decision-log writer in `apps/crawler/packages/core/src/log.ts` (structured JSON; entry kinds: skip, refuse, merge, split, warning — FR-021), persisting per the T014 decision

### Config: portal and persona loaders (pure; tests before implementation)

- [X] T022 [P] Define Zod `PortalConfig` schema in `apps/crawler/packages/config/src/portal-schema.ts` per `contracts/config-schema.md`: `environment` required enum `production | staging | sandbox`; `denylist` entries must be a known rule id or a `path:` glob (unknown free text rejected); `rate_limit` REQUIRED when `environment: production`; `scope`, `obstacles`, `item_view_cap` fields as in the contract; plus optional `max_action_class` (defaults to `read` for production), `item_route_templates` (string[]) and `compliance` `{robots_checked_on, terms_reviewed_on, terms_reviewed_by}` whose values may be null (the file still loads; `preflight` refuses production while any is null — FR-026)
- [X] T023 [P] Define Zod `PersonaConfig` schema in `apps/crawler/packages/config/src/persona-schema.ts` per data-model.md (`id`, `extends`, `auth: "none" | {…refs}`, `max_action_class`, `scope_restrictions`, `budgets`, `consent`, `viewport`, `locale`)
- [X] T024 Implement `loadPortal(path)` in `apps/crawler/packages/config/src/load-portal.ts` (YAML parse + T022 validation; errors name the file and the problem — FR-017) and Vitest tests `apps/crawler/packages/config/tests/load-portal.test.ts` (valid file, missing `environment`, production without `rate_limit`, unknown denylist entry, `compliance` with nulls still loads)
- [X] T025 [P] Write `apps/crawler/packages/config/tests/persona-extends.test.ts`: depth-first resolution in `extends` order with the target applied last so later entries override earlier ones field by field; array fields use explicit override (no implicit concatenation — research §5); mixin resolved from `personas/_mixins/`
- [X] T026 [P] Write `apps/crawler/packages/config/tests/persona-rejections.test.ts`: circular `extends` fails naming the offending file; inline credential value (not a `ref:` name) fails naming the file and field; schema mismatch fails naming the file and problem (FR-017)
- [X] T027 [P] Write `apps/crawler/packages/config/tests/ceiling.test.ts`: persona `max_action_class` above the portal's → effective is the lower; persona lower than portal → persona wins (FR-018)
- [X] T028 Implement `apps/crawler/packages/config/src/load-persona.ts`: recursive `extends` resolution with visited-set cycle detection before merging, field-level merge, validation of inputs and merged output with the T023 schema (T025, T026)
- [X] T029 [P] Implement inline-secret detection in `apps/crawler/packages/config/src/secrets.ts`: `auth` credential fields must be `ref:`-prefixed names; literal secret-shaped values rejected (T026)
- [X] T030 Implement `loadEffectiveConfig(portalPath, personaPath)` in `apps/crawler/packages/config/src/effective.ts` returning `EffectiveConfig { portal, persona, effectiveMaxActionClass }` per the contract, computing the ceiling with `minSafetyClass` from `apps/crawler/packages/core` (T012) and the portal's `max_action_class` (default `read` on production), so `config` does not depend on `safety` (T027). This is the only config entry point `preflight` and the crawler use; they never parse YAML themselves

**Checkpoint**: Fingerprint, schemas, DB, evidence/PII and the full config loaders work; user stories can begin.

---

## Phase 3: User Story 2 - Guarantee that production is only read (Priority: P1) 🎯 built first

**Goal**: Code-level guarantees (outside the agent) that a production run is read-only, in scope, rate-limited, compliant (FR-026), refused without the flag, and stops on a block.

**Independent Test**: Per spec US2: run the environment guard with a missing/non-production flag, null compliance values or a placeholder User-Agent; feed the classifier and scope checker mutating/denylisted/out-of-scope actions and URLs; feed the block detector a 403/CAPTCHA fixture; verify each is refused/stopped, with the rule named.

### Tests for User Story 2 (write first, must fail)

- [X] T031 [P] [US2] Create labeled action-descriptor fixtures `apps/crawler/tests/fixtures/actions/actions.json` covering read (nav link, search, filter, pagination), mutating (submit form, add to favourites), destructive (delete, logout), external-side-effect (message/contact seller, show phone number, place bid, buy now, payment), and ambiguous cases, each with expected class
- [X] T032 [P] [US2] Write `apps/crawler/packages/safety/tests/classifier.test.ts`: every fixture classified as expected; returns the MOST dangerous class across signals; ambiguous or conflicting signals resolve to non-read (FR-004); a persona/agent-supplied class cannot lower the result
- [X] T033 [P] [US2] Write `apps/crawler/packages/safety/tests/env-guard.test.ts`: production URL + config without `environment: production` → refused; `environment: production` + persona ceiling above `read` → effective ceiling `read`; the portal ceiling is its `max_action_class` (default `read` on production) and staging/sandbox permits above-read only when the portal declares it (FR-005, FR-018); refusal is synchronous and needs no browser
- [X] T034 [P] [US2] Write `apps/crawler/packages/safety/tests/scope-denylist.test.ts`: out-of-domain, out-of-path, external-link policy `record` (recorded, not followed), each denylist rule id (logout, delete, payment, bidding, buy_now, message_or_contact_seller, reveal_seller_contact — spec 002 made `bidding`/`buy_now`, `message_or_contact_seller` and `reveal_seller_contact` aliases of `purchase`, `contact_or_message` and `reveal_contact` respectively, spec 002 FR-013) `path:/oferty/wystaw/*` and built-in path patterns for logout/delete/payment (PL/EN, e.g. `/wyloguj`, `/logout`) refused when the URL is proposed to `navigate`, and the refusal names the rule (FR-007)
- [X] T035 [P] [US2] Write `apps/crawler/packages/safety/tests/block-detector.test.ts` using fixtures in `apps/crawler/tests/fixtures/har/`: HTTP 403/429, CAPTCHA vendor iframe/form markers, and a portal-configured block signature are detected; a normal 200 page and a 404 are not (FR-008)
- [X] T036 [P] [US2] Write `apps/crawler/packages/crawler/tests/rate-limiter.test.ts`: token bucket honours `requests_per_second` and `max_concurrency`; once halted (block detected) it issues no further permits (SC-007)

### Implementation for User Story 2

- [X] T037 [US2] Implement `apps/crawler/packages/safety/src/classifier.ts`: pure rules engine over role, label keywords (PL + EN: delete/usuń, pay/zapłać, send/wyślij, logout/wyloguj, bid/licytuj, buy now/kup teraz, message/contact seller, show phone), triggered HTTP method, form semantics; also `classifyUrl(url)` for navigations against the built-in path patterns; returns most dangerous class; unknown → unsafe (research §4). Keywords and portal rules are data, not special-cased logic (T032)
- [X] T038 [P] [US2] Implement `apps/crawler/packages/safety/src/scope.ts` and `apps/crawler/packages/safety/src/denylist.ts`: allowed domains/paths, external-link policy, depth/state/per-state-action/time/step budget checks, denylist rule-id (each id carries keyword and PL/EN path patterns) and `path:` glob matching, applied to both actions and navigated URLs; every refusal returns the rule that caused it (T034)
- [X] T039 [US2] Implement `apps/crawler/packages/safety/src/env-guard.ts`: `assertRunAllowed(portal, persona)` refusing production without the explicit flag and computing `effectiveMaxActionClass = minSafetyClass(portal.max_action_class ?? read-on-production, persona.max_action_class)` using the T012 helper (T033; FR-005, FR-018)
- [X] T040 [P] [US2] Implement `apps/crawler/packages/safety/src/block-detector.ts` (status codes, CAPTCHA markers, configurable portal signatures) (T035)
- [X] T041 [P] [US2] Implement `apps/crawler/packages/crawler/src/rate-limiter.ts`: token bucket + concurrency cap with a `halt()` that permanently denies further permits (T036)
- [X] T042 [US2] Implement the single request choke point `apps/crawler/packages/crawler/src/request-gate.ts`: wraps Playwright route interception; applies rate limiter, sets the configured identifiable `User-Agent`/header (FR-006), runs block detection on every response and on detection returns a stop event (warning text) and halts the limiter; the caller (run lifecycle) persists the warning and sets `stopped_warning`, with no bypass attempt (FR-008) — depends on T040, T041
- [X] T043 [US2] Implement preflight in `apps/crawler/packages/crawler/src/preflight.ts` as a function `preflight(portalId, personaId)` called first by the `start_run` MCP tool: load via `loadEffectiveConfig` (T030), call `assertRunAllowed`, and return a structured refusal (`ENV_GUARD_REFUSED` / `CONFIG_INVALID`) BEFORE launching any browser or making any request, also refusing a production run while any `compliance` value is null or `rate_limit.user_agent` contains `example.com` (FR-026); completes in <5s (SC-006). Add `apps/crawler/packages/crawler/tests/preflight.test.ts` asserting no browser launch or network call occurs on refusal, each refusal reason, and that refusal returns in under 5s
- [X] T044 [US2] Implement the action-execution gate `apps/crawler/packages/crawler/src/action-gate.ts` as a pure decision function: for every proposed action (a server-issued `action_id` from `act`, or a URL from `navigate`) apply classifier/`classifyUrl` → scope → denylist → effective ceiling → budgets and return `{allowed}` or `{refused, status (skipped_unsafe | out_of_scope | denylisted | budget_reached), rule, reason}`. It does not persist anything; the `navigate`/`act` tools (T061) write the frontier item and decision-log entry from a refusal and return `ACTION_REFUSED` (FR-004, FR-010, FR-021). The agent has no code path that bypasses this gate (Principle III/V)

**Checkpoint**: The guard layer is complete and independently testable with no browser and no LLM. The gates return decisions and events; persistence happens in US1 (the `navigate`/`act` tools and run lifecycle).

---

## Phase 4: User Story 1 - Map a portal as a guest (Priority: P1) 🎯 MVP

**Goal**: A `map` run for the guest persona on a configured portal (example: `liveinsurer`; `marketsite` on hold for legal reasons) records states, transitions, forms, API calls, frontier items, rule candidates and open questions, all with evidence and confidence.

**Independent Test**: Run one `map` run within budget; verify the map exists, every record cites evidence and a confidence label, the frontier report lists skipped actions with reasons, near-duplicate listing pages cluster, and no non-read action executed (quickstart §2–§4).

### Configuration files for the target

- [X] T045 [P] [US1] Create `portals/marketsite/portal.yaml` exactly per `contracts/config-schema.md` (`environment: production`, scope caps, denylist incl. `path:/oferty/wystaw/*`, obstacles, `rate_limit` with an identifiable User-Agent whose contact address the maintainer fills in, `item_view_cap`, `item_route_templates`, `max_action_class` omitted (defaults to read), `compliance` values null with a `# TODO(T072)` note so production runs are refused until a person fills them in). Obstacle selectors are placeholders to be verified against the live site in T059 **[liveinsurer: MarketSite is now on hold for legal reasons (spec 002 FR-022); `portals/liveinsurer/portal.yaml` was added later as the current practice target and carries the same shape]**
- [X] T046 [P] [US1] Create `personas/marketsite/guest.yaml` per the contract (`auth: none`, `max_action_class: read`, consent declines location/marketing/personalization per FR-023, viewport 1366×768, `locale: pl-PL`) **[liveinsurer: `personas/liveinsurer/guest.yaml` was added later alongside it — see T045 note]**

### MCP server (tests first — these are the Principle II/V enforcement points)

- [X] T047 [P] [US1] Write `apps/crawler/packages/mcp-server/tests/recording-services.test.ts` for the server-internal services: `record_state`, `record_transition`, `record_form` reject a missing/empty `evidence_ref` with `MISSING_EVIDENCE`, invalid confidence with `INVALID_CONFIDENCE`, bad shape with `SCHEMA_INVALID`; `record_state` is idempotent by fingerprint (`created: false`); ids are server-generated and no client-supplied id is accepted; nothing accepts SQL
- [X] T048 [P] [US1] Write `apps/crawler/packages/mcp-server/tests/record-transition-safety.test.ts`: `status: executed` with a non-read class on a production run → `UNSAFE_ACTION_EXECUTED`; a supplied `safety_class` that differs from the server-side `safety` package re-derivation is rejected (agent claims "read" for a bid button); skipped transitions with any class are accepted
- [X] T049 [P] [US1] Write `apps/crawler/packages/mcp-server/tests/record-api-call.test.ts`: payload that looks like raw PII → `PII_SUSPECTED`; shape-only records accepted; `edge_id` optional (passive load)
- [X] T050 [US1] Implement the `pathfinder` MCP server scaffold `apps/crawler/packages/mcp-server/src/server.ts` (`@modelcontextprotocol/sdk`, stdio, Zod validation of every input/output against `apps/crawler/packages/core` schemas, DB via `apps/crawler/packages/core`), shared error codes `apps/crawler/packages/mcp-server/src/errors.ts` (per contracts/mcp-tools.md), the run-stopped guard applied to every browser-touching tool (`RUN_STOPPED` after a block or budget exhaustion), and the `start_run` tool (calls `preflight` T043 first, then creates or resumes the run, launches the session T059)
- [X] T051 [P] [US1] Implement the server-internal services `record_state`, `record_form` and the agent-facing tools `get_known_states`, `add_open_question`, `add_rule_candidate` (server resolves `about_ref` to copy its `evidence_ref`, forces `confidence: inferred`, `UNKNOWN_REF` otherwise) in `apps/crawler/packages/mcp-server/src/{services,tools}/`, including inserting `state_observations` (T047). Recording services are NOT exposed as agent tools
- [X] T052 [US1] Implement the `record_transition` service in `apps/crawler/packages/mcp-server/src/services/record-transition.ts`: re-derive `safety_class` with `apps/crawler/packages/safety`, reject mismatches, enforce `UNSAFE_ACTION_EXECUTED` (T048). The `action.locators` array is required (ranked `role | label | text | test_id | container`)
- [X] T053 [P] [US1] Implement the `record_api_call` and `add_frontier_item` services and the agent-facing `get_next_frontier_item` tool in `apps/crawler/packages/mcp-server/src/` (`record_api_call` uses `looksLikeRawPayload` from T018; `get_next_frontier_item` reads the queue from T058) (T049)
- [X] T054 [US1] Implement the `complete_run` service in `apps/crawler/packages/mcp-server/src/services/complete-run.ts` (computes and stores `coverage` — states, actions executed, actions skipped by class, API endpoints seen — FR-021, sets status) and the agent-facing `finish_run` tool, which only requests completion: the server verifies the frontier is empty or a budget is exhausted (`FRONTIER_NOT_EMPTY` otherwise) and the agent can never set `status` or `warning`

### Obstacles and crawler runtime

- [X] T055 [P] [US1] Implement `apps/crawler/packages/obstacles/src/index.ts`: register obstacle handlers from portal `obstacles` config and persona `consent` via Playwright `addLocatorHandler`, so banners/popups/chat widgets are dismissed before a state is recorded (FR-019, FR-023); selectors come from config, not code
- [X] T056 [P] [US1] Implement `apps/crawler/packages/crawler/src/stabilizer.ts` (research §3): network-idle window + MutationObserver quiet period + no running CSS animations, hard timeout sets the record's `stabilization` to `never_stabilized` (recorded with evidence, never discarded)
- [X] T057 [P] [US1] Implement `apps/crawler/packages/crawler/src/observer.ts`: capture the canonicalized ARIA snapshot (written via T020 evidence store; no screenshots in v1), extract forms with fields/types/required/constraints/options/validation messages WITHOUT submitting (FR-011), capture network calls (method, URL template, status, req/res shape) and console errors/failed requests per state and per action (FR-012). Also the action extractor `apps/crawler/packages/crawler/src/action-extractor.ts`: derive candidate actions from the ARIA tree (links, buttons, menu items, tabs, comboboxes, clickable elements), classify each with `apps/crawler/packages/safety`, and issue server-side `action_id`s bound to the current state (the only ids `act` accepts). Records only calls the page itself makes — never calls the portal's APIs directly (FR-025). Minimal locator: role + accessible name (ranking extended in US4)
- [X] T058 [P] [US1] Implement `apps/crawler/packages/crawler/src/frontier.ts` (research §10): priority queue by depth (BFS) with novelty boost, sliding window over recent cluster ids to stop a same-cluster branch after N results, per-template and total caps; persists to the DB so a run can resume (FR-020); enforces `item_view_cap` (an item page = a route template listed in the portal's `item_route_templates`) and counts item-page visits for the report (FR-024)
- [ ] T059 [US1] Implement `apps/crawler/packages/crawler/src/session.ts`: launches Playwright (in the mcp-server process) with viewport/locale from the effective persona, installs the request gate (T042) and obstacle handlers (T055), records the run row (persona, portal, environment version/date, viewport, locale, browser, resolved `config_snapshot` — FR-020). Verify and correct the placeholder obstacle selectors in `portals/liveinsurer/portal.yaml` (the live-run target since MarketSite went on hold — spec 002 FR-022) on first supervised run **[PENDING: code done and tested (`session.ts`); the placeholder obstacle selectors still need verifying on the first supervised live run, T073]** **[PAUSED 2026-09-25, commit `d8cff2a`: the Chromium launch blocker is resolved, and the first live run (runs `01a0da2e`, `01a0da46`, `01a0da56`, `01a0da64`, `data/db/production.sqlite`) got 8 steps in before the session was paused (not finished) to fix five blockers found in order — (1) `request-gate.ts` scanned every response body for CAPTCHA/block markers, not just the main document, so Google's reCAPTCHA loader script (always containing "g-recaptcha") false-positived a stop; now only the main document's HTML is scanned for CAPTCHA/block phrases, 403/429 still checked on every response — one known trade-off: a CAPTCHA shown only inside a JS-injected iframe is no longer caught from page text; (2) `observer.ts` threw `__name is not defined` on every page under the real tsx-run MCP server (tsx's keepNames transform wraps named consts inside `page.evaluate` callbacks in a helper that doesn't exist inside the page; Vitest doesn't apply that transform so tests never caught it) — fixed by removing the named helpers, and `observer.test.ts` now loads `observer.ts` via tsx's `tsImport` so this class of bug is caught by tests; (3) liveinsurer's Cookiebot banner is two-step — only "Zarządzaj"/"Akceptuj wszystkie" show first, and "Odrzuć" only appears after "Zarządzaj", with an underlay intercepting clicks in between — `portals/liveinsurer/portal.yaml` gained a `cookie_manage` obstacle (`#CybotCookiebotDialogBodyLevelButtonCustomize`) before `cookie_banner`; verified live that all optional toggles default off and Odrzuć records explicit consent `{preferences:false, statistics:false, marketing:false}` — **this is the T059 obstacle-selector verification, but T059 stays open until a full supervised run completes**; (4) every link click timed out ("waiting for scheduled navigations to finish") because the 1 rps limiter issued permits strictly FIFO, so a click's main-frame navigation queued behind the current page's pending subresources — `rate-limiter.ts`/`request-gate.ts` gained a priority lane (`acquire({priority})`, FIFO within priority, pacing unchanged) used only for main-frame navigations, and `pipeline.ts` now does a 5s trial click then a real click with a 30s budget; (5) liveinsurer's homepage branch finder (`combobox "Województwo"/"Miasto"`) has ~200 native `<select>` `option`s that were each queued as a frontier action (unclickable, ~5s wasted each) and exhausted `MAX_ACTIONS_PER_STATE=200` before reaching footer links — `action-extractor.ts` no longer treats an `option` whose direct parent is a native combobox as an action (custom-listbox options are unaffected; option labels are already in the form schema). Follow-ups NOT implemented, for whoever resumes this run: (a) at 1 rps every step took 16–40s because all of a page's subresources also go through the limiter, so a 60-minute budget covers ~100–200 steps, not the 300 states configured — consider letting the gate skip images/fonts/media in map runs (changes what's recorded, needs a decision); (b) unhandled tool errors return a generic `INTERNAL` and log only to the server's stderr, which Claude Code does not retain, so real errors had to be reproduced out-of-process — worth a diagnosability pass; obstacle dismissals are also not written to the decision log; (c) four hidden "Przeskocz do …"/"Strona główna" skip links on every liveinsurer page cost ~5s each as unreachable actions. Runs `01a0da2e`/`01a0da46`/`01a0da56`/`01a0da64` are left `running` and will be swept to `interrupted` by `interruptStaleRuns` on next server start. Next step: an MCP reconnect and a fresh supervised liveinsurer guest run via the `crawler` subagent]**
- [X] T060 [US1] Write the crawler subagent `.claude/agents/crawler.md` (same format as `.claude/agents/db-admin.md`): frontmatter `tools:` listing ONLY `mcp__pathfinder__start_run`, `mcp__pathfinder__get_known_states`, `mcp__pathfinder__get_next_frontier_item`, `mcp__pathfinder__navigate`, `mcp__pathfinder__act`, `mcp__pathfinder__add_open_question`, `mcp__pathfinder__add_rule_candidate`, `mcp__pathfinder__finish_run` (never omit `tools:`; no Bash, Edit, Write, WebFetch, WebSearch or other MCP servers). Body derived from `user_input/raw_idea/agents/crawler.md` (map mode only): start with `start_run`, explore via `get_next_frontier_item`/`navigate`/`act`, facts only, flag inferences, intent only as open questions (FR-002), never attempt to work around a refusal, block or `RUN_STOPPED` — stop and report; resume with `resume_run_id`
- [X] T061 [US1] Implement the `navigate` and `act` tools in `apps/crawler/packages/mcp-server/src/tools/{navigate,act}.ts` as the full pipeline: action gate (T044) → rate-limited request through the request gate (T042) → obstacle handling → stabilizer (T056) → observer/action extractor (T057) → fingerprint (`apps/crawler/packages/fingerprint`) → recording services (T051–T053) → response per contracts/mcp-tools.md. Every merge/split/skip/refusal goes to the decision log (FR-009, FR-021)
- [X] T062 [US1] Implement run lifecycle and resume in `apps/crawler/packages/crawler/src/run.ts` (used by `start_run`/`finish_run`): budget/step/time/depth enforcement in the server (FR-007; there is no external turn limit), agent interruption → `interrupted`, `start_run { resume_run_id }` resumes from persisted frontier/visited state without re-recording any state or edge (FR-020, SC-010), block → `stopped_warning` with the run-stopped guard from T050, completion via `complete_run`
- [X] T063 [P] [US1] Implement the frontier report and coverage output in `apps/crawler/packages/crawler/src/report.ts`: lists every skipped action with class and reason (not read-only, out of scope, denylisted, budget reached, unreachable), states/actions/skipped-by-class/API-endpoints coverage, and the number of item-page visits made (FR-010, FR-021, FR-024)
- [X] T064 [US1] Register the server in the repo-root `.mcp.json` (server name `pathfinder`, stdio, command running the `mcp-server` package) and write `apps/crawler/packages/mcp-server/tests/agent-lockdown.test.ts`: parse `.claude/agents/crawler.md` frontmatter and assert `tools:` is present and contains exactly the agent-facing tool names of contracts/mcp-tools.md (no Bash, Edit, Write, WebFetch, WebSearch or non-`pathfinder` MCP tools), and that the server's registered agent-facing tool list excludes every recording service and `complete_run`
- [X] T065 [US1] Write an integration test `apps/crawler/packages/mcp-server/tests/map-run.test.ts` using an MCP client against a local mock portal (static fixture server, ARIA fixtures incl. a bid/buy-now button, a listing page duplicate, a form, a 403 page): asserts states/edges/forms/network_calls all carry `evidence_ref` + `confidence` (SC-003), all executed edges are `read` (SC-002), the duplicate listing joins an existing cluster, mutating buttons appear in the frontier with `denylisted`, `act` with an unissued `action_id` returns `UNKNOWN_ACTION`, `start_run` on a production config without the flag, with null `compliance` values, or with a placeholder User-Agent is refused with no request made, `navigate` to a logout URL is refused, every request the mock portal receives carries the configured User-Agent and respects the rate limit, the servers make no direct HTTP calls of their own (FR-025: also grep `apps/crawler/packages/mcp-server` and `apps/crawler/packages/crawler` for direct `fetch`/`http` client use outside Playwright), the 403 stops the run with `stopped_warning`, zero further requests and `RUN_STOPPED` on later calls even when repeatedly called (SC-007), and interrupt + `resume_run_id` produces no duplicate edges (SC-010)

**Checkpoint**: A guest `map` run works end-to-end against the mock portal; ready for the manual gate in T072 before any live run. The subagent itself is exercised by the quickstart (T073) since it needs a Claude Code session.

---

## Phase 5: User Story 3 - Portals and personas as reusable configuration (Priority: P2)

**Goal**: Composable personas via `extends`/mixins demonstrated on the real files. The loaders, cycle and secret rejection and ceiling logic already exist (Foundational).

**Independent Test**: Load the guest persona and a second sample persona extending it plus a mixin; both resolve; invalid files are rejected naming the file and problem (quickstart §6).

- [X] T066 [P] [US3] Create `personas/_mixins/anonymous-base.yaml` and refactor `personas/marketsite/guest.yaml` to `extends: ["../_mixins/anonymous-base.yaml"]` only if the resolved result is unchanged (verify with a config test); add a test `apps/crawler/packages/config/tests/persona-samples.test.ts` that loads the real files, and add sample `personas/marketsite/guest-mobile.yaml` (`extends: ["guest.yaml"]`, different `viewport` only) demonstrating SC-008

**Checkpoint**: A new persona is added by writing one file and resolves with no crawler change.

---

## Phase 6: User Story 4 - Hand locators to QA (Priority: P3)

**Goal**: Every recorded action carries ranked candidate locators and a snapshot reference.

**Independent Test**: Sample recorded actions incl. elements with `data-testid`; each has ranked locators and a snapshot reference (quickstart §7).

- [X] T067 [P] [US4] Write `apps/crawler/packages/crawler/tests/locators.test.ts` with element fixtures: ranking order role+name → label/text → `test_id` → container (Principle/Technical Constraints locator priority); an element exposing `data-testid` always includes a `test_id` candidate; elements lacking an accessible name still get at least a text or container candidate
- [X] T068 [US4] Implement `apps/crawler/packages/crawler/src/locators.ts` (ranked candidate builder returning `{kind, value, rank}[]` plus the ARIA snapshot `evidence_ref`) and integrate it into `observer.ts`/`action-extractor.ts` and the `act` tool's transition recording in place of the minimal role+name locator from T057 (T067; FR-013)
- [X] T069 [US4] Extend `apps/crawler/packages/mcp-server/tests/map-run.test.ts` with a fixture element carrying `data-testid` and assert the recorded transition's `action_json.locators` contains it and references a snapshot

**Checkpoint**: All four stories work independently.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T070 [P] Write `scripts/stability-check.ts` comparing two runs' matched-state fingerprints to measure SC-005 (≥90% stable) and a `scripts/pii-audit.ts` that scans `data/evidence/` (masked ARIA snapshots and network shapes; no screenshots exist in v1) and DB rows for unmasked emails/phones/tokens for SC-004
- [X] T071 [P] Add a `README.md` at repo root (or `apps/crawler/packages/crawler/README.md`) documenting how to invoke the crawler subagent, config files and safety model; keep `specs/001-crawler-map-mode/quickstart.md` in sync with any tool or subagent changes
- [X] T072 **MANUAL GATE (blocks the first live production run; enforced by `preflight` via FR-026)**: a person (a) reviews the terms of use and any API terms of the configured portal for automated-access clauses, (b) re-checks `robots.txt` (constitution Principle V), and then fills `compliance.robots_checked_on`, `compliance.terms_reviewed_on`, `compliance.terms_reviewed_by` in `portals/liveinsurer/portal.yaml` (the live-run target — MarketSite is on hold for legal reasons, spec 002 FR-022; its own Regulamin review remains recorded in spec Assumptions) and replaces the placeholder contact address in `rate_limit.user_agent`. Until then `start_run` refuses production. Not a code task **[DONE 2026-09-25, commit `50662f4`: `compliance.robots_checked_on`/`terms_reviewed_on` set to 2026-09-25, `terms_reviewed_by: Randal Chopirik`, `rate_limit.user_agent` contact replaced with `tester@example.test` (no longer `example.com`)]**
- [ ] T073 Run `quickstart.md` §1–§9 in order after T072; record any deviations. §1 and §5 (guard refusal, block stop) may be run before T072 against the mock server; §2–§4, §7–§9 need the live portal **[PARTIAL 2026-09-24: §1 and §5 pass against the stdio server (`PATHFINDER_ROOT` scratch copies). §1: a staging copy of the portal is refused with `ENV_GUARD_REFUSED` in 18 ms, with no run row and 0 requests (a mock-based variant also got 0 requests). §5: the first request got a 403, then the run went to `stopped_warning` with a `block_detected` warning; `navigate`, `get_next_frontier_item`, `add_open_question` and `add_rule_candidate` return `RUN_STOPPED`, resume returns `RUN_NOT_RESUMABLE`, and 0 requests follow the detection. Deviation: driven by a script over the same stdio server, not via the `crawler` subagent (the session's server is pinned to the real production portal file, and editing that file was not approved), so the "ignore the block" prompt test moves to T074's live bypass run. §2–§4, §6–§9 open]** **[ATTEMPT 2026-09-25: first live §2 attempt after T072 sign-off. `start_run` against the live `liveinsurer` portal failed — headless Chromium could not launch on this host (missing `libnss3`/`libnspr4`/`libasound2`); only `robots.txt` was fetched (4× HTTP 200). 4 run rows were left `running` in `data/db/production.sqlite`, to be marked `interrupted` by the existing `interruptStaleRuns` on next server start. A code fix (in progress, uncommitted as of this note) makes `start_run` return `BROWSER_UNAVAILABLE` and mark the run `interrupted` on launch failure. §2–§9 still open pending a host with the required browser libraries]** **[PAUSED 2026-09-25, commit `d8cff2a`: the browser-launch blocker above is fixed (commit `6e26bf6`) and Chromium now launches; a fresh live §2 attempt (runs `01a0da2e`/`01a0da46`/`01a0da56`/`01a0da64`) hit and fixed five further blockers — see the T059 note for detail (CAPTCHA false positive, `__name is not defined` under tsx, liveinsurer's two-step Cookiebot banner, click timeouts from FIFO rate-limiting, and native `<select>` options flooding the frontier). Run `01a0da64` completed 8 steps with the fixes applied (edges recorded) before this session was paused by user decision — a pin, not a stop; the run is not finished, not failed. §2–§9 remain open. Next step: reconnect the MCP session and drive a fresh supervised liveinsurer guest run via the `crawler` subagent. Open follow-ups for whoever resumes (not implemented this session): step latency (~16–40s/step at 1 rps because subresources share the budget, so a 60-minute run covers ~100–200 of the 300 configured states — option: skip images/fonts/media in map runs, pending a decision on what that omits from the record); unhandled tool errors return a generic `INTERNAL` with detail only in server stderr, which Claude Code doesn't retain, and obstacle dismissals aren't written to the decision log; four hidden "Przeskocz do …"/"Strona główna" skip links per liveinsurer page cost ~5s each as unreachable]**
- [ ] T074 Security/safety review pass: confirm no code path executes a browser action or portal request outside `action-gate.ts`/`request-gate.ts`, the subagent's tool list still matches `agent-lockdown.test.ts` (T064), and no other `.mcp.json` server or agent file gives the crawler direct browser or network access. Then run the subagent once with a prompt telling it to bypass the guards and confirm refusal **[PENDING: static review done (every `goto`/`click` is reached only after `decide`, every request passes `request-gate`); the live bypass-attempt run needs a person]**

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
Task: "Write apps/crawler/packages/safety/tests/classifier.test.ts"
Task: "Write apps/crawler/packages/safety/tests/env-guard.test.ts"
Task: "Write apps/crawler/packages/safety/tests/scope-denylist.test.ts"
Task: "Write apps/crawler/packages/safety/tests/block-detector.test.ts"
Task: "Write apps/crawler/packages/crawler/tests/rate-limiter.test.ts"
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
