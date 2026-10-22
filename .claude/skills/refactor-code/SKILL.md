---
name: refactor-code
description: How to refactor MudPuppy code to the rated code guidelines without changing behaviour — lock behaviour first, extract then move, one file per change, the right test tier after each step, and how to judge a finding small (fix now) or large (defer). Use when splitting a long function or file, moving code between packages or routers, or fixing a guideline finding. Not for bug hunting or new features.
---

# Refactor code (no behaviour change)

The rules a refactor is measured against are `docs/code-guidelines.md` (G-01–G-32) and the
`CLAUDE.md` of the package you touch. This skill is the *how*.

## 1. Lock behaviour first (G-29)

Before moving a line, know which test proves nothing changed:
- Existing tests that exercise the code (find them: `grep -rl <function> */tests`).
- Pipeline code (`mcp-server/src/runtime/**`): `tests/pipeline-golden.e2e.test.ts` snapshots
  states, transitions, the decision log in order and the trace span tree. It must stay identical.
- Dashboard routes: the route tests request every page and fragment.
- No test covers it: write a characterisation test of today's output first, in its own change.

## 2. Extract, then move

- Extract inside the file first (a long function → named helpers next to it), run the tier, then
  move the helpers to their own file. Two small steps are easier to verify than one big one.
- Copy code exactly; change only what the move forces (imports, parameter passing). A rename or a
  logic tweak is a separate change.
- When a function has grown positional or optional parameters, pass one context or options object
  (G-04) — e.g. `StepContext` in `runtime/pipeline/context.ts`, `RefusalTarget` in `gate.ts`.
- Moving names between packages: no re-export shim (G-11); update every importer and the importer's
  `package.json`; the layers test (`apps/crawler/tests/layers.test.ts`) must stay green.
- Edit with the Edit tool; formatters (`prettier`, `ruff format`) only on the files you touched.

## 3. Run the right tier after each step

- Every step: `pnpm typecheck && pnpm lint && pnpm test:fast` in `apps/crawler` (dashboard:
  `uv run ruff check && uv run pytest -n auto`).
- Also `pnpm test:slow` when you touched `mcp-server/src/runtime/**`, `crawler/src/**`, `gates/**`
  or the proving ground.
- `pnpm lint:report` shows whether size/complexity warnings went down (they must not go up).

## 4. Small or large?

- **small** — behaviour-neutral, one file (or one function and its new helper file), no public API
  change outside the package, done and green within one short step. Fix it now.
- **large** — changes behaviour, a public export used by other packages, a DB or tool contract, or
  needs more than one sitting. Do not start it: record it as a follow-up with the guideline id.
- Unsure → large.

## 5. Finish

- Package `CLAUDE.md` updated when the layout, public API or "where to add" changed (G-30).
- Commit message lists what moved where and which lock stayed unchanged.
