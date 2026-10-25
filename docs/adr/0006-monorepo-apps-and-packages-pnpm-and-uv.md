# ADR-0006: Monorepo with `apps/` and `packages/`; pnpm for TypeScript, uv for Python

- **Status:** Accepted (lockfile rule changed on 2026-10-05, constitution 2.1.0)
- **Date:** 2026-09-25 (constitution 1.3.0)

## Context

The project started as one TypeScript workspace at the repo root. A Python dashboard was coming
(spec 003), and Python had been allowed for offline and NLP work (constitution 1.2.0,
2026-09-21). Two languages should not compete for the repo root.

## Decision

- R-03 moved the TypeScript workspace into `apps/crawler/` "so the repo root can host other apps"
  (2026-09-21).
- Constitution 1.3.0: every app, whatever its language, lives in its own `apps/<name>/` folder and
  is self-contained (manifest, lint, type and test config, tests). Shared TypeScript code lives in
  `packages/<name>/`. The repo root holds no language manifest (`package.json`, `pyproject.toml`).
- **pnpm** for TypeScript, **uv** for Python (`pyproject.toml` and `uv.lock` inside the app).
  Python is an addition, not a replacement: the crawler, MCP server, schemas and generated tests
  stay TypeScript; Python is never on the crawler's runtime path and never writes the DB except
  through the same schemas.
- Constitution 2.1.0 (2026-10-05): the TypeScript apps and `packages/*` form **one root pnpm
  workspace** with one root `pnpm-lock.yaml` (workspace configuration, not a language manifest).
  `pnpm install` runs at the root, never inside an app. An app that must stay isolated (the
  proving ground) keeps its own workspace and lockfile.

Today: `apps/` holds `chat`, `crawler`, `dashboard`, `miner`, `proving-ground`, `scar-maker`,
`web`; `packages/` holds `workflow` and `workbench-contract`.

## Consequences

- Good: a new app has an obvious home and its own tests; languages never fight over the root.
- Good: the root workspace lets `apps/chat` reuse `core`, `vault` and `docs` from the
  `apps/crawler` workspace (the reason for 2.1.0).
- Bad: two toolchains to install (Node with pnpm, Python with uv).
- Bad: the 1.3.0 rule "every app has its own lockfile" did not survive; 2.1.0 replaced it.

## Alternatives considered

- One lockfile per package (`sharedWorkspaceLockfile: false`): tried in spec 010 T003, it made 14
  lockfiles, fitting neither reading of the rule; reverted.
- The chat service as a package inside `apps/crawler`: rejected by the user (spec 010 R3).
- Replacing pnpm with uv or the other way round: ruled out (`CLAUDE.md`: "Do not suggest replacing
  one with the other").

## Sources

- `.specify/memory/constitution.md` Technical Constraints ▸ App layout, Python tooling; Sync Impact
  Report 2.1.0; 1.2.0 (git `ab85a5f1`) and 1.3.0 (git `1ce2d207`) Sync Impact Reports
- `CHANGELOG.md` ("Moved the TypeScript workspace into `apps/crawler/`", commit b1639fc)
- `specs/010-acp-chat-orchestrator/research.md` R3, R10
- `CLAUDE.md` (Monorepo Layout)
