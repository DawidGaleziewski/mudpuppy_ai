# ADR-0015: Four package layers and rated code guidelines

- **Status:** Accepted
- **Date:** 2026-10-07 (spec 012, R-34; guidelines accepted by the owner)

## Context

By R-34 `@mudpuppy/core` exported 31 schemas plus DB access, migrations and the tracer, and 136
files imported its barrel; the table map imported enums of the docs, chat and trace schemas, so
the core depended on features. `pipeline.ts` had 1,484 lines and the dashboard's `app.py` 2,187.
Agents edit code from partial views, so size and boundaries matter.

## Decision

- **Four layers, imports only downward** (G-07), listed in `apps/crawler/layers.json`:
  1. kernel: `core`, `fingerprint`, `obstacles` (no `@mudpuppy/*` dependency, no browser, LLM or
     DB code, G-08);
  2. models: `config`, `safety`, the feature-model packages (`docs-model`, `chat-model`), `trace`;
  3. store: DB access, table types, migrations runner;
  4. features and servers: `crawler`, `docs`, `vault`, `wireframe`, `workflow`, `mcp-server`,
     `chat`, `gates`, `reference-portal`.
- Enforcement without a new tool: a Vitest layers test reads every `package.json` and fails an
  upward dependency; ESLint `no-restricted-imports` keeps folder internals behind their
  `index.ts` (G-12). No re-export shims (G-11).
- Written guidelines G-01–G-32 in `docs/code-guidelines.md` (size limits: 400 lines a file, 80 a
  function; complexity; patterns for adding a tool, page, table, gate case or pipeline step; style;
  tests), each proposed, then rated and accepted by the owner. A change is a new rating, not a
  silent edit. The constitution and `CLAUDE.md` win over the guidelines.
- Every package and app has a short `CLAUDE.md` (G-30). The `code-reviewer` agent reviews each
  branch against the guidelines before the changelog (G-31).

## Consequences

- Good: `core` became the kernel only; new packages `store`, `trace`, `docs-model`, `chat-model`.
  The pipeline is one file per step, locked by a golden behaviour test; the dashboard is one
  router per page.
- Good: reviews cite rule ids, so findings are short and checkable.
- Bad: more packages to know; a guideline change needs the owner's rating.

## Alternatives considered

- Keep one core and only document it: does not stop the churn.
- One package per schema: too many packages.
- Re-export shims from core during the move: they keep core depending on features (allowed only
  inside one commit).
- dependency-cruiser or eslint-plugin-boundaries: new tools for a rule the package graph already
  expresses.

## Sources

- `specs/012-maintainability/research.md` R6, R7, R9, R13, R14; `spec.md` (created 2026-10-07)
- `docs/code-guidelines.md` (header, G-01–G-32)
- `CHANGELOG.md` R-34 entry (tag v1.0.11)
