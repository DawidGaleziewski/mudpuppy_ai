# Guideline proposals (T011, spec 012)

To be rated by the user (accept / amend / reject). Only accepted or amended items go into
`docs/code-guidelines.md` (T013). "Checked by" says how the rule is enforced.

## A. Size and shape

- **G-01** A source file has at most **400 lines** (blank lines and comments not counted).
  Why: an agent can read the whole file in one go and edit with the full picture. Checked by:
  lint `max-lines` (warning), reviewer.
- **G-02** A function has at most **80 lines**; tests are exempt. Why: long functions mix
  concerns and are where partial-view edits go wrong (`processPage` 260 lines). Checked by: lint
  `max-lines-per-function` (warning), reviewer.
- **G-03** Cyclomatic complexity at most **15**, nesting depth at most **4**. Checked by: lint
  `complexity`, `max-depth` (warnings); ruff `C901` report for Python.
- **G-04** At most **5 positional parameters**; beyond that, pass one context or options object.
  Optional trailing parameters are not added to grow a function (use the context object). Why:
  `processPage(ctx, run, rs, via, depth, step?, reloginTarget?)`. Checked by: lint `max-params`,
  reviewer.
- **G-05** One concern per file; the file name says the concern (`settle.ts`, `record-state.ts`,
  not `utils.ts`/`helpers.ts`/`misc.ts`). Checked by: reviewer.
- **G-06** Existing large files are split only when a feature touches them (boy-scout rule), apart
  from the three hubs and `core` handled in R-34. Checked by: reviewer (flags new growth of an
  over-limit file).

## B. Layers and boundaries

- **G-07** Four layers, imports only downward: **kernel** (`core`, `fingerprint`, `obstacles`) →
  **models** (`config`, `safety`, feature-model packages, `trace`) → **store** (DB access, table
  types, migrations runner) → **features and servers** (`crawler`, `docs`, `vault`, `wireframe`,
  `workflow`, `mcp-server`, `chat`, `gates`). Checked by: `layers.test.ts` (package graph).
- **G-08** The kernel has no `@pathfinder/*` dependency and no browser, LLM or DB code. Checked by:
  `layers.test.ts`, reviewer.
- **G-09** A feature's Zod schemas live in that feature's model package, not in `core`. A schema
  moves to `core` only when two or more unrelated features need it **and** it describes the crawl
  model itself. Checked by: reviewer.
- **G-10** Chat schemas (conversation, workflow step, process scope, amendment) go to a new
  `@pathfinder/chat-model` package (alternative to rate: put them in `packages/workflow`).
  Checked by: `layers.json`.
- **G-11** No re-export shims that hide a dependency direction (e.g. `core` re-exporting `docs`
  types). Checked by: `layers.test.ts`, reviewer.
- **G-12** Inside a package, other code imports a folder only through its `index.ts` (e.g. MCP
  tools import `runtime/index`, never `runtime/pipeline/*`). Checked by: ESLint
  `no-restricted-imports`.
- **G-13** Dashboard: a page router never imports another page router; shared helpers live in
  `web/deps.py` or a `queries_*.py` module. Checked by: reviewer (and a pytest import check if
  cheap).

## C. Patterns for adding things

- **G-14** **New MCP tool**: input shape and description in `tools/index.ts` (or
  `ba-tools/index.ts`) stay a thin wrapper; the logic goes in `services/<tool-name>.ts` with its
  unit tests; agent-callable tools are added to the allowlist constant and the agent definition.
  Checked by: reviewer.
- **G-15** **New dashboard page**: one router module in `web/<page>.py`, its template in
  `templates/<page>.html`, its fragments in the same router, read queries in a `queries_*.py`
  module, a route test in `tests/test_<page>.py`; no SQL in routers. Checked by: reviewer.
- **G-16** **New table or column**: always through the `db-admin` agent: Zod schema in the
  owning model package, reversible migration (`NNNN_name.up/down.sql`), regenerated
  `data/schema/schema.sql`, a dashboard read model if the dashboard reads it (drift test).
  Checked by: drift test, reviewer.
- **G-17** **New gate case**: one `gate('<id>', …)` per catalogued obstacle or logged finding; a
  known-but-unfixed case is a `gap()`, promoted to `gate()` when fixed. Checked by: gate harness id
  check.
- **G-18** **New crawl pipeline step**: a file in `runtime/pipeline/`, a function taking the
  `StepContext`, wrapped in `step(name, …)`; it returns decisions and events instead of writing the
  decision log or tracer itself. Checked by: reviewer.

## D. Code style

- **G-19** Comments explain **why** (a rule, a trade-off, a spec decision), not what the next line
  does. Spec/finding ids in comments (`FR-020`, `F-15`) are kept: they link code to decisions.
  Checked by: reviewer.
- **G-20** No dead code and no commented-out code; delete it (git keeps history). Checked by:
  reviewer, lint `no-unused-vars`.
- **G-21** Every async call is awaited, returned, or explicitly `void`ed with a one-line reason
  (fire-and-forget). Checked by: lint `no-floating-promises`, `no-misused-promises` (errors).
- **G-22** No `any`; use `unknown` and narrow, or a Zod parse at the boundary. Exceptions with a
  comment for Playwright `evaluate` results. Checked by: lint `no-explicit-any`; typed `no-unsafe-*`
  rules as warnings first.
- **G-23** Lint suppressions (`eslint-disable`, `@ts-expect-error`, `noqa`, `type: ignore`) name the
  rule and give a reason on the same line; never file-wide. Checked by: lint
  `eslint-comments/require-description` (or reviewer).
- **G-24** Errors crossing a tool or HTTP boundary are typed (`ToolError` codes, HTTP status +
  plain message); no bare `throw new Error('…')` reaching the agent or the BA. Checked by: reviewer.

## E. Tests

- **G-25** Tier by kind: pure/unit tests and small browser unit tests in the fast tier; anything
  that drives a whole run through the MCP harness is `*.e2e.test.ts` (slow tier); gates stay in
  `packages/gates`. Checked by: reviewer, test-time budget.
- **G-26** A fast-tier test file runs in under **2 s**; slower ones become e2e or are split.
  Checked by: a Vitest duration report in the close-out.
- **G-27** Tests assert behaviour (inputs → outputs, recorded rows), not implementation details
  (private call order, mock call counts) unless the order is the behaviour (decision log). Checked
  by: reviewer, mutation testing.
- **G-28** No `waitForTimeout`/sleep in tests; wait on a condition. Fake values only for secrets
  (`test-key-not-real`). Checked by: lint (`no-restricted-syntax` on `waitForTimeout`), reviewer.
- **G-29** A refactor starts by locking behaviour (existing tests, or a golden snapshot) and ends
  with an unchanged lock. Checked by: `refactor-code` skill, reviewer.

## F. Agent notes and process

- **G-30** Every package and app has a `CLAUDE.md` (≤ ~60 lines) with: purpose, layer, public API
  and its users, invariants, where to add things, test command and tier, spec links (template in
  `contracts/agent-notes.md`). Updated in the same commit that changes any of those. Checked by:
  reviewer.
- **G-31** At the end of every feature, before the changelog, the `code-reviewer` agent reviews
  the branch's diff; `small` findings are fixed, `large` ones become follow-ups. Checked by: the
  feature workflow in CLAUDE.md.
- **G-32** Mutation testing (`pnpm mutate`) is run on demand on the kernel when a kernel package
  changed in a feature, not on every commit. Checked by: close-out checklist.
