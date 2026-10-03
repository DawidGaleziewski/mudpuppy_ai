## Monorepo Layout
- All applications (crawler, dashboard, API, frontend, and any new app) MUST live under `apps/`. Shared code goes in `packages/` (e.g. `@clinic/types`). Never propose a new top-level app directory.
- JS/TS tooling uses pnpm workspaces; Python tooling uses uv. Do not suggest replacing one with the other.

## Feature Workflow (SDD)
1. Every roadmap item (R-xx) gets a feature branch named per the saved branch naming convention.
2. Spec → plan → tasks (speckit/po agent) before implementation. Clarify open questions first.
3. Commit per completed task group with the task IDs (e.g. T007–T011) in the message.
4. Before merging: tick the validation checkboxes, update roadmap/spec/ledger docs, glossary sync (add or update `docs/glossary/glossary.yaml` entries for terms the item added or changed, then `uv run pathfinder-glossary --write` in `apps/dashboard`), run the changelog skill (changelog BEFORE merge), merge to master, delete the branch.
5. When stopping mid-work, write a session dump listing done/uncommitted/blocked tasks.


## Verification Before Commit
- Run `pnpm typecheck && pnpm lint && pnpm test` (and `uv run ruff check && uv run pytest` for Python) before every commit. Never commit an intermediate state that doesn't build.
- Do NOT edit files with Python/sed text-replacement scripts. Use the Edit tool, then re-read the file to confirm the change landed (prettier reformatting silently breaks string matches).
- Never use realistic secret shapes in tests (`sk_live_`, `ghp_`, `AKIA...`). Use obviously fake values like `test-key-not-real`.
- Before claiming a server works, kill any stale dev/watch processes first.

## Scope & Collaboration
- Do exactly what was asked. If you see further improvements, list them as suggestions instead of implementing them. The user is learning and wants to do some of the work.
- Do not gitignore SQLite databases or seed data unless asked.
- Domain facts: the crawler/explorer is ONE non-deterministic LLM agent, not a deterministic script. The BA agent is judged on system behavior and goal achievement, not on mock-insurer data.