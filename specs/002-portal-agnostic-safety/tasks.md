---

description: "Task list for Portal-Agnostic Safety and Portal Workspaces (R-11)"
---

# Tasks: Portal-Agnostic Safety and Portal Workspaces

**Input**: Design documents from `/specs/002-portal-agnostic-safety/`

**Prerequisites**: plan.md, spec.md, research.md (§1-§12), data-model.md, contracts/robots.md, contracts/config-schema.md, contracts/mcp-tools.md, contracts/operator-cli.md, quickstart.md; constitution at `.specify/memory/constitution.md`. Builds on the spec 001 code on `feature/001-r04-core-crawler-map-mode` (this branch is stacked on it).

**Tests**: Constitution Principle VII and the Development Workflow require Vitest unit tests, written before dependent code builds on them, for the pure pieces (`safety` robots parser, rule sets, aliases, `url:` entries; `config` schema and persona fence). Integration tests run the MCP server against the marketplace mock and the new insurer mock. Test tasks come first in each block and MUST fail before the implementation task that follows. The spec 001 suite MUST stay green after every task.

**Organization**: Grouped by user story in priority order, with two deliberate choices. (1) The `RuleSet` refactor (no behaviour change) and migration `0002` are Foundational, because US1-US5 all read them; each story then adds only its own behaviour. (2) The insurer mock portal (research §12) is built in US1, because US1's independent test and SC-001 need its `robots.txt`; US3 and US4 reuse it.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: US1-US5, from spec.md
- **[DB-ADMIN]**: MUST be delegated to the `db-admin` subagent (`.claude/agents/db-admin.md`); do not edit `data/` ad hoc

## Path Conventions

pnpm-workspace monorepo under `apps/crawler/`: `apps/crawler/packages/<name>/src/`, `apps/crawler/packages/<name>/tests/`, `apps/crawler/scripts/`, `apps/crawler/tests/fixtures/`; config in `portals/<portal>/`, `personas/<portal>/`; storage in `data/`.

---

## Phase 1: Setup (Shared Infrastructure)

- [X] T001 [P] Save real `robots.txt` fixtures to `apps/crawler/tests/fixtures/robots/`: `liveinsurer.example.txt`, `marketsite.example.txt`, `forum.example.txt`, `pl.wikipedia.org.txt`, `classifieds.example.txt` (fetched from `https://<host>/robots.txt`, byte-exact) and `rfc9309-examples.txt` (the examples from RFC 9309 §2.2.2 and §5). Add a `robots/` section to `apps/crawler/tests/fixtures/README.md` with the fetch date and source URL of each file
- [X] T002 [P] Create `apps/crawler/tests/fixtures/urls/liveinsurer-robots-sample.json` for SC-002: 50 URLs taken from liveinsurer.example pages (menu, footer, article links), including every `cHash` campaign link found in the menus, each with `{ url, expected: "allow" | "refuse", rule }` decided by a manual reading of `robots/liveinsurer.example.txt`. Record in the file header where the URLs were taken from and on what date
- [X] T003 [P] Add `data/exports/` to the root `.gitignore` (keep a `data/exports/.gitkeep`), for `portal:export` output (research §9)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Storage and the rule-set seam every story builds on.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

### Storage (migration 0002)

- [X] T004 [DB-ADMIN] Write reversible migration `data/migrations/0002_portal_workspaces.{up,down}.sql` exactly per `data-model.md`, following the `sqlite-conventions` skill: rebuild `states` with `portal_id TEXT NOT NULL` backfilled from `runs.portal_id` of `first_seen_run`, drop `ux_states_fingerprint`, add `ux_states_portal_fingerprint UNIQUE (portal_id, fingerprint)`, replace `ix_states_cluster_id` with `(portal_id, cluster_id)`, run `PRAGMA foreign_key_check` after the copy; rebuild `frontier` with status CHECK `('pending','done','skipped_unsafe','out_of_scope','denylisted','robots_disallowed','budget_reached','unreachable')` (`reason` required for skip statuses); rebuild `decision_log` with kind CHECK `('skip','refuse','merge','split','warning','note')`; create `robots_policies` (columns, types and CHECKs as in data-model.md: `outcome` CHECK IN (`rules`,`no_rules`,`unreachable`), `truncated` CHECK IN (0,1), `ignored_lines INTEGER NOT NULL DEFAULT 0`, `evidence_ref TEXT NOT NULL`, index `(run_id, host, fetched_at)`) and `portal_data_log` (no FK on `portal_id`; `action` CHECK IN (`export`,`delete`); `counts_json` checked with `json_valid`). Down migration reverses in the order in data-model.md and fails on rows using `note`/`robots_disallowed` or cross-portal duplicate fingerprints. Regenerate `data/schema/schema.sql` and update `data/schema/README.md`
- [X] T005 Update `apps/crawler/packages/core/tests/schemas.test.ts` and `apps/crawler/packages/core/tests/db.test.ts` first (new enum values, `state.portal_id` required, migration 0002 applies and reverts on a DB with 0001 data, two portals may share a fingerprint), then update `apps/crawler/packages/core/src/schemas/common.ts` (`FrontierStatus` += `robots_disallowed`), `apps/crawler/packages/core/src/schemas/decision-log.ts` (kind += `note`), `apps/crawler/packages/core/src/schemas/state.ts` (`portal_id` string, required), new `apps/crawler/packages/core/src/schemas/robots-policy.ts` and `apps/crawler/packages/core/src/schemas/portal-data-log.ts` (field-for-field with data-model.md), and `apps/crawler/packages/core/src/db-types.ts` (Kysely types for the new tables and column); export from `apps/crawler/packages/core/src/schemas/index.ts` (depends on T004)

