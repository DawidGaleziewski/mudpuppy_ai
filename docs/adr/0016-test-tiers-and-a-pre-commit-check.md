# ADR-0016: Test tiers and a pre-commit check

- **Status:** Accepted
- **Date:** 2026-10-07 (spec 012, R-34); git hook and console checks 2026-10-24 (spec 076, R-105)

## Context

Before R-34 any crawler edit ran the whole suite before a commit: 5 min 40 s, browser end-to-end
files and gates included. Agents commit often, so the check had to be fast without letting a red
commit through.

## Decision

- **Fast tier** (every commit): typecheck, lint and only the tests a change can affect:
  `vitest run --changed --project='!gates' --exclude='**/*.e2e.test.ts'`. Vite's module graph
  follows workspace imports; files the graph cannot see (migrations, portal and persona configs,
  harness files) are force-rerun triggers.
- **Slow tier**: the browser end-to-end files (named `*.e2e.test.ts`) and the whole gate set; run
  before committing a change to the crawler runtime, gates, crawler source or proving ground.
- **Everything** (`pnpm test` plus every app's suite) in the feature close-out, before merge.
- Dashboard tests run in parallel (`pytest -n auto`), then the wall-clock and load-sensitive tests
  alone (`perf` / `serial` markers).
- One script, `.githooks/checks.sh`, runs the suites the changed paths can break and blocks a red
  commit. Since R-105 it is a git pre-commit hook (`git config core.hooksPath .githooks`) and
  includes `pnpm check` in `apps/web`; Claude Code's hook runs the same script where the git hook
  is not installed.

## Consequences

- Good: the commit check went from 5 min 40 s to about 20 s; the slow tier from 340 s to 163 s;
  dashboard tests from 1 min 48 s to 35 s.
- Good: "never commit an intermediate state that doesn't build" is enforced, not just asked for.
- Bad: the fast tier can miss a break the module graph does not see; the slow tier and the
  close-out run catch it later.
- Bad: a `package.json` change anywhere runs the whole fast tier (accepted).

## Alternatives considered

- Nx or Turborepo "affected": package-level only and a new build system; rejected.
- A separate `e2e` Vitest project per package, or test tags: more config, or not native in
  Vitest.
- `pytest-testmon` for Python: keeps a state DB and was flaky with fixture DBs; rejected for now.

## Sources

- `specs/012-maintainability/research.md` R1, R2, R4, R5; `spec.md` FR-001–FR-003
- `specs/076-r105-frontend-architecture/spec.md` FR-010, `tasks.md` T012
- `.githooks/checks.sh`; `CLAUDE.md` (Verification Before Commit)
- `docs/code-guidelines.md` G-25, G-26
- `CHANGELOG.md` R-34 entry; R-105 entry; "Owner decisions of 2026-10-14" (`serial` marker)
