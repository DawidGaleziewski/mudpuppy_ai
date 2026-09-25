<!--
SYNC IMPACT REPORT (temporary; remove before commit)
Version change: 1.2.0 → 1.3.0 (MINOR: new "App layout" Technical Constraints bullet; Python
tooling bullet no longer names a `python/` folder; read-only dashboard access to the store)
Modified principles: none
Added sections: Technical Constraints → "App layout" bullet
Removed sections: none
Templates/specs checked: specs/003-dashboard-ui (plan Constitution Check updated); specs/001 and
002 (apps/crawler already follows the layout; no change needed); .claude/agents/governor.md (already
states the same layout)
Deferred items: none
-->
# Pathfinder AI Constitution

Pathfinder AI is a tool used by business analysts (BAs) to document existing brownfield web
applications so that they can be re-created, for example on a newer tech stack, from the
documentation alone. It discovers processes with Playwright, records them as evidence-backed
requirements, and generates static tests that verify them.

## Core Principles

### I. Observed Behavior Is Separate From Intent
Every recorded statement MUST be labeled `observed` (verified from UI, network, code or data),
`inferred` (a reasonable deduction), or `needs_confirmation` (business intent). Agents MUST NOT
present a guess about why the system behaves as it does as an observed fact.
Rationale: the app is the source of truth for what it does, never for why. Mixing the two is the
main way documentation becomes misleading.

### II. Evidence and Traceability (NON-NEGOTIABLE)
Every semantic record (step, rule, requirement, test) MUST carry a confidence label and a
reference to its source evidence (trace, ARIA snapshot, network call, screenshot, code location).
A record without evidence MUST NOT be persisted. Behavior that cannot be observed (backend jobs,
emails, third-party integrations, manual workarounds) MUST be flagged "not observable", never
guessed.

### III. Strict Role Separation
- The Crawler is a single LLM + Playwright agent with two modes: `map` (site capability and
  route mapping) and `trace` (documenting one named process). There is no separate explorer.
  It records and does not interpret: it emits facts (steps, states, network calls, outcomes),
  a few flagged `rule_candidates`, and open questions. It records processes at status
  `recorded` only and MUST NOT verify them or write tests. For every recorded action it stores
  ranked candidate locator descriptors (role + name, label/text, `data-testid`, container,
  ARIA snapshot reference) that QA can reuse. Its deterministic pieces (fingerprinting, safety
  classification, scope checks, PII scrubbing, DB access via MCP) are tools it calls and MUST
  NOT be overridable by the agent.
- The BA never browses: it works only from recorded evidence and requests more via follow-up
  tasks to the crawler. It owns requirements, the glossary, and the assumptions and
  open-questions log.
- QA generates acceptance tests only from human-confirmed requirements. Characterization tests
  MAY come from recorded processes and BA documentation alone. QA owns and reuses the helper
  library and validates crawler locators before relying on them.
A role MUST NOT perform another role's duties. Its output is validated against schemas.

### IV. Replay Verification Before Promotion
A recorded process MUST be verified by running the QA-generated deterministic specs for it from
a reset state, matching per-step expected outcomes, before it reaches `replay_verified`. Status
promotion (recorded → replay_verified → documented; draft → confirmed → tested) is performed by
deterministic orchestrator code from run results, never by an agent claiming success.

### V. Safety-First Exploration (NON-NEGOTIABLE)
Every action MUST be classified read-only, mutating, destructive, or external-side-effect;
ambiguity is treated as unsafe. Mutating and destructive actions MUST run only against a
sandbox or staging environment with resettable seed data, enforced by an environment guard.
CAPTCHAs MUST NOT be solved by automation; they are removed or bypassed in the test
environment. PII in traces and screenshots MUST be scrubbed or access-restricted.

Production policy:
- A production target MUST be declared with `environment: production` in its portal config;
  without that flag the environment guard refuses to run against it.
- On production the environment guard MUST allow only read-only actions, enforced in code.
- A production run MUST use a conservative rate limit, low concurrency, and an identifiable
  User-Agent or header.
- `robots.txt` and the site's terms MUST be checked before the first run against a portal.
- Anti-bot or CAPTCHA defenses MUST NOT be worked around. A block is recorded as a run-level
  warning and the run stops.
Rationale: read-only crawling of a live site is acceptable only when it cannot change the
site's data and cannot degrade or evade its protections.

### VI. Human-in-the-Loop Validation
Requirements enter as `draft` and become `confirmed` only through explicit human BA approval.
Open questions are a first-class deliverable. Test self-healing is proposal-only: a locator or
requirement fix is presented as a diff and applied only after human approval.