### Rule-set seam (pure refactor, no behaviour change; tests first)

- [X] T006 Write `apps/crawler/packages/safety/tests/rule-set.test.ts`: `builtinRuleSet()` holds exactly the rules of today's `ACTION_RULES`; `classifyAction(d)` and `classifyAction(d, builtinRuleSet())` agree on every action in `apps/crawler/packages/safety/tests/fixtures.ts`; same for `classifyUrl` and `checkDenylist` with and without an explicit set; two rule sets can coexist in one process without affecting each other (research §6)
- [X] T007 Create `apps/crawler/packages/safety/src/rule-set.ts` (`RuleSet` type, `builtinRuleSet()` built from `rules.ts`), make `classifyAction(d, rules = builtinRuleSet())` and `classifyUrl(url, rules = builtinRuleSet())` in `apps/crawler/packages/safety/src/classifier.ts` and `checkDenylist(denylist, target, rules = builtinRuleSet())` in `apps/crawler/packages/safety/src/denylist.ts` take it as a parameter instead of reading `ACTION_RULES`; export from `apps/crawler/packages/safety/src/index.ts`. The whole spec 001 safety suite stays green unchanged (T006)
- [X] T008 Thread the rule set through the runtime: `EffectiveConfig.ruleSet` in `apps/crawler/packages/config/src/effective.ts` (built-in set for now), `GateContext.rules` in `apps/crawler/packages/crawler/src/action-gate.ts`, `RunState.ruleSet` in `apps/crawler/packages/mcp-server/src/runtime/run-state.ts`, and read from there in `apps/crawler/packages/mcp-server/src/runtime/pipeline.ts` and `apps/crawler/packages/mcp-server/src/services/record-transition.ts` (contract mcp-tools "Recording services"). No remaining import of `ACTION_RULES` outside `safety/src/rules.ts` and `rule-set.ts`; full suite green (depends on T007). **As built**: `safety` depends on `config`, so `config` cannot build a `RuleSet` (cycle). The run's set is `portalRuleSet(portal)` in `safety`, held by `RunState.ruleSet` and passed to `classifyCandidates`; `record-transition` rebuilds it from `config_snapshot.portal`. `EffectiveConfig` does not gain `ruleSet` (also applies to T058)

**Checkpoint**: migration 0002 applied, `RuleSet` flows from config to every classifier call, spec 001 suite green.

---

## Phase 3: User Story 1 - robots.txt is obeyed without hand-copying (Priority: P1) 🎯 MVP

**Goal**: Every run fetches each in-scope host's `robots.txt` before touching it and never requests a URL it disallows for the crawler's token, including query-string rules (FR-001 to FR-009).

**Independent Test**: Map the insurer mock (its `robots.txt` disallows `*cHash*`, `/quote/`, `/api/`, allows `/quote/start*`); 0 requests reach a disallowed URL, `/quote/start` is visited, every refusal is in the decision log with its `robots:` rule (quickstart §2, §3; SC-001, SC-003).

### Tests for User Story 1 (write first, must fail)

