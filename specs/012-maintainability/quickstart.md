# Quickstart: validating R-34

Prerequisites: ports 4200/4201 free (gates), Chromium libraries installed, `pnpm install` at the
repo root, `uv sync` in `apps/dashboard`. Baseline numbers are in spec.md.

## 1. Test tiers (US1, SC-001, SC-002)

1. In `apps/crawler`, change one line in `packages/fingerprint/src/` (e.g. a comment in a
   function body). Run `time pnpm test:fast`: prints `tier: fast (affected)`, runs only tests that
   import fingerprint code, no `*.e2e.test.ts`, no gates; under 60 s together with typecheck and
   lint. Revert.
2. Change `packages/mcp-server/tests/harness.ts` (a trigger): `pnpm test:fast` prints
   `tier: fast (full: …harness.ts)` and runs every non-e2e test. Revert.
3. `time pnpm test:slow`: runs the e2e files and gates; wall time ≥ 30 % below 5 min 40 s
   (target < 4 min). The gate report lists the same cases as before.
4. Commit through Claude Code with a crawler change: the hook prints `pre-commit: crawler (fast tier)`.
5. `pnpm test`: all green; test count = 1,365 (± the robots test change, no file lost).

## 2. Guidelines (US2, SC-009)

1. `docs/code-guidelines.md` exists; every entry has an id, `checked by` and a rating that matches
   `specs/012-maintainability/guideline-review.md`.
2. Every package under `apps/crawler/packages/`, `packages/workflow`, `apps/chat`, `apps/dashboard`
   has a `CLAUDE.md` following `contracts/agent-notes.md`.
3. Ask a fresh agent "where does a new MCP tool go?" in `apps/crawler/packages/mcp-server`: it
   answers from that package's notes.

## 3. Lint (US5, SC-006)

1. Add `void`-less `someAsync();` in a crawler source file: `pnpm lint` fails with
   `no-floating-promises`. Revert.
2. `pnpm lint:report` matches `lint-baseline.md`; size/complexity findings are warnings only.

## 4. Core and boundaries (US3, SC-004, SC-006)

1. Add `"@pathfinder/docs": "workspace:*"` to `packages/core/package.json`: `pnpm test:fast`
   (trigger: package.json) fails `layers.test.ts` with `layer rule: core (kernel) may not depend
   on docs (features)`. Revert.
2. `packages/core/src/schemas/` holds no doc, chat or trace schema.
3. `uv run pytest` in `apps/dashboard`: schema-drift test green (no DB change).

## 5. Hubs (US4, SC-004, SC-005)

1. The golden lock test passes with an unchanged snapshot on every commit of the split (check
   `git log -p` for snapshot files: none changed without a written reason).
2. No file in `mcp-server/src/runtime/pipeline/` and `dashboard/src/pathfinder_dashboard/web/`
   over 400 lines; no function over 80 (`pnpm lint:report`, ruff report).
3. Dashboard: open every page in the browser (`uv run pathfinder-dashboard`): Overview, a run,
   a state, Docs, Glossary, Chat, portal settings, activity; nothing changed visibly.

## 6. Mutation testing (US6, SC-007)

1. `pnpm mutate --package fingerprint`: report under `data/mutation/stryker/<date>/`, score printed.
2. `pnpm mutate`: kernel packages; the score is in `findings.md`, surviving mutants listed with
   test ideas.
3. `uv run mutmut run` in `apps/dashboard`: summary printed.
4. Neither runs in the commit hook or `pnpm test`.

## 7. Close-out review (US7, SC-008)

1. On a throwaway branch, plant two problems lint does not block: a 120-line function in a
   crawler package (lint only warns) and, in the dashboard, a page router importing a helper from
   another page's router module instead of `web/deps.py`. Commit.
2. Run the `code-reviewer` agent on the branch: its report lists both planted problems with
   guideline ids. Delete the branch.
3. CLAUDE.md feature workflow shows the review step before the changelog.
