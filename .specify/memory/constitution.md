<!--
SYNC IMPACT REPORT (temporary; remove before commit)
Version change: template (unversioned) → 1.0.0
Modified principles: none renamed (initial adoption; all placeholders filled)
Added sections: Core Principles I–VII, Technical Constraints, Development Workflow & Quality
  Gates, Governance
Removed sections: none
Deferred items: none. Ratification date set to first adoption date (2026-09-20).
Sources: user_input/raw_idea/{START_HERE,raw-constitution,tech-stack}.md, agents/{ba,crawler,qa}.md
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
- The Crawler records and does not interpret: it emits facts (steps, states, network calls,
  outcomes), a few flagged `rule_candidates`, and open questions.
- The BA never browses: it works only from recorded evidence and requests more via follow-up
  tasks to the crawler. It owns requirements, the glossary, and the assumptions and
  open-questions log.
- QA generates acceptance tests only from human-confirmed requirements. Characterization tests
  MAY come from replay-verified recordings alone. QA owns and reuses the helper library.
A role MUST NOT perform another role's duties. Its output is validated against schemas.

### IV. Replay Verification Before Promotion
A recorded process MUST be deterministically replayed from a reset state and match per-step
state fingerprints and expected outcomes before it reaches `replay_verified`. Status promotion
(recorded → replay_verified → documented; draft → confirmed → tested) is performed by
deterministic orchestrator code, never by an agent claiming success.

### V. Safety-First Exploration (NON-NEGOTIABLE)
Every action MUST be classified read-only, mutating, destructive, or external-side-effect;
ambiguity is treated as unsafe. Mutating and destructive actions MUST run only against a
sandbox or staging environment with resettable seed data, enforced by an environment guard.
CAPTCHAs MUST NOT be solved by automation; they are removed or bypassed in the test
environment. PII in traces and screenshots MUST be scrubbed or access-restricted.

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
- **Storage**: SQLite (better-sqlite3 with Kysely or Drizzle) including a `jobs` table for the
  queue; evidence on the filesystem under content-addressed (sha256) names. Postgres or a graph
  DB requires a documented justification.
- **Schemas**: Zod is the single source of truth for agent output, MCP inputs, and DB writes.
- **Agent interface**: agents access the DB only through the MCP server (`@modelcontextprotocol/sdk`)
  and never write raw SQL or invent IDs. Tasks have a narrow prompt, budget, and stop condition.
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
  classifier → crawler on a controlled demo app → MCP server → replay verifier → downstream
  docs, testgen and runner.
- Pure-function packages MUST have Vitest unit tests before dependent packages build on them.
- Exploration and mutating tests MUST target the resettable local demo app or a sandbox.
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

**Version**: 1.0.0 | **Ratified**: 2026-09-20 | **Last Amended**: 2026-09-20