- [X] T009 [P] [US1] Write `apps/crawler/packages/safety/tests/robots.test.ts` (contracts/robots.md "Group selection" and "Matching"): `productToken("PathfinderAI-Crawler/0.1 (+contact)") === "PathfinderAI-Crawler"`, default token without a UA; own-token group beats `*`, case-insensitive, several matching groups merged; path+query target, no fragment; `*` and `$`; longest pattern wins, `Allow` wins a tie (`Disallow: /quote/` + `Allow: /quote/start*` → `/quote/start` allowed, `/quote/summary` refused); empty `Disallow:` ignored; `/robots.txt` always allowed; percent-encoding normalised (`%7e` = `~`, `%2f` stays `%2F`); malformed lines ignored and counted; body over 500 KiB truncated and flagged; `Crawl-delay` and `Sitemap` recorded; the RFC 9309 examples from `tests/fixtures/robots/rfc9309-examples.txt`; each real fixture from T001 parses; every URL in `tests/fixtures/urls/liveinsurer-robots-sample.json` gets its expected verdict and rule (SC-002)
- [X] T010 [P] [US1] Add robots cases to `apps/crawler/packages/config/tests/load-portal.test.ts`: `robots_page_requests` defaults to `block`, accepts `allow_and_record`, rejects any other value naming the file and field; `EffectiveConfig.robots` is `{ productToken, pageRequests }`
- [X] T011 [P] [US1] Add a lower-only rate change to `apps/crawler/packages/crawler/tests/rate-limiter.test.ts`: `slowTo(rps)` lowers the rate, a faster value is ignored (FR-007, research §3)
- [X] T012 [P] [US1] Write `apps/crawler/packages/crawler/tests/robots-registry.test.ts` with a stub `fetch` (contracts/robots.md "Fetch"): every fetch goes through the limiter with the configured User-Agent and a 10 s timeout; 2xx → `rules`; any 4xx including 403 and 429 → `no_rules` and no block event; 5xx, timeout, network error, more than 5 redirects → `unreachable`; each redirect hop is rate-limited; a cross-host redirect's file applies to the original host; `check(url)` is `unknown` before `ensure(host)`, then `allowed` or `refused` with the rule line; hosts outside `allowed_domains` are never fetched; an `unreachable` host refuses every URL on it; a policy older than 24 h is re-fetched and a changed body writes a new policy and a decision-log entry; `Crawl-delay` slower than `requests_per_second` calls `slowTo`, faster never does; every fetch (also 404 and failures) writes one evidence record `{ source_url, final_url, redirects[], http_status, outcome, fetched_at, body }` and one `robots_policies` row
- [X] T013 [P] [US1] Add robots cases to `apps/crawler/packages/crawler/tests/action-gate.test.ts`: the robots check runs after scope and before the denylist; `refused` → result status `robots_disallowed` with `rule: "robots:Disallow: <pattern>"`; `unknown` passes to later checks; a direct `navigate` URL is treated exactly like a link (US1 scenario 7)
- [X] T014 [P] [US1] Add robots cases to `apps/crawler/packages/crawler/tests/request-gate.test.ts`: the gate awaits `ensure(host)` before letting any request to an in-scope host through; a disallowed main-frame navigation (link, redirect, script-started, `navigate`) is aborted with a decision-log `refuse` and `detail.via = "request_gate"`; a redirect to a disallowed URL is refused before it is followed; the page's own disallowed requests are aborted under `block` and continue under `allow_and_record`, and in both cases one decision-log `note` per (URL template, rule) with a counter in `detail`; requests to hosts outside `allowed_domains` are not robots-checked
- [X] T015 [P] [US1] Add robots cases to `apps/crawler/packages/mcp-server/tests/start-run.test.ts`: base host robots 503 or unreachable → `ROBOTS_UNAVAILABLE` naming the URL and failure, no run row, no page, no request other than `robots.txt`, returned in under 5 s after the fetch timeout (SC-003); 404 → run starts with policy `no_rules`; the run's `config_snapshot.robots` holds `{ product_token, page_requests, policies: [{ host, policy_id, outcome, evidence_ref }] }`; `start_run` with `resume_run_id` fetches again (FR-006)

### Insurer mock portal (research §12)

- [X] T016 [US1] Create `apps/crawler/packages/mcp-server/tests/mock-insurer.ts` beside `mock-portal.ts`, with a request log: product pages (`/ubezpieczenia/:slug`), a Cookiebot-style consent dialog with a decline button, a three-step quote form (`/quote/start` → "Oblicz składkę" → "Dalej" → "Wyślij zapytanie" at `/quote/summary`), a "Kup polisę" button, a "Przedłuż polisę" button linking `/przedluzenie/start`, campaign links `?itm_campaign=…&cHash=…` in the menu, a link with `?sessionId=…`, an `/api/` fetch made by the page's own script, a cookie-consent page identical to the marketplace mock's, and a `robots.txt` with `Disallow: *cHash*`, `Disallow: /quote/`, `Allow: /quote/start*`, `Disallow: /api/`, `Crawl-delay: 1`. Variants selected at start: `robots.txt` answering 404, 503 and a redirect loop (6 hops). No production code references it

### Implementation for User Story 1

