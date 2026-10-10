# Code guidelines

How code in this repo is shaped, layered and tested. Every rule was proposed in spec 012 (R-34)
and accepted by the project owner on 2026-10-07 (`specs/012-maintainability/guideline-review.md`);
G-33 and G-34 were set by the owner directly on 2026-10-10 (R-46).
Agents read this before writing code; the `code-reviewer` agent checks branches against it and
cites the ids.

Each rule: **id**, the rule, *why*, and how it is checked. Changing a rule means a new rating
(propose, rate, then edit this file), not a silent edit.

Precedence: the constitution (`.specify/memory/constitution.md`) and CLAUDE.md win over this file;
this file wins over habits found in existing code.

## A. Size and shape

- **G-01** A source file has at most **400 lines** (blank lines and comments not counted).
  *Why:* an agent can read the whole file in one go and edit with the full picture.
  Checked by: lint `max-lines` (warning), reviewer.
- **G-02** A function has at most **80 lines**; tests are exempt.
  *Why:* long functions mix concerns and are where partial-view edits go wrong (`processPage` had
  260 lines). Checked by: lint `max-lines-per-function` (warning), reviewer.
- **G-03** Cyclomatic complexity at most **15**, nesting depth at most **4**.
  Checked by: lint `complexity`, `max-depth` (warnings); ruff `C901` report for Python.
- **G-04** At most **5 positional parameters**; beyond that, pass one context or options object.
  Optional trailing parameters are not added to grow a function; extend the context object
  instead. *Why:* `processPage(ctx, run, rs, via, depth, step?, reloginTarget?)`.
  Checked by: lint `max-params`, reviewer.
- **G-05** One concern per file; the file name says the concern (`settle.ts`, `record-state.ts`,
  not `utils.ts`, `helpers.ts`, `misc.ts`). Checked by: reviewer.
- **G-06** Existing large files are split only when a feature touches them (leave it better than
  you found it), apart from the hubs and `core` handled in R-34. Checked by: reviewer (flags new
  growth of a file already over a limit).

## B. Layers and boundaries

- **G-07** Four layers, imports only downward:
  1. **kernel**: `core`, `fingerprint`, `obstacles`
  2. **models**: `config`, `safety`, the feature-model packages (`docs-model`, `chat-model`), `trace`
  3. **store**: DB access, table types, migrations runner
  4. **features and servers**: `crawler`, `docs`, `vault`, `wireframe`, `workflow`, `mcp-server`,
     `chat`, `gates`, `reference-portal`

  The authoritative list is `apps/crawler/layers.json`. Checked by: `layers.test.ts`.
- **G-08** The kernel has no `@pathfinder/*` dependency and no browser, LLM or DB code.
  Checked by: `layers.test.ts`, reviewer.
- **G-09** A feature's Zod schemas live in that feature's model package, not in `core`. A schema
  moves to `core` only when two or more unrelated features need it **and** it describes the crawl
  model itself. Checked by: reviewer.
- **G-10** Chat schemas (conversation, workflow step, process scope, amendment) live in
  `@pathfinder/chat-model`. Checked by: `layers.json`.
- **G-11** No re-export shims that hide a dependency direction (e.g. `core` re-exporting `docs`
  types). Checked by: `layers.test.ts`, reviewer.
- **G-12** Inside a package, other code imports a folder only through its `index.ts` (e.g. MCP
  tools import `runtime/index`, never `runtime/pipeline/*`). Checked by: ESLint
  `no-restricted-imports`.
- **G-13** Dashboard: a page router never imports another page router; shared helpers live in
  `web/deps.py` or a `queries_*.py` module. Checked by: reviewer.

## C. Patterns for adding things

- **G-14** **New MCP tool**: the input shape and description in `tools/index.ts` (or
  `ba-tools/index.ts`) stay a thin wrapper; the logic goes in `services/<tool-name>.ts` with its
  unit tests. Agent-callable tools are added to the allowlist constant and the agent definition.
  Checked by: reviewer.
- **G-15** **New dashboard page**: one router module `web/<page>.py`, its template
  `templates/<page>.html`, its fragments in the same router, read queries in a `queries_*.py`
  module, a route test `tests/test_<page>.py`; no SQL in routers. Checked by: reviewer.
- **G-16** **New table or column**: always through the `db-admin` agent: the Zod schema in the
  owning model package, a reversible migration (`NNNN_name.up.sql` / `.down.sql`), regenerated
  `data/schema/schema.sql`, and a dashboard read model if the dashboard reads it (drift test).
  Checked by: drift test, reviewer.
- **G-17** **New gate case**: one `gate('<id>', …)` per catalogued obstacle or logged finding; a
  known but unfixed case is a `gap()`, promoted to `gate()` when fixed. Checked by: the gate
  harness id check.
