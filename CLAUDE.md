## Monorepo Layout
- All applications (crawler, dashboard, API, frontend, and any new app) MUST live under `apps/`. Shared code goes in `packages/` (e.g. `@clinic/types`). Never propose a new top-level app directory.
- JS/TS tooling uses pnpm workspaces; Python tooling uses uv. Do not suggest replacing one with the other.
- One root pnpm workspace with one root `pnpm-lock.yaml` (constitution 2.1.0): run `pnpm install` at the repo root, never inside an app. Only `apps/proving-ground` keeps its own workspace.

## Running the apps
- Console: a React single-page app (`apps/web`, R-100: the only UI) over the dashboard's JSON API.
  `pnpm --dir apps/web build`, then `cd apps/dashboard && uv sync && uv run mudpuppy-dashboard`
  serves it at http://127.0.0.1:8765/app/; `pnpm --dir apps/web dev` (5173) and
  `pnpm --dir apps/web storybook` (6006) while building. All UI work follows skill
  `mudpuppy-react-ui`.
- Chat service (the console's assistant needs it): `MUDPUPPY_ENV=local-dev pnpm --dir apps/chat start` → 127.0.0.1:4310. `local-dev` is the owner's local test store (2026-10-22): the `portals/*-local` copies of the local test portals declare it, and `.mcp.json` starts Claude Code's `mudpuppy` servers on it; `sandbox` stays for the originals, the gates and the tests. Env: `MUDPUPPY_ENV` (required, no default: an environment a portal declares, spec 030 R-61), `MUDPUPPY_CHAT_PORT`. It uses the user's Claude Code login and starts its own `mudpuppy` MCP servers (with Chromium) per conversation.
- After running the real chat service, stop it and check for orphaned `mudpuppy` servers and Chromium processes.
- BA-facing walkthrough: `docs/how-to-use.md`.

## Feature Workflow (SDD)
1. Every roadmap item (R-xx) gets a feature branch named per the saved branch naming convention.
2. Spec → plan → tasks (speckit/po agent) before implementation. Clarify open questions first.
3. Commit per completed task group with the task IDs (e.g. T007–T011) in the message.
4. Before merging: run the `code-reviewer` agent on the branch (guideline conformance, G-31) and fix or defer its findings; tick the validation checkboxes, update roadmap/spec/ledger docs, glossary sync (add or update `docs/glossary/glossary.yaml` entries for terms the item added or changed, then `uv run mudpuppy-glossary --write` in `apps/dashboard`), run the changelog skill (changelog BEFORE merge), merge to master, delete the branch.
5. When stopping mid-work, write a session dump listing done/uncommitted/blocked tasks.


## Code Guidelines
- Read `docs/code-guidelines.md` (G-01–G-32, rated 2026-10-07) before writing code: size limits, layers, the patterns for adding a tool / page / table / gate case / pipeline step, style and tests. Cite the ids in reviews.

## Verification Before Commit
- The git pre-commit hook (`.githooks/`, install once per clone: `git config core.hooksPath .githooks`; Claude Code's hook runs the same `.githooks/checks.sh` where it is not installed) runs the suites below for the changed paths and blocks a red commit.
- Every commit (fast tier): `pnpm typecheck && pnpm lint && pnpm test:fast` in `apps/crawler` (the tests affected by your uncommitted changes, without browser end-to-end files and gates; the commit hook runs it), `pnpm check` in `apps/web` (typecheck, ESLint with the atomic-layer and styling rules, stylelint, knip, jscpd, tests; skill `frontend-architecture`), `pnpm typecheck && pnpm lint && pnpm test` in `apps/chat` and `packages/workflow`, and `uv run ruff check && uv run pytest` for Python (`uv run pytest -n auto -m 'not perf and not serial' && uv run pytest -m 'perf or serial'` in `apps/dashboard`: parallel, then the wall-clock and load-sensitive tests alone). Never commit an intermediate state that doesn't build.
- Slow tier: also run `pnpm test:slow` in `apps/crawler` (the `*.e2e.test.ts` browser files and the whole gate set) before committing a task that changes `apps/crawler/packages/mcp-server/src/runtime/**`, `apps/crawler/packages/gates/**`, `apps/crawler/packages/crawler/src/**` or `apps/proving-ground/**`.
- Close-out before merge: `pnpm test` (everything) in `apps/crawler` plus every app's suite. When `apps/web` changed, also `pnpm --dir apps/dashboard cls:ci` (layout shift on every console route, on its own seeded dashboard and port; not in the git hook).
- The gates (in `pnpm test:slow` and `pnpm test`) start the proving ground on ports 4200/4201 and scar-maker on 4400 (127.0.0.1 and 127.0.0.2), so stop anything on those ports first. `uv run pytest` also applies in `apps/proving-ground/backend`.
- A new browser test that drives a whole run is named `*.e2e.test.ts` so it lands in the slow tier.
- Do NOT edit files with Python/sed text-replacement scripts. Use the Edit tool, then re-read the file to confirm the change landed (prettier reformatting silently breaks string matches).
- Never use realistic secret shapes in tests (`sk_live_`, `ghp_`, `AKIA...`). Use obviously fake values like `test-key-not-real`.
- Before claiming a server works, kill any stale dev/watch processes first.

## Scope & Collaboration
- Do exactly what was asked. If you see further improvements, list them as suggestions instead of implementing them. Claude does all the work itself, git flow included (branch, commit, push, merge as the workflow above says).
- Do not gitignore SQLite databases or seed data unless asked.
- Domain facts: the crawler/explorer is ONE non-deterministic LLM agent, not a deterministic script. The BA agent is judged on system behavior and goal achievement, not on mock-insurer data.