- [X] T017 [US1] Implement `apps/crawler/packages/safety/src/robots.ts`: `productToken(userAgent?)`, `parseRobots(text, { maxBytes: 512000 })` → `{ groups, sitemaps, ignoredLines, truncated }`, `robotsVerdict(policy, token, url)` → `{ allowed, rule }` per contracts/robots.md, pure, no new dependency (research §1); export from `apps/crawler/packages/safety/src/index.ts` (T009)
- [X] T018 [P] [US1] Add `robots_page_requests: z.enum(['block','allow_and_record']).default('block')` to `apps/crawler/packages/config/src/portal-schema.ts` and `robots: { productToken, pageRequests }` to `EffectiveConfig` in `apps/crawler/packages/config/src/effective.ts` (T010). **As built**: no `EffectiveConfig.robots` (config cannot import `safety`); consumers read `portal.robots_page_requests` and `productToken(portal.rate_limit?.user_agent)`
- [X] T019 [P] [US1] Add `slowTo(rps)` (lower-only) to `apps/crawler/packages/crawler/src/rate-limiter.ts` (T011)
- [X] T020 [US1] Implement `apps/crawler/packages/crawler/src/robots-registry.ts`: `createRobotsRegistry({ allowedDomains, userAgent, limiter, fetch, clock, writeEvidence, writePolicy, log })` with `ensure(host)`, `check(url)`, `policies()`; server-side Node `fetch`, manual redirects (max 5), 10 s timeout, 500 KiB body limit, not routed through `detectBlock`, evidence via `apps/crawler/packages/core/src/evidence.ts` with the PII scrubber, 24 h re-fetch with change logging, `Crawl-delay` → `limiter.slowTo`; export from `apps/crawler/packages/crawler/src/index.ts` (T012; depends on T017, T019)
- [X] T021 [US1] Add the robots check to `decide` in `apps/crawler/packages/crawler/src/action-gate.ts` via `GateContext.robots` (synchronous `check`, after scope, before denylist) (T013)
- [X] T022 [US1] Enforce robots in `apps/crawler/packages/crawler/src/request-gate.ts`: await `ensure(host)` for in-scope hosts, refuse disallowed main-frame navigations and redirects, apply `robots_page_requests` to page requests, deduplicated `note` entries per (URL template via `@pathfinder/fingerprint` route template, rule) (T014). **As built**: Playwright calls route handlers only for the first URL of a redirect chain, so with robots active a main-frame navigation is fetched in the handler with `route.fetch({ maxRedirects: 0 })`; a redirect target passes the navigation policy and robots before the response is fulfilled. Only the first hop is checked: the browser follows the fulfilled 3xx on its own, so a second hop in a chain is not intercepted. Notes are written once per (template, rule, action); per-request counts live in the gate (`robotsStats()`) and reach `finish_run` coverage
- [X] T023 [US1] In `apps/crawler/packages/mcp-server/src/services/start-run.ts`: after `preflight` and before the run row, create the registry and `ensure(baseHost)`; `unreachable` → new error `ROBOTS_UNAVAILABLE` in `apps/crawler/packages/mcp-server/src/errors.ts`; write `config_snapshot.robots`; re-fetch on `resume_run_id`. Store the registry in `apps/crawler/packages/mcp-server/src/runtime/run-state.ts` (T015; depends on T018, T020). **As built**: `robots_policies.run_id` is a foreign key, so the base host fetch runs under a pre-generated run id and its row is written right after the run row (`RunRobots.flush()`); on `ROBOTS_UNAVAILABLE` only the evidence file exists, no row. The limiter moved out of `BrowserSession` into `RunRobots` (shared by robots fetches and page traffic). `ServerContext.fetch` is injectable for tests. A rules change on resume or after 24 h is detected by comparing with the latest `robots_policies` row and logged as a `note` with rule `robots:changed`
- [X] T024 [US1] Wire the registry into the browser session in `apps/crawler/packages/mcp-server/src/runtime/browser-runtime.ts` (request gate and action gate contexts), write frontier items with status `robots_disallowed` and the `robots:` rule in `apps/crawler/packages/mcp-server/src/runtime/pipeline.ts` and `apps/crawler/packages/mcp-server/src/services/frontier.ts`, and return `ACTION_REFUSED` with that rule from `navigate`/`act` (contracts/mcp-tools.md) (depends on T021-T023)
- [X] T025 [US1] Show `robots_disallowed` in the frontier report in `apps/crawler/packages/crawler/src/report.ts`, and add `robots: { hosts, refused_navigations, page_requests_blocked, page_requests_allowed }` to `finish_run` coverage in `apps/crawler/packages/mcp-server/src/services/complete-run.ts`
- [X] T026 [US1] Serve `robots.txt` from `apps/crawler/packages/mcp-server/tests/mock-portal.ts` (a minimal file that disallows nothing the spec 001 tests visit) so `map-run.test.ts` exercises the `rules` path; spec 001 integration tests stay green
- [X] T027 [US1] Write `apps/crawler/packages/mcp-server/tests/insurer-run.test.ts` (quickstart §2, §3): the test writes `portals/<mock>/portal.yaml` and `personas/<mock>/guest.yaml` into a scratch `PATHFINDER_ROOT`; 5 consecutive map runs with 0 mock-log requests to `*cHash*`, `/quote/summary` or `/api/` under `block`; `/quote/start` visited; each skipped link a frontier item `robots_disallowed` with its rule; `/api/` calls as `note` entries; `config_snapshot.robots` holds the policy and evidence ref (SC-001). Repeat with `allow_and_record`: `/api/` requested and still a `note`, navigations still refused. Variants: 404 → `no_rules` and run proceeds; 503 and redirect loop → `ROBOTS_UNAVAILABLE` in under 5 s with only `robots.txt` in the mock log (SC-003). **As built**: shared `tests/harness.ts` (server + MCP client + frontier loop); frontier skips from extraction are decision kind `skip` (spec 001), request-gate and `navigate` refusals kind `refuse`; both count in coverage `refused_navigations`. The mock's `Crawl-delay` is faster than the test rate (never speeds up); the slowing path is unit-tested in T012

**Checkpoint**: US1 complete. The liveinsurer `cHash` gap is closed (SC-002 via T009, SC-001/SC-003 via T027).

---

## Phase 4: User Story 2 - Manual URL rules that see the query string (Priority: P2)

**Goal**: `url:<glob>` denylist entries match path plus query; `path:` is unchanged (FR-010, FR-011).

**Independent Test**: `url:/*?*sessionId=*` on the insurer mock refuses only the parameterised link, citing the entry.

### Tests for User Story 2 (write first, must fail)

- [X] T028 [P] [US2] Add `url:` cases to `apps/crawler/packages/safety/tests/scope-denylist.test.ts`: `url:*itm_campaign=*` matches `pathname + search` and refuses as `denylisted` with rule `url:*itm_campaign=*`; `url:/*?*sessionId=*` matches only the URL carrying the parameter; `path:` entries still ignore the query (FR-010, US2 scenario 2)
- [X] T029 [P] [US2] Add to `apps/crawler/packages/config/tests/load-portal.test.ts`: `url:<glob>` loads; `url:` with an empty glob and a typo like `urls:*x*` fail with `denylist[<i>]: "urls:*x*" must be a rule id, "path:<glob>" or "url:<glob>"` (contracts/config-schema.md)

### Implementation for User Story 2