- **G-18** **New crawl pipeline step**: a file in `runtime/pipeline/`, a function taking the
  `StepContext`, wrapped in `step(sc, name, …)`; it returns `reported(value, [decision(…),
  event(…)])` instead of writing the decision log or tracer itself, and `step()` writes them in
  order inside the step's span. A step that fails after reporting uses `fail(reports, error)` /
  `orFail(reports, promise)` (refusals: `refuse(…, reports)`), so nothing it saw is lost. Report
  builders (`gateEvent`, `settleReports`, `frontierReports`, …) are plain functions with unit tests.
  Exceptions: `stop.ts` (run lifecycle) and the tools' end-of-call obstacle flush.
  Checked by: lint `no-restricted-syntax` in `runtime/pipeline/**`, reviewer.

## D. Code style

- **G-19** Comments explain **why** (a rule, a trade-off, a spec decision), not what the next line
  does. Spec and finding ids in comments (`FR-020`, `F-15`) stay: they link code to decisions.
  Checked by: reviewer.
- **G-20** No dead code and no commented-out code; delete it (git keeps the history).
  Checked by: reviewer, lint `no-unused-vars`.
- **G-21** Every async call is awaited, returned, or explicitly `void`ed with a one-line reason
  (fire-and-forget). Checked by: lint `no-floating-promises`, `no-misused-promises` (errors).
- **G-22** No `any`: use `unknown` and narrow, or parse with Zod at the boundary. Playwright
  `evaluate` results may be an exception, with a comment. Checked by: lint `no-explicit-any`;
  typed `no-unsafe-*` rules as warnings first.
- **G-23** A lint suppression (`eslint-disable`, `@ts-expect-error`, `noqa`, `type: ignore`)
  names the rule and gives a reason on the same line; never file-wide. Checked by: lint where
  available, reviewer.
- **G-24** Errors crossing a tool or HTTP boundary are typed (`ToolError` codes, HTTP status plus
  a plain message); no bare `throw new Error('…')` reaches the agent or the BA.
  Checked by: reviewer.
- **G-33** Eval and harness code, docs and agent notes use **Anthropic's eval terminology**
  ([Demystifying evals for AI agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)):
  *task*, *trial*, *evaluation suite*, *grader* (code-based / model-based / human), *transcript*,
  *outcome*, *evaluation harness*, *agent harness*, *reference solution*. A new eval concept takes
  Anthropic's name when one exists; a term of our own is added only when they have none. The
  mapping lives in `apps/crawler/evals/README.md` (Terminology). Kept on purpose: *ground truth*
  (owner decision 2026-10-10) and the crawler's domain terms (*crawl run*, *state*, *frontier*),
  which are not eval terms. *Why:* one vocabulary across our code, the material the owner learns
  from, and the agents that read both. New evals follow the `create-eval` skill (layout, naming).
  Checked by: reviewer.
- **G-34** **Ground truth is written in YAML** (`.yaml`), never JSON: one file per portal, read
  with `readGroundTruth()` (`@pathfinder/docs`) or `loadGroundTruth()`
  (`@pathfinder/reference-portal`) and validated by the `GroundTruth` schema. A file starts with a
  comment naming the portal. *Why:* people write and review it by hand; YAML allows comments and is
  far easier to read than JSON (`learning/11-writing-ground-truth.md`). Checked by: the readers
  (paths in `apps/crawler/evals/tasks.ts` and the self-check tests), reviewer.

## E. Tests

- **G-25** Tier by kind: pure and unit tests, including small browser unit tests, are in the
  fast tier; anything that drives a whole run through the MCP harness is `*.e2e.test.ts` (slow
  tier); gates stay in `packages/gates`. Checked by: reviewer, test-time budget.
- **G-26** A fast-tier test file runs in under **2 s**; slower ones become e2e or are split.
  Checked by: a Vitest duration report in the close-out.
- **G-27** Tests assert behaviour (inputs → outputs, recorded rows), not implementation details
  (private call order, mock call counts), unless the order is the behaviour (decision log).
  Checked by: reviewer, mutation testing.
- **G-28** No `waitForTimeout` or sleeps in tests; wait on a condition. Secrets in tests are
  obviously fake (`test-key-not-real`). Checked by: lint (`no-restricted-syntax` on
  `waitForTimeout`), reviewer.
- **G-29** A refactor starts by locking behaviour (existing tests or a golden snapshot) and ends
  with the lock unchanged. Checked by: the `refactor-code` skill, reviewer.

## F. Agent notes and process

- **G-30** Every package and app has a `CLAUDE.md` (about 60 lines at most): purpose, layer,
  public API and its users, invariants, where to add things, test command and tier, spec links
  (template: `specs/012-maintainability/contracts/agent-notes.md`). It is updated in the same
  commit that changes any of those. Checked by: reviewer.
- **G-31** At the end of every feature, before the changelog, the `code-reviewer` agent reviews
  the branch's diff; `small` findings are fixed, `large` ones become follow-ups.
  Checked by: the feature workflow in CLAUDE.md.
- **G-32** Mutation testing (`pnpm mutate`) runs on demand on the kernel when a feature changed a
  kernel package, not on every commit. Checked by: the close-out checklist.