### VII. Deterministic Core, Pure Functions, Static Outputs
Fingerprinting, safety classification, and analysis MUST be pure functions with no browser or
LLM dependency and MUST be unit-tested against saved fixtures (ARIA snapshots, HARs, labeled
action descriptors). Structured JSON validated by Zod schemas is the intermediate format;
Markdown, Mermaid and Gherkin are rendered from it. Generated tests MUST be plain static
`.spec.ts` files that run with no LLM.

## Technical Constraints

- **Stack**: Node 22+, TypeScript (strict), pnpm workspaces monorepo with one package per module;
  Playwright library for the crawler and `@playwright/test` for generated tests, kept separate.
- **App layout**: every app, whatever its language (TypeScript, Python or other), lives in its
  own `apps/<name>/` folder and is self-contained: its own manifest, lockfile, lint, type and test
  config, and tests. The repo root holds no language manifest (`package.json`, `pyproject.toml`,
  …), so languages never compete for it.
- **Python tooling**: `uv` manages any Python app (`pyproject.toml` and `uv.lock` inside its
  `apps/<name>/`), for example the operator dashboard, offline scripts or NLP/embedding work such
  as glossary consolidation.
  Python is an addition, not a replacement: the crawler, MCP server, schemas, generated tests
  and the monorepo stay Node/TypeScript with pnpm. Python code MUST NOT sit on the crawler's
  runtime path and MUST NOT write to the DB except through the same schemas and migrations. A
  read-only operator dashboard MAY read the SQLite store directly over a read-only connection
  (`mode=ro`); its read models MUST be tested against the migrations for drift.
- **Storage**: SQLite (better-sqlite3 with Kysely or Drizzle) including a `jobs` table for the
  queue; evidence on the filesystem under content-addressed (sha256) names. Postgres or a graph
  DB requires a documented justification.
- **Schemas**: Zod is the single source of truth for agent output, MCP inputs, and DB writes.
- **Agent interface**: agents access the DB only through the MCP server (`@modelcontextprotocol/sdk`)
  and never write raw SQL or invent IDs. Tasks have a narrow prompt, budget, and stop condition.
- **Portals and personas**: a portal config (`portals/<portal>/portal.yaml`) describes where to
  crawl (base URL, `environment`, scope, denylist, obstacles). A persona
  (`personas/<portal>/[<process>/]<persona>.yaml`, with shared pieces in `personas/_mixins/`)
  describes who acts. Personas MUST be composable via `extends`, validated by Zod, and MUST
  reference secrets by reference only, never inline. The effective safety ceiling of a run is
  the minimum of the portal's and the persona's: a persona can only restrict, never widen.
- **Data model**: two layers, A (mechanical UI state graph) and B (semantic process graph);
  Layer B is the BA deliverable and Layer A is its evidence.
- **Generated test rules**: locator priority is getByRole, getByLabel, getByText, getByTestId,
  then CSS/XPath as a last resort. `waitForTimeout`, conditional logic in tests, and assertions
  hidden in page objects are banned. Tests are independent, tagged (`@REQ-…`, `@process:…`,
  `@characterization` or `@acceptance`), built on fixtures and reusable components, with API/DB
  arrange steps. Enforced mechanically by eslint-plugin-playwright and `tsc --noEmit`.
- **Logging**: pino structured JSON; every skip, merge, and split is auditable via a decision log.

## Development Workflow & Quality Gates

- Development follows the build order: fingerprint → core schemas and migrations → safety
  classifier → portal and persona loaders → MCP server → crawler agent on the first target
  portal (rendering the graph to Mermaid) → QA helper library, spec generation and runner (whose
  runs verify processes) → downstream docs.
- Pure-function packages MUST have Vitest unit tests before dependent packages build on them.
- Mutating tests and exploration MUST target a resettable demo app or a sandbox. Production
  targets are read-only under the production policy in Principle V.
- Failures are triaged rules-first (brittleness, environment, defect, requirement drift), and
  only ambiguous cases go to a triager agent. A repeated failure pattern is fixed by extending
  the shared obstacle library, not by editing individual tests.
- Coverage is measured at process and requirement level, not code coverage. Flaky tests are
  tracked and quarantined with an explicit tag.
- Every feature plan MUST include a Constitution Check against the principles above.

## Governance

This constitution supersedes other practices in this repository. Amendments require a written
proposal, a version bump, an update of the Sync Impact Report, and propagation to any affected
specs, plans, or agent definitions before merge. Versioning follows semantic versioning:
MAJOR for backward-incompatible removal or redefinition of principles, MINOR for a new principle
or materially expanded guidance, PATCH for clarifications and wording. Every spec, plan, and
pull request review MUST verify compliance; any violation MUST be justified in writing in the
plan's complexity-tracking section or be corrected. Runtime guidance for agents lives in
`user_input/raw_idea/agents/` until moved into the `agents/` and `skills/` packages.

**Version**: 1.3.0 | **Ratified**: 2026-09-20 | **Last Amended**: 2026-09-25
