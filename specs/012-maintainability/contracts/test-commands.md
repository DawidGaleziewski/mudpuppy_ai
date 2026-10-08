# Contract: test, lint and mutation commands

All run from `apps/crawler/` unless noted. Exit code 0 = green.

| Command | What it runs | Prints |
| --- | --- | --- |
| `pnpm test:fast` | Vitest `run --changed` (staged + unstaged), excluding `**/*.e2e.test.ts` and the `gates` project; whole fast tier when a `forceRerunTriggers` file changed | Vitest summary; first line `tier: fast (affected)` or `tier: fast (full: <trigger file>)` |
| `pnpm test:slow` | all `**/*.e2e.test.ts` files and the `gates` project | `tier: slow`, Vitest summary, gate report as today |
| `pnpm test` | everything (unchanged meaning: the merge check) | as today |
| `pnpm test:slow` → gates | still one file at a time (`fileParallelism: false`, shared estate) | |
| `pnpm lint` | ESLint with typed rules; errors fail, size/complexity warnings do not | ESLint output |
| `pnpm lint:report` | warning counts per rule and package | table, for `lint-baseline.md` |
| `pnpm mutate [--package <name>]` | Stryker on the kernel packages (default) or one package | score, survived mutants; report under `data/mutation/stryker/<date>/` |
| `uv run ruff check --select C901,PLR0912,PLR0913,PLR0915 --exit-zero` (`apps/dashboard`) | Python complexity report | ruff findings, never fails |
| `uv run mutmut run` (`apps/dashboard`) | mutation testing on the configured pure modules | mutmut summary; `uv run mutmut results` lists survivors |
| `uv run pytest -n auto` (`apps/dashboard`) | dashboard suite in parallel (if R4 holds) | pytest summary |

## Commit hook (`.claude/hooks/pre-commit-check.sh`)

- Crawler code changed → `pnpm typecheck && pnpm lint && pnpm test:fast` (was: full `pnpm test`).
- Dashboard, chat, workflow, proving-ground branches: unchanged.
- Docs-only commits run nothing (unchanged).
- Prints `pre-commit: crawler (fast tier)`; on failure, the tail of the log as today.
- The slow tier is not in the hook. CLAUDE.md requires `pnpm test:slow` before committing a task
  that changes `mcp-server/src/runtime/**`, `packages/gates/**`, `packages/crawler/src/**` browser
  code or `apps/proving-ground/**`, and `pnpm test` (all) plus the other apps' suites in the close-out.