- [X] T030 [US2] Support `url:` in `apps/crawler/packages/safety/src/denylist.ts` using `globToRegExp` from `apps/crawler/packages/safety/src/scope.ts` against `pathname + search` (research §5) (T028)
- [X] T031 [US2] Accept `url:<glob>` in the denylist entry schema in `apps/crawler/packages/config/src/portal-schema.ts` with the error text above (T029)
- [X] T032 [US2] Add a `url:/*?*sessionId=*` case to `apps/crawler/packages/mcp-server/tests/insurer-run.test.ts`: only the `sessionId` link is skipped as `denylisted` with that rule

**Checkpoint**: US1 and US2 work independently.

---

## Phase 5: User Story 3 - Onboard a portal of a different kind with configuration only (Priority: P2)

**Goal**: Generic rule ids `purchase`, `contact_or_message`, `reveal_contact`, `submit_request`; marketplace ids stay as aliases; the insurer mock is mapped with YAML only (FR-012 to FR-014, FR-020, FR-021).

**Independent Test**: Map the insurer mock with only a portal file and a persona file; the quote form is recorded but never submitted; purchase and contact controls are skipped under generic ids (quickstart §4; SC-004, SC-005).

### Tests for User Story 3 (write first, must fail)

- [X] T033 [P] [US3] Add to `apps/crawler/packages/safety/tests/classifier.test.ts`: "Kup teraz", "Licytuj", "Kup polisę", "Kup bilet", "Buy now", "Buy a policy" → `purchase`; "Wyślij zapytanie", "Poproś o ofertę", "Zamów rozmowę", "Zapisz się", "Zarejestruj", "Aplikuj", "Request a quote", "Sign up", "Apply", "Subscribe" → `submit_request` (class `external-side-effect`); contact and reveal labels → `contact_or_message`, `reveal_contact`; every action in `apps/crawler/packages/safety/tests/fixtures.ts` keeps the class it had before this feature (FR-014, SC-005). If a new keyword changes a fixture's class, narrow the keyword; no exceptions list (research §6)
- [X] T034 [P] [US3] Add alias cases to `apps/crawler/packages/safety/tests/scope-denylist.test.ts`: a denylist listing `buy_now`, `bidding`, `message_or_contact_seller` or `reveal_seller_contact` refuses the matching action as `denylisted` with rule `<alias>→<generic>` (e.g. `buy_now→purchase`); `resolveRuleId` maps each alias and passes other ids through (FR-013)
- [X] T035 [P] [US3] Extend `apps/crawler/packages/config/tests/real-files.test.ts`: `portals/marketsite/portal.yaml`, `portals/liveinsurer/portal.yaml` and the marketplace mock's portal file load without edits and with the same effective denylist meaning (SC-005); generic ids and alias ids are both accepted in `denylist`

### Implementation for User Story 3

- [X] T036 [US3] In `apps/crawler/packages/safety/src/rules.ts`: replace `bidding`/`buy_now` with `purchase` (merged keywords and paths plus "kup polisę", "kup bilet", "buy a policy"), rename `message_or_contact_seller` → `contact_or_message` and `reveal_seller_contact` → `reveal_contact` (seller-neutral wording kept alongside the existing patterns), add `submit_request` (`external-side-effect`, keywords from research §6); add `RULE_ALIASES` (`bidding`, `buy_now` → `purchase`; `message_or_contact_seller` → `contact_or_message`; `reveal_seller_contact` → `reveal_contact`) and `resolveRuleId` in `apps/crawler/packages/safety/src/rule-set.ts` (T033). **As built**: `submit_request` leaves out "zarejestruj", "sign up" and bare "apply": they match registration links and "apply filters" buttons, so they were narrowed ("apply now/for", "sign me up") per research §6; all 50 labelled fixtures keep their class. The built-in id/class table and `RULE_ALIASES`/`resolveRuleId` live in `config/src/rule-ids.ts` (config cannot import `safety`); a safety test keeps both lists identical
- [X] T037 [US3] Resolve aliases in `apps/crawler/packages/safety/src/denylist.ts` and report `rule` as `<alias>→<generic>` (T034)
- [X] T038 [US3] Accept the generic ids and the alias ids in the denylist schema in `apps/crawler/packages/config/src/portal-schema.ts`, derived from `builtinRuleSet()` and `RULE_ALIASES` instead of the hard-coded id list (removes the marketplace names from config code) (T035)
- [X] T039 [US3] Write `config_snapshot.rule_set` (resolved ids with class and origin `builtin`) in `apps/crawler/packages/mcp-server/src/services/start-run.ts` (data-model.md "Config snapshot additions")
- [X] T040 [US3] Extend `apps/crawler/packages/mcp-server/tests/insurer-run.test.ts` (quickstart §4): "Kup polisę" refused under `purchase`, "Wyślij zapytanie" under `submit_request`; the quote form's fields and constraints are recorded and it is never submitted (no POST in the mock log); the mock's portal file uses the generic ids only
- [X] T041 [US3] Run the spec 001 end-to-end checks against the insurer mock (FR-020): parameterise `apps/crawler/packages/mcp-server/tests/map-run.test.ts` over both mocks for the read-only guarantee, frontier report, block stop (mock 403 variant), resume, locators and the PII audit (`pnpm audit:pii` on the run), adding to `mock-insurer.ts` only what those checks need (a 403 variant). **As built**: map-run's assertions are marketplace-specific, so the same guarantees are asserted for the insurer in `insurer-run.test.ts` (read-only, evidence/confidence, locators + snapshot refs, frontier report, 403 stop, resume, `auditPii` on the run). Running the PII audit on a real run exposed a spec 001 false positive: our own sha256 refs/fingerprints and UUID ids matched the long-token pattern; `core/src/audit.ts` now skips them (regression test in `audit.test.ts`)

