<!--
SYNC IMPACT REPORT (amendment history, newest first)
Version change: 6.0.0 → 6.0.1 (PATCH: wording only; the product's old name, Pathfinder AI, is
MudPuppy in every name the constitution uses: packages, servers, env vars; R-83, spec 041)
Version change: 5.0.0 → 6.0.0 (MAJOR: redefines the data model and Principle III's outputs;
MudPuppy 2.0, spec 039, R-81)
Modified principles: III. Strict Role Separation: the crawler emits flagged hypotheses instead of
`rule_candidates`; replays and probes MAY be run by deterministic code (the headless driver)
through the same gated tools. VI. Human-in-the-Loop Validation: new "Derived facts" rule (the
reconciler records facts that follow from evidence by a published rule, R1–R8 and clustering under
person-made labels, without approval; reversible; overturns bind later reconciles; agents may save
proposals directly).
Modified sections: Product rule (agents' proposals may be saved, marked as theirs); Technical
Constraints ▸ Data model (three layers A, M, B plus interpretation), ▸ Python (an analysis worker
reads the store read-only; its output is written only through a TypeScript command that validates
it with Zod), ▸ Logging (lineage and hypothesis events are the decision log of merges and splits).
User decisions 2026-10-18: "We will do a full blown change as suggested" (user_input/system_design/
Design.md); 2026-10-18 night: "Reviewed design.md all seems fine. Proceed." (design § 18 is the
proposal applied here). Covers R-78 C1 (agent groupings saved as proposals).
Templates/specs checked: specs/039-mudpuppy-2-portal-model (spec, design, plan Constitution
Check); agent definitions `.claude/agents/crawler.md`, `ba.md` and `apps/chat/agents/orchestrator.md`
change with the tools in spec 039 M3 and M5 (T055, T076, T077).
Previous change: 4.0.0 → 5.0.0 (MAJOR: removes the production policy from Principle V; adds the
to-be product rule; spec 021, R-42)
Modified principles: V. Safety-First Exploration: every environment is equal; `environment` is a
label. The action limit is optional (omitted = no limit) and set by the BA per portal,
environment or persona; classification and enforcement of a set limit stay in code. Removed: the
production-address check, the required rate limit and identifiable User-Agent on production,
stopping on CAPTCHA/anti-bot on production (a CAPTCHA is handed to a human on every
environment, never solved by automation), Playwright traces only off production.
Added sections: "Product rule" (MudPuppy records the as-is; people draw the to-be in it; the
assistant only proposes). Modified sections: Testing ("production targets are read-only" removed).
User decisions 2026-10-13: "I don't care about production guard. We should not have it at all to
begin with. REMOVE IT."; design open item O-1 answered "records as-is, people draw to-be".
Templates/specs checked: spec 001 FR-011, spec 002 FR-005/FR-006/FR-018/FR-026, spec 009 FR-022,
spec 011 phase 2 (superseded notes added); docs/portal-config.md.
Previous change: 3.0.0 → 4.0.0 (MAJOR: removes production read-only from Principle V; spec 011
phase 2, R-31)
Modified principles: V. Safety-First Exploration: production is no longer read-only by rule.
Every environment of a portal (production, staging, sandbox) has its own action limit set by
the BA; on production the crawler may fill, submit and log in up to that limit. The compliance
gate (robots/terms review dates required on production) is removed: the BA owns that. Still in
force on production: declaring `environment: production` for a production-looking address,
a rate limit and identifiable User-Agent, and stopping (never working around) CAPTCHA/anti-bot
blocks. A portal may hold several environments; each run records the one it targets.
User decisions 2026-10-06: "If i say production should be scanned let it be production",
"Allow writes on prod", "One portal, many envs".
Templates/specs checked: specs/011-portal-onboarding phase 2; spec 001 FR-011 and spec 002
FR-026 (production read-only, compliance gate) superseded by this version.
Previous change: 2.1.0 → 3.0.0 (MAJOR: redefines part of Principle V, NON-NEGOTIABLE; spec 011, R-31)
Modified principles: V. Safety-First Exploration: the robots.txt and terms check "before the
first run against a portal" becomes the BA's choice per portal: a portal may set `robots: ignore`
(no robots.txt fetch, no robots refusals). The BA owns that choice for the sites they work on and
migrate. User decision 2026-10-06 ("Fuck robots. Fuck constraints."). Production stays read-only
and keeps its rate-limit, User-Agent and anti-bot rules.
Added sections: none
Removed sections: none
Templates/specs checked: specs/011-portal-onboarding (spec, tasks); specs/002 robots FR-001..
FR-009 stay the default behaviour (`robots: respect`).
Deferred items: none
Previous change: 2.0.0 → 2.1.0 (MINOR: materially expanded layout guidance; spec 010, R-30)
Modified principles: none
Modified sections: Technical Constraints, "App layout" bullet: TypeScript apps and shared
`packages/*` form one root pnpm workspace with one root `pnpm-lock.yaml` (workspace config, not a
language manifest); isolated apps (proving ground) MAY keep their own workspace and lockfile;
Python apps keep their own `uv.lock`. Replaces "every app has its own lockfile". User decision
2026-10-05.
Added sections: none
Removed sections: none
Templates/specs checked: specs/010-acp-chat-orchestrator plan Constitution Check and research R10
(updated); CLAUDE.md Monorepo Layout (consistent: apps/ and packages/, pnpm workspaces)
Deferred items: none
Previous change: 1.4.0 → 2.0.0 (MAJOR, spec 008: PII scrubbing optional, non-production runs may
submit forms).
-->
# MudPuppy Constitution

MudPuppy is a tool used by business analysts (BAs) to document existing brownfield web
applications so that they can be re-created, for example on a newer tech stack, from the
documentation alone. It discovers processes with Playwright, records them as evidence-backed
requirements, and generates static tests that verify them.

**Product rule**: MudPuppy records the as-is; people draw the to-be in it; the assistant only
proposes and changes nothing until a person applies it. Agents MAY save their proposals (for
example process groupings) directly, marked as theirs, for people to accept, edit or reject; facts
derived by a published rule follow Principle VI. Recorded evidence is never edited to look like
the to-be.

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
  a few flagged hypotheses (decision rules, ambiguous behaviour), and open questions. Replays,
  probes and boundary tests MAY be run by deterministic code (the headless driver) through the
  same gated tools, without the LLM. It records processes at status
  `recorded` only and MUST NOT verify them or write tests. For every recorded action it stores
  ranked candidate locator descriptors (role + name, label/text, `data-testid`, container,
  ARIA snapshot reference) that QA can reuse. Its deterministic pieces (fingerprinting, safety
  classification, scope checks, optional PII scrubbing, DB access via MCP) are tools it calls and MUST
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
ambiguity is treated as unsafe. The classification is recorded on every edge. The BA MAY set an
action limit per portal, environment or persona; a set limit is enforced in code (the lowest
one wins) and actions above it are never executed. Without a limit every action class is
allowed. Every environment (production, staging, sandbox) is treated the same: `environment`
labels the runs, it changes no behaviour. Map and trace runs MAY fill and submit forms on any
environment; that choice and its consequences on a live site are the BA's. Traces, Playwright
traces and screenshots are stored as recorded, unmasked, on every environment; PII scrubbing of
text evidence is optional per portal.

- A portal MAY hold several environments, each with its own address and optional action limit;
  every run records the environment it targets.
- `robots.txt` is obeyed by default. The BA MAY switch it off per portal (`robots: ignore`) for
  sites they work on; checking the site's terms is then the BA's responsibility.
- CAPTCHAs MUST NOT be solved by automation: a CAPTCHA page is handed to a human (decision note
  and open question) and the crawl goes on elsewhere. Any other block is recorded as a run-level
  warning and the run stops.
Rationale: the BA documents sites they work on and migrate, often only reachable as production;
how far a crawl may change a site is their decision, enforced in code when they set a limit.
User decision 2026-10-13: no production guard.

### VI. Human-in-the-Loop Validation
Requirements enter as `draft` and become `confirmed` only through explicit human BA approval.
Open questions are a first-class deliverable. Test self-healing is proposal-only: a locator or
requirement fix is presented as a diff and applied only after human approval.
Review decisions (confirm, reject, comment) are stored as records with reviewer, time, action and
the revision they apply to; a record's status is derived from them by deterministic code, never
set directly by an agent or a UI.

**Derived facts.** The reconciler MAY record facts that follow from evidence by a published rule
(R1–R8 of spec 039, and clustering under person-made labels) without a person's approval. Each
derived fact names its rule and its evidence, appears in Review, and can be overturned by a person.
An overturn is recorded with a reason and binds later reconciles. Everything else, including any
agent hypothesis, grouping, rule wording or merge, stays a proposal until a person confirms it.
The list of rules that may write derived facts is part of this constitution; adding one is an
amendment, not a code change.

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
  own `apps/<name>/` folder and is self-contained: its own manifest, lint, type and test config,
  and tests. Shared TypeScript code lives in `packages/<name>/`. TypeScript apps and shared
  packages form one pnpm workspace whose `pnpm-workspace.yaml` and single `pnpm-lock.yaml` sit at
  the repo root; that is workspace configuration, not a language manifest. An app that must stay
  isolated (for example the proving ground) MAY keep its own pnpm workspace and lockfile and is
  excluded from the root workspace. Python apps keep their own `uv.lock`. The repo root holds no
  language manifest (`package.json`, `pyproject.toml`, …), so languages never compete for it.
- **Python tooling**: `uv` manages any Python app (`pyproject.toml` and `uv.lock` inside its
  `apps/<name>/`), for example the operator dashboard, offline scripts or NLP/embedding work such
  as glossary consolidation.
  Python is an addition, not a replacement: the crawler, MCP server, schemas, generated tests
  and the monorepo stay Node/TypeScript with pnpm. Python code MUST NOT sit on the crawler's
  runtime path and MUST NOT write to the DB except through the same schemas and migrations. A
  read-only operator dashboard MAY read the SQLite store directly over a read-only connection
  (`mode=ro`); its read models MUST be tested against the migrations for drift. The dashboard
  MAY record human review decisions only by invoking the TypeScript review command
  (`docs:review`), which validates with Zod and writes through the same schemas; the dashboard
  process itself opens the store read-only. A Python analysis worker (decision mining, community
  detection) MAY compute from a read-only store connection; its output is written only through a
  TypeScript command that validates it with Zod (`model:mine`).
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
- **Data model**: three layers. A (evidence: the mechanical UI state graph, append-only), M (the
  portal model, rebuilt by deterministic code from A plus recorded decisions, with stable ids) and
  B (the BA deliverable). Interpretation (deviations, hypotheses, decision rules, process
  proposals) references A and M and never edits them. Layer B documents Layer M; Layer A is the
  evidence of both.
- **Generated test rules**: locator priority is getByRole, getByLabel, getByText, getByTestId,
  then CSS/XPath as a last resort. `waitForTimeout`, conditional logic in tests, and assertions
  hidden in page objects are banned. Tests are independent, tagged (`@REQ-…`, `@process:…`,
  `@characterization` or `@acceptance`), built on fixtures and reusable components, with API/DB
  arrange steps. Enforced mechanically by eslint-plugin-playwright and `tsc --noEmit`.
- **Logging**: pino structured JSON; every skip, merge, and split is auditable via a decision log
  (for screens of the portal model: `screen_lineage` and `hypothesis_events`).

## Development Workflow & Quality Gates

- Development follows the build order: fingerprint → core schemas and migrations → safety
  classifier → portal and persona loaders → MCP server → crawler agent on the first target
  portal (rendering the graph to Mermaid) → QA helper library, spec generation and runner (whose
  runs verify processes) → downstream docs.
- Pure-function packages MUST have Vitest unit tests before dependent packages build on them.
- MudPuppy's own automated tests and gates MUST target a demo app, the proving ground or a
  local reference portal. Exploration MAY target any environment (Principle V).
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

**Version**: 6.0.1 | **Ratified**: 2026-09-20 | **Last Amended**: 2026-10-22