**Checkpoint**: A second site shape is mapped with YAML only.

---

## Phase 6: User Story 5 - Each portal is its own workspace (Priority: P2)

**Goal**: Config, personas, mixins and gathered data are separated per portal; states never merge across portals; one portal's data can be exported and deleted (FR-024 to FR-028).

**Independent Test**: Map both mocks into one sandbox DB, export and delete the marketplace mock; the export holds only its data, the delete leaves 0 of its rows and unshared evidence, the insurer mock is byte-identical and still resumable (quickstart §5; SC-008, SC-009).

### Tests for User Story 5 (write first, must fail)

- [X] T042 [P] [US5] Add fence cases to `apps/crawler/packages/config/tests/persona-extends.test.ts` (contracts/config-schema.md "Persona file changes"): with fence `[personas/_mixins, personas/<p>]`, extending `personas/_mixins/…` and `personas/<p>/_mixins/…` works; extending `../other-portal/guest.yaml`, a `..` path that leaves both roots, or a symlink pointing outside fails with `<persona file>: extends "<target>" leaves the allowed folders (personas/_mixins, personas/<p>)`; `findPersona` never returns a file under `personas/<p>/_mixins/`
- [X] T043 [P] [US5] Add to `apps/crawler/packages/crawler/tests/preflight.test.ts`: `preflight` passes the fence for the run's portal, so a cross-portal persona is refused before any browser starts
- [X] T044 [P] [US5] Add to `apps/crawler/packages/mcp-server/tests/recording-services.test.ts`: the same fingerprint recorded in runs of two portals gives two states with their own `portal_id` and clusters; `get_known_states` and the frontier return only the current run's portal; the session's fingerprint index is rebuilt only from the run's portal (FR-026, FR-027)
- [X] T045 [P] [US5] Write `apps/crawler/packages/core/tests/portal-data.test.ts` against a seeded two-portal DB and evidence dir (contracts/operator-cli.md, data-model.md "Partition map"): export writes `manifest.json` (portal, env, time, row counts per table, evidence count, schema version), one `<table>.ndjson` per partition table and `evidence/` copies, only of that portal; export with no runs exits 1 and writes nothing; delete plan lists row counts, evidence to remove and evidence kept because another portal references it; delete refuses while a run of that portal is `running`; delete removes rows in the data-model.md order in one transaction, then only unreferenced evidence files; other portal's rows and files byte-identical; each export/delete writes a `portal_data_log` row (operator, counts, target) that survives the delete

### Implementation for User Story 5

- [X] T046 [US5] Add `loadPersona(file, { fence })` to `apps/crawler/packages/config/src/load-persona.ts`: every file reached via `extends` must be inside a fence root after `realpath`, else the error above (research §10) (T042)
- [X] T047 [US5] Pass `[personas/_mixins, personas/<portal>]` as the fence in `apps/crawler/packages/crawler/src/preflight.ts` (T043)
- [X] T048 [US5] Scope states per portal: look up and create by `(portal_id, fingerprint)` in `apps/crawler/packages/mcp-server/src/services/record-state.ts`; rebuild the fingerprint index only from the run's portal in `apps/crawler/packages/mcp-server/src/runtime/browser-runtime.ts` (remove the "clusters are global" behaviour); filter `getKnownStates` in `apps/crawler/packages/mcp-server/src/services/agent-notes.ts` and frontier reads in `apps/crawler/packages/mcp-server/src/services/frontier.ts` by the run's portal (T044)
- [X] T049 [US5] Implement `apps/crawler/packages/core/src/portal-data.ts`: `exportPortal`, `planPortalDelete`, `deletePortal` per the partition map and delete order in data-model.md, evidence reference check across every evidence column, `portal_data_log` rows; export from `apps/crawler/packages/core/src/index.ts` (T045). **As built**: evidence references are collected by pattern (`<sha256>.<ext>`) from every text column of a portal's rows, so refs inside JSON (`action_json.snapshot_ref`, `config_snapshot`) count too
- [X] T050 [US5] Add thin CLIs `apps/crawler/scripts/portal-export.ts` and `apps/crawler/scripts/portal-delete.ts` (argument handling per contracts/operator-cli.md: `--env` default `production` for export, `--env`/`--operator` required for delete, dry run without `--yes`, `--operator` falls back to the OS user for export) and the `portal:export` / `portal:delete` scripts in `apps/crawler/package.json`. Not MCP tools; `agent-lockdown.test.ts` stays unchanged (depends on T049)
- [X] T051 [US5] Write `apps/crawler/packages/mcp-server/tests/workspaces.test.ts` (quickstart §5): map both mocks into one sandbox DB; the shared cookie page is two states, one per portal (SC-009); export the marketplace mock (only its rows and evidence); delete it with `--yes`; 0 of its rows and unshared evidence remain, the insurer mock's rows and evidence are byte-identical and a resume of its run still works (SC-008); `portal_data_log` has an `export` and a `delete` row
- [X] T052 [P] [US5] Document the workspace layout (`portals/<portal>/`, `personas/<portal>/`, `personas/<portal>/_mixins/`, shared `personas/_mixins/` for portal-neutral mixins only) in `personas/README.md`; confirm `personas/_mixins/anonymous-base.yaml` is portal-neutral (FR-024)

**Checkpoint**: Two portals coexist in one environment without shared state; export and delete work.

---

## Phase 7: User Story 4 - Portal-specific rules and other languages (Priority: P3)

**Goal**: A portal file can add rules and add keywords/paths to built-in rules, never lower a class or declare `read` (FR-015 to FR-019).

**Independent Test**: On the insurer mock, `renew_policy` ("przedłuż polisę", `/przedluzenie/*`) and German "jetzt kaufen" on `purchase` are refused under the right ids; invalid rules fail to load (SC-006).

### Tests for User Story 4 (write first, must fail)

- [X] T053 [P] [US4] Add to `apps/crawler/packages/safety/tests/rule-set.test.ts`: `extendRuleSet(base, portalRules)` adds a new rule with its class; extra keywords/paths on a built-in id are added and built-in ones still match; a class raise on a built-in id applies; keywords are normalised (lower case, diacritics stripped) and match on word boundaries ("przedłuż polisę" matches "Przedluz polise", not "nieprzedłużpolisę"); path globs match the normalised path; a portal rule keyword that also matches a read keyword makes the action non-read; a rule set built for one portal does not change `builtinRuleSet()` or another portal's set (FR-019)
- [X] T054 [P] [US4] Add an invalid-rule set to `apps/crawler/packages/config/tests/load-portal.test.ts` (SC-006), each failing with the file and rule named: class `read`; class lower than the built-in (`action_rules[1]: class "mutating" is lower than built-in "purchase" (external-side-effect)`); an alias id (`action_rules[0].id: "buy_now" is an alias of "purchase"; extend "purchase" instead`); new id without class; no keywords and no paths (`action_rules[2]: needs keywords or paths`); duplicate id; non-slug id; empty keyword; an unknown field. A portal rule id is accepted in `denylist`
- [X] T055 [P] [US4] Add to `apps/crawler/packages/safety/tests/scope-denylist.test.ts`: a portal rule id listed in the denylist refuses matching actions as `denylisted`, exactly like a built-in id (US4 scenario 4)

### Implementation for User Story 4

- [X] T056 [US4] Implement `extendRuleSet` in `apps/crawler/packages/safety/src/rule-set.ts` (phrases compiled to word-boundary matchers over normalised text via `normalize` in `rules.ts`, paths via `globToRegExp`; no user-supplied regex) (T053)
- [X] T057 [US4] Add `action_rules` to `apps/crawler/packages/config/src/portal-schema.ts` (`{ id, class?, keywords?, paths? }`, `.strict()`, validation rules and error texts from contracts/config-schema.md) and let `denylist` accept the file's own rule ids (T054). **As built**: a denylist slug that is neither built-in nor an alias must be declared in the same file's `action_rules` (checked at object level, same error text)
- [X] T058 [US4] Build `EffectiveConfig.ruleSet = extendRuleSet(builtinRuleSet(), portal.action_rules)` in `apps/crawler/packages/config/src/effective.ts`; record origin `portal` / `builtin+portal` in `config_snapshot.rule_set` in `apps/crawler/packages/mcp-server/src/services/start-run.ts`; ensure `denylist.ts` resolves portal ids from the passed rule set (T055)
- [X] T059 [US4] Extend `apps/crawler/packages/mcp-server/tests/insurer-run.test.ts`: the mock's portal file declares `renew_policy` (`external-side-effect`, "przedłuż polisę", `/przedluzenie/*`) and `purchase` keywords `["jetzt kaufen"]`; "Przedłuż polisę" is refused under `renew_policy` and the frontier report shows that id; a "Jetzt kaufen" button (added to `mock-insurer.ts`) is refused under `purchase`; the marketplace mock's run in the same test is unaffected by the insurer's rules (FR-019)

**Checkpoint**: All five stories work; the insurer mock exercises every new gate.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [X] T060 [P] Write `apps/crawler/packages/mcp-server/tests/no-portal-names.test.ts` (SC-007, FR-021): scan `apps/crawler/packages/*/src/**` and `.claude/agents/*.md` for `liveinsurer|marketsite|lokalnie|classifieds|forum` (case-insensitive) and portal domains; expect no matches. Fix any hit by moving the string to a portal or persona file
- [X] T061 [P] Update `.claude/agents/crawler.md`: describe the target as "a configured portal", name `robots_disallowed` among the frontier reasons the agent reads, state that robots refusals cannot be retried or worked around. Keep the tool list unchanged (`agent-lockdown.test.ts`)
- [X] T062 Retarget spec 001 docs (FR-022), reviewed by the `po` subagent: `specs/001-crawler-map-mode/spec.md`, `plan.md`, `quickstart.md`, `contracts/mcp-tools.md`, `contracts/config-schema.md` describe "a configured portal", with `marketsite` (on hold, legal) and `liveinsurer` (practice target) as example configurations only; `specs/001-crawler-map-mode/tasks.md` T045/T046/T059/T072 point at `portals/liveinsurer/` and `personas/liveinsurer/`; titles no longer say "MarketSite MVP". **As done**: T045/T046 are `[X]` and historically created `portals/marketsite/`/`personas/marketsite/`, so their text keeps that fact and gets a `[liveinsurer: ...]` note pointing at the later `portals/liveinsurer/`/`personas/liveinsurer/` files instead of rewriting what they built; T059/T072 (still open) now literally target `portals/liveinsurer/portal.yaml`. `contracts/mcp-tools.md` had no portal-specific wording to retarget
- [X] T063 Run `pnpm --dir apps/crawler typecheck`, `lint` and the full `test` suite; fix failures
- [X] T064 Run quickstart §1-§5 (`specs/002-portal-agnostic-safety/quickstart.md`) and record results in `specs/002-portal-agnostic-safety/quickstart.md` notes. §6 (live liveinsurer run) waits for spec 001 T072 and then closes spec 001 T059/T073/T074
- [X] T065 Ask `po` to update `roadmap.md` (R-11 spec link, title "... and portal workspaces" if po agrees, status) and run `speckit-analyze` over spec, plan and tasks. **As done**: `po` agreed with the retitle; roadmap.md R-11 now links `specs/002-portal-agnostic-safety` T001-T065 and records the branch now sitting on `master` (spec 001 squash-merged as `2799c96`) with only the live `liveinsurer` run (T072 sign-off) open. `speckit-analyze` found no CRITICAL/HIGH issues; it fixed a stale `plan.md` Project Structure comment (`rule-set.ts`/`effective.ts` no longer match the As-built notes on T008/T036) and left two LOW findings for the user: FR-023 is numbered out of sequence (appears after FR-028, under its own "Compliance gate" heading) and FR-023 (compliance gate unchanged) has no dedicated task, relying on the spec 001 suite staying green

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (1)**: none; T001-T003 in parallel
- **Foundational (2)**: T004 (db-admin) → T005; T006 → T007 → T008 in parallel with T004/T005. Blocks all stories
- **US1 (3)**: after Foundational. T016 (insurer mock) before T027
- **US2 (4)**: after Foundational; T032 needs T016 and T027's test file
- **US3 (5)**: after Foundational; T040/T041 need T016 and T027
- **US5 (6)**: after Foundational (T004/T005 for `states.portal_id`); T051 needs both mocks, so after T016
- **US4 (7)**: after US3 (extends the generic ids and alias rejection); T059 needs T016
- **Polish (8)**: after all stories; T062 can start once US1-US3 are done

### Within Stories

- Test tasks before their implementation task; confirm they fail first
- Pure code (`safety`, `config`) passes its tests before `crawler` and `mcp-server` use it (constitution Development Workflow): T017 before T020-T022; T036 before T038; T056 before T058
- Build order per plan: safety → config → core migration → crawler → mcp-server → scripts and docs

### Parallel Opportunities

- Setup: T001, T002, T003
- Foundational: the db-admin track (T004 → T005) alongside the rule-set track (T006 → T008)
- US1 tests T009-T015 all parallel; then T017, T018, T019 parallel
- After Foundational, US2, US3 and US5 unit work touch different files from US1's and can proceed in parallel; the shared `insurer-run.test.ts` and `portal-schema.ts` edits serialise
- US5 tests T042-T045 parallel

### Parallel Example: User Story 1

```bash
Task: "Write apps/crawler/packages/safety/tests/robots.test.ts"
Task: "Write apps/crawler/packages/crawler/tests/robots-registry.test.ts"
Task: "Add robots cases to apps/crawler/packages/crawler/tests/action-gate.test.ts"
Task: "Add robots cases to apps/crawler/packages/crawler/tests/request-gate.test.ts"
Task: "Add robots cases to apps/crawler/packages/mcp-server/tests/start-run.test.ts"
```

### Parallel Example: User Story 5

```bash
Task: "Add fence cases to apps/crawler/packages/config/tests/persona-extends.test.ts"
Task: "Add per-portal state cases to apps/crawler/packages/mcp-server/tests/recording-services.test.ts"
Task: "Write apps/crawler/packages/core/tests/portal-data.test.ts"
```

---

## Implementation Strategy

### MVP (US1)

1. Phase 1 Setup, Phase 2 Foundational
2. Phase 3 US1: robots parser and registry, both gates, `ROBOTS_UNAVAILABLE`, insurer mock
3. Validate with T009 (SC-002 on the liveinsurer sample) and T027 (SC-001, SC-003). This alone unblocks the liveinsurer live run once spec 001 T072 is signed off

### Incremental Delivery

1. US2 (`url:` entries): small, reuses US1 matching
2. US3 (generic ids + aliases + FR-020 checks on the insurer mock) → SC-004, SC-005
3. US5 (workspaces, export/delete) → SC-008, SC-009
4. US4 (portal action rules) → SC-006
5. Polish: SC-007 test, spec 001 docs retarget, quickstart

---

## Notes

- `[DB-ADMIN]` tasks go through the `db-admin` subagent; any later schema need becomes a new migration there
- The agent must never gain a code path around the gates or a tool to export/delete (Principle III/V); `agent-lockdown.test.ts` stays unchanged
- Do not fill `compliance.*` or the User-Agent contact in `portals/liveinsurer/portal.yaml`: that is the user's T072 sign-off in spec 001
- Commit after each task or logical group; stop at any checkpoint to validate